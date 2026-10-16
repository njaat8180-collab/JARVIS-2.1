"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — CONVERSATION MODE
 * renderer/js/voice/conversationMode.js
 * ============================================================
 *
 * FIX: "har sentence ke baad wake word bolna padta hai"
 *
 * Wake word sirf CONVERSATION SHURU karne ke liye chahiye.
 * Uske baad JARVIS continuous sunta hai:
 *
 *   User: "Hey Jarvis"          ← wake word (sirf ek baar)
 *   JARVIS: "Hello! Kya scene?"
 *   User: "YouTube kholo"       ← NO wake word needed
 *   JARVIS: "Opening YouTube..."
 *   User: "usko band karo"      ← NO wake word needed
 *   JARVIS: "Closing YouTube..."
 *   User: "..."                 ← silence
 *   (45 sec idle)
 *   → Conversation mode OFF → wake word needed again
 *
 * Every new utterance RESETS the idle timer. Toggle: Ctrl+Shift+C
 * ============================================================
 */

var ConversationMode = (function () {

    var DEFAULT_WINDOW_MS = 45000; // 45 seconds

    var state = {
        active: false,        // conversation currently in progress
        enabled: true,        // user's master preference
        turns: 0,             // exchanges in current conversation
        windowMs: DEFAULT_WINDOW_MS,
        timerHandle: null,
        startedAt: null,
        lastUtteranceAt: null
    };

    var STATUS_CALLBACKS = [];

    /* ------------------------------------------------------ */
    /* INTERNAL                                                */
    /* ------------------------------------------------------ */

    function getVoiceEngine() {
        return (typeof window !== "undefined" && window.VoiceEngine) ? window.VoiceEngine : null;
    }

    function getWakeEngine() {
        return (typeof window !== "undefined" && window.WakeWordEngine) ? window.WakeWordEngine : null;
    }

    function clearTimer() {
        if (state.timerHandle) {
            clearTimeout(state.timerHandle);
            state.timerHandle = null;
        }
    }

    function setStatus(s) {
        STATUS_CALLBACKS.forEach(function (cb) {
            try { cb(s, getSnapshot()); } catch (_) {}
        });
    }

    function getSnapshot() {
        return {
            active: state.active,
            enabled: state.enabled,
            turns: state.turns,
            windowMs: state.windowMs,
            startedAt: state.startedAt,
            lastUtteranceAt: state.lastUtteranceAt
        };
    }

    /* ------------------------------------------------------ */
    /* TIMER — idle timeout ends the conversation             */
    /* ------------------------------------------------------ */

    function armTimer() {
        clearTimer();
        state.timerHandle = setTimeout(function () {
            endConversation("idle_timeout");
        }, state.windowMs);
    }

    /* ------------------------------------------------------ */
    /* PUBLIC                                                  */
    /* ------------------------------------------------------ */

    /**
     * A conversation just started (wake word detected or manual start).
     * Enters conversation mode; JARVIS will keep listening after replies.
     */
    function startConversation(opts) {
        if (!state.enabled) return { started: false, reason: "disabled" };
        var voice = getVoiceEngine();
        if (!voice) return { started: false, reason: "no_voice_engine" };

        state.active = true;
        state.turns = 0;
        state.startedAt = Date.now();
        state.lastUtteranceAt = Date.now();

        // Keep the wake word engine suspended while we converse
        var wake = getWakeEngine();
        if (wake && typeof wake.suspend === "function") {
            try { wake.suspend(); } catch (_) {}
        }

        armTimer();
        setStatus("active");
        console.log("[ConversationMode] ON — wake word ab zaroori NAHI (window: " + (state.windowMs / 1000) + "s)");
        return { started: true };
    }

    /**
     * JARVIS just finished replying. Keep listening without wake word.
     * Called from chat.js on messageComplete (voice source).
     */
    function afterJarvisReplied() {
        if (!state.enabled) return { continued: false, reason: "disabled" };
        if (!state.active) {
            // Auto-start conversation mode if a voice exchange just happened
            // (covers the very first wake-word command too)
            var r = startConversation();
            if (!r.started) return { continued: false, reason: r.reason };
        }

        state.turns++;
        state.lastUtteranceAt = Date.now();
        armTimer(); // extend the window on every exchange

        var voice = getVoiceEngine();
        if (voice && !voice.muted && !voice.isListening && !voice.isSpeaking) {
            try {
                voice.startListening();
                setStatus("listening");
            } catch (e) {
                console.warn("[ConversationMode] auto-listen failed:", e.message);
            }
        }
        return { continued: true, turns: state.turns };
    }

    /**
     * User just spoke (a new utterance arrived) — extend the window.
     */
    function onUserUtterance() {
        if (!state.active) return;
        state.lastUtteranceAt = Date.now();
        armTimer();
    }

    /**
     * End the conversation — back to ambient wake-word mode.
     */
    function endConversation(reason) {
        if (!state.active) return;
        state.active = false;
        clearTimer();
        var wake = getWakeEngine();
        if (wake && typeof wake.resume === "function") {
            try { wake.resume(); } catch (_) {}
        }
        setStatus("ended");
        console.log("[ConversationMode] OFF (" + (reason || "manual") + ") — turns: " + state.turns + ", wake word wapas active");
    }

    function isActive() { return state.active; }
    function isEnabled() { return state.enabled; }

    /**
     * Master toggle (Ctrl+Shift+C). When disabled, behaves exactly
     * like the old flow: wake word needed before every command.
     */
    function toggle() {
        state.enabled = !state.enabled;
        if (!state.enabled && state.active) endConversation("disabled");
        else if (state.enabled) console.log("[ConversationMode] enabled — agla wake word se conversation start hoga");
        return state.enabled;
    }

    function setWindowMs(ms) {
        state.windowMs = Math.max(10000, Number(ms) || DEFAULT_WINDOW_MS); // min 10s
    }

    function onStatus(cb) {
        if (typeof cb === "function") STATUS_CALLBACKS.push(cb);
    }

    /* ------------------------------------------------------ */
    /* KEYBOARD + UI WIRING                                    */
    /* ------------------------------------------------------ */

    function wireUI() {
        if (typeof document === "undefined") return;

        document.addEventListener("keydown", function (e) {
            if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
                e.preventDefault();
                var on = toggle();
                if (typeof window !== "undefined" && window.JARVISCinemaFx && window.JARVISCinemaFx.toast) {
                    window.JARVISCinemaFx.toast("CONVERSATION MODE: " + (on ? "ON" : "OFF"));
                }
            }
        });

        // NOTE: this used to inject a "CONVO: ON/OFF" status pill into the
        // chat header. That element has no equivalent in the base UI, so
        // it was removed during the UI migration. The Ctrl+Shift+C toggle
        // above still works; it just isn't mirrored in a visible badge.
    }

    function updatePill(pill) {
        if (!pill) pill = document.getElementById("conversationModePill");
        if (!pill) return;
        pill.textContent = state.enabled ? (state.active ? "CONVO: LIVE" : "CONVO: AUTO") : "CONVO: OFF";
        pill.className = "conversation-mode-pill" +
            (state.active ? " conversation-mode-active" : "") +
            (state.enabled ? "" : " conversation-mode-off");
    }

    // Keep the pill fresh on status changes
    onStatus(function () {
        try { updatePill(); } catch (_) {}
    });

    /* ------------------------------------------------------ */
    /* BOOT                                                    */
    /* ------------------------------------------------------ */

    function boot() {
        if (typeof document === "undefined") return;
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { setTimeout(wireUI, 2000); }, { once: true });
        } else {
            setTimeout(wireUI, 2000);
        }
        console.log("[ConversationMode] loaded — wake word sirf conversation start ke liye chahiye");
    }

    boot();

    return {
        startConversation: startConversation,
        afterJarvisReplied: afterJarvisReplied,
        onUserUtterance: onUserUtterance,
        endConversation: endConversation,
        isActive: isActive,
        isEnabled: isEnabled,
        toggle: toggle,
        setWindowMs: setWindowMs,
        onStatus: onStatus,
        getStatus: getSnapshot,
        _state: state
    };
})();

if (typeof window !== "undefined") window.JARVISConversationMode = ConversationMode;
if (typeof module !== "undefined" && module.exports) module.exports = ConversationMode;
