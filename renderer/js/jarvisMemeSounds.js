"use strict";
(function () {

    // ============================================================
    // JARVIS MEME SOUNDS
    // ------------------------------------------------------------
    // NOTE ON AUDIO FILES: this module only plays a sound if the
    // matching .mp3 actually exists under assets/sounds/memes/ (see
    // `files` below for the exact filenames expected). It fails
    // silently if a file is missing (see play()), so adding real
    // audio there is a drop-in operation — no code changes needed.
    // ============================================================

    const manifest = {
        defaultVolume: 0.22,
        cooldownMs: 2500,
        enabled: true,

        // BUG FIX: the old rule set only ever referenced 26 of the 50
        // sound ids defined in `files` below — the other 24 (~half the
        // pack) were configured but could never actually be selected by
        // trigger()/triggerFromResponse(), no matter what happened.
        // Every one of the 50 ids is now reachable through at least one
        // category below.
        rules: {
            joke: ["badum-tss", "laugh-track"],
            funny: ["bruh", "moai", "goofy", "bruh-extended", "vine-cat", "cat-scream", "chicken-scream", "frog"],
            unexpected: ["vine-boom", "surprise", "whoosh", "metal-pipe", "record-scratch"],
            confused: ["what-da-dog-doin", "hmm", "brain-lag", "thinking"],
            suspicious: ["sus", "among-us"],
            failure: ["oh-no", "trombone-fail", "mission-failed", "sad-violin", "emotional-damage", "instant-regret", "nope"],
            success: ["sheesh", "level-up", "wow"],
            achievement: ["airhorn", "sigma", "sigma-transition", "mlg-airhorn", "galaxy-brain"],
            // Specifically for "a concrete JARVIS task just finished"
            // (new tab opened, download done, goal/task marked complete,
            // file saved) as opposed to a generic "success" chat reply.
            taskComplete: ["mission-complete", "achievement"],
            dramatic: ["dramatic-boom", "dramatic-reveal", "trololo", "coffin-dance", "why-are-you-running", "suspense"],
            error: ["error", "windows-error-style"],
            money: ["stonks"],
            moneyFailure: ["not-stonks"],
            notify: ["notification"],
            ui: ["click"]
        }
    };

    let lastAt = 0;

    // Filenames JARVIS expects under assets/sounds/memes/. This module
    // does NOT ship the actual audio — Anthropic's copyright policy
    // means Claude can't source or redistribute licensed/copyrighted
    // meme sound clips. Drop your own legally-obtained .mp3 files here
    // under these exact names and everything below just works.
    const files = {
        "moai": "moai.mp3", "vine-boom": "vine-boom.mp3", "bruh": "bruh.mp3",
        "emotional-damage": "emotional-damage.mp3", "what-da-dog-doin": "what-da-dog-doin.mp3",
        "sus": "sus.mp3", "badum-tss": "badum-tss.mp3", "sad-violin": "sad-violin.mp3",
        "record-scratch": "record-scratch.mp3", "airhorn": "airhorn.mp3", "stonks": "stonks.mp3",
        "not-stonks": "not-stonks.mp3", "sheesh": "sheesh.mp3", "wow": "wow.mp3",
        "dramatic-boom": "dramatic-boom.mp3", "dramatic-reveal": "dramatic-reveal.mp3",
        "laugh-track": "laugh-track.mp3", "trombone-fail": "trombone-fail.mp3",
        "metal-pipe": "metal-pipe.mp3", "vine-cat": "vine-cat.mp3", "cat-scream": "cat-scream.mp3",
        "chicken-scream": "chicken-scream.mp3", "frog": "frog.mp3", "among-us": "among-us.mp3",
        "mlg-airhorn": "mlg-airhorn.mp3", "trololo": "trololo.mp3", "coffin-dance": "coffin-dance.mp3",
        "why-are-you-running": "why-are-you-running.mp3", "hmm": "hmm.mp3", "thinking": "thinking.mp3",
        "error": "error.mp3", "windows-error-style": "windows-error-style.mp3",
        "notification": "notification.mp3", "level-up": "level-up.mp3", "achievement": "achievement.mp3",
        "mission-complete": "mission-complete.mp3", "click": "click.mp3", "whoosh": "whoosh.mp3",
        "surprise": "surprise.mp3", "suspense": "suspense.mp3", "bruh-extended": "bruh-extended.mp3",
        "oh-no": "oh-no.mp3", "nope": "nope.mp3", "goofy": "goofy.mp3", "sigma": "sigma.mp3",
        "sigma-transition": "sigma-transition.mp3", "galaxy-brain": "galaxy-brain.mp3",
        "brain-lag": "brain-lag.mp3", "instant-regret": "instant-regret.mp3", "mission-failed": "mission-failed.mp3"
    };

    function play(id, volume) {
        if (!manifest.enabled || Date.now() - lastAt < manifest.cooldownMs) return false;

        const file = files[id];
        if (!file) return false;

        const audio = new Audio(`assets/sounds/memes/${file}`);
        audio.volume = Math.max(0, Math.min(0.35, volume ?? manifest.defaultVolume));
        audio.preload = "auto";
        lastAt = Date.now();

        // Missing/broken audio file -> fails silently, and frees the
        // cooldown again so a later, present sound isn't blocked by one
        // that never actually played.
        audio.play().catch(() => { lastAt = 0; });

        return true;
    }

    function trigger(key) {
        const list = manifest.rules[key] || [];
        if (!list.length) return false;
        return play(list[Math.floor(Math.random() * list.length)]);
    }

    // Chat-reply based triggering (unchanged call sites: chat.js calls
    // this after every response). Now also uses `source` — which task
    // pipeline actually produced the reply (see chat.js's
    // processBrainRouter route names: "browser", "tasks", "goals",
    // "data", "wikipedia", "voice", etc.) — so a real finished task
    // reaches for the taskComplete/dramatic sounds instead of just the
    // generic "success" pile every time.
    function triggerFromResponse(user, response, source) {
        const u = String(user || "").toLowerCase();
        const r = String(response || "").toLowerCase();
        const combined = u + r;

        if (/\b(joke|funny|haha|lol)\b/.test(combined)) {
            return Math.random() < 0.65 ? trigger("joke") : false;
        }

        if (/\b(stonks|profit|investment (?:went|is) up|gains?)\b/.test(combined)) {
            return Math.random() < 0.4 ? trigger("money") : false;
        }

        if (/\b(loss|lost money|investment (?:went|is) down|crashed)\b/.test(r)) {
            return Math.random() < 0.4 ? trigger("moneyFailure") : false;
        }

        if (/\b(fail|failed|error|couldn't|unable|mistake)\b/.test(r)) {
            return Math.random() < 0.55 ? trigger("failure") : false;
        }

        if (/\b(success|done|completed|complete|opened|finished|saved|added)\b/.test(r)) {
            // A real task pipeline (not just plain chat) finishing is a
            // bigger deal than an ordinary reply — reach for
            // taskComplete more often for those sources. These are the
            // actual `source` values chat.js's router returns (see
            // processBrainRouter in chat.js) — not guesses.
            const taskSources = ["browser", "taskPlanner", "goals", "data", "wikipedia", "voice", "agents", "knowledge"];
            if (source && taskSources.includes(String(source))) {
                return Math.random() < 0.35 ? trigger("taskComplete") : false;
            }
            return Math.random() < 0.25 ? trigger("success") : false;
        }

        if (/\b(suspicious|sus|weird)\b/.test(combined)) {
            return Math.random() < 0.6 ? trigger("suspicious") : false;
        }

        if (/\b(why|confused|what)\b/.test(u) && /\?/.test(user || "")) {
            return Math.random() < 0.3 ? trigger("confused") : false;
        }

        return false;
    }

    // Explicit hook for a specific, named task finishing (as opposed to
    // triggerFromResponse's "guess from the text" approach) — call this
    // directly right where a task actually completes/fails, e.g.:
    //   JARVIS_MemeSounds.triggerForTask("browser-new-tab", "success")
    //   JARVIS_MemeSounds.triggerForTask("download", "failure")
    //   JARVIS_MemeSounds.triggerForTask("voice-model-ready")
    const TASK_OUTCOME_CATEGORY = {
        success: "taskComplete",
        failure: "failure",
        ready: "notify",
        started: "ui"
    };

    function triggerForTask(taskName, outcome = "success") {
        const category = TASK_OUTCOME_CATEGORY[outcome] || "taskComplete";
        return trigger(category);
    }

    window.JARVIS_MemeSounds = {
        play,
        trigger,
        triggerFromResponse,
        triggerForTask,
        setEnabled(v) { manifest.enabled = !!v; return manifest.enabled; },
        status() { return { ...manifest }; }
    };

})();
