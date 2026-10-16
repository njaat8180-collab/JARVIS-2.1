"use strict";

/* ==========================================================
   JARVIS Consciousness Adapter
   ----------------------------------------------------------
   Bridges the restored old consciousness engine (identity.js,
   emotionEngine.js, internalMonologue.js, metacognition.js,
   consciousnessController.js) to the shape the rest of the app
   already expects:
     - renderer/js/consciousness.js (HUD) calls getPublicState()
     - renderer/js/chat.js calls recordTurn(userMessage, response)
   Fully local. No IPC, no main process, no API key of any kind.

   Every call into an old module is defensive (try/catch + method
   existence checks) because the restored files come from an
   older, partially-inconsistent build — this adapter's job is to
   never let a missing/renamed method break the HUD or the chat.
========================================================== */

(function () {

    function safeCall(obj, methodNames, fallback) {
        if (!obj) return fallback;
        const names = Array.isArray(methodNames) ? methodNames : [methodNames];
        for (const name of names) {
            if (typeof obj[name] === "function") {
                try {
                    return obj[name]();
                } catch (error) {
                    console.debug(`[ConsciousnessAdapter] ${name}() failed:`, error);
                    return fallback;
                }
            }
        }
        return fallback;
    }

    // Rolling thought stream kept here (the old internalMonologue only
    // tracks a single "current thought", not a history) so the HUD's
    // thought-stream list still has something to show.
    const thoughtStream = [];
    const MAX_THOUGHT_STREAM = 12;

    function pushThought(text, mode) {
        if (!text) return;
        thoughtStream.push({ text: String(text), mode: mode || "aware", at: Date.now() });
        if (thoughtStream.length > MAX_THOUGHT_STREAM) thoughtStream.shift();
    }

    function ensureBooted() {
        if (window.ConsciousnessController && !window.ConsciousnessController.initialized) {
            try { window.ConsciousnessController.init(); } catch (error) {
                console.debug("[ConsciousnessAdapter] controller init failed:", error);
            }
        }
    }

    function getPublicState() {
        ensureBooted();

        const identity = window.Identity || window.JARVISIdentity;
        const emotion = window.EmotionEngine;
        const monologue = window.InternalMonologue;

        const identityState = safeCall(identity, ["getState"], {}) || {};
        const mood = safeCall(emotion, ["calculateMood"], null);
        const dominant = mood?.dominant || safeCall(emotion, ["getDominantEmotion"], null);
        const monologueStatus = safeCall(monologue, ["getStatus"], {}) || {};
        const currentThought = safeCall(monologue, ["getCurrentThought"], null);

        if (currentThought && currentThought.text) {
            pushThought(currentThought.text, identityState.status);
        }

        const arousal = typeof mood?.arousal === "number" ? mood.arousal : 0.5;
        const valence = typeof mood?.valence === "number" ? mood.valence : 0.5;

        return {
            mode: identityState.status || "aware",
            mood: dominant || "calm",
            focus: monologueStatus.running ? "thinking" : "ready",
            lastLanguage: identityState.language || "en",
            continuity: window.__jarvisConsciousnessTurns || 0,
            lastThought: (currentThought && currentThought.text) || "Monitoring conversation and system context…",
            confidence: (identityState.traits && typeof identityState.traits.confidence === "number")
                ? identityState.traits.confidence / 100
                : 0.8,
            awarenessLevel: arousal,
            activeGoal: identityState.activeGoal || null,
            energy: valence,
            userRelationship: identityState.userRelationship || "new acquaintance",
            trustLevel: (identityState.traits && typeof identityState.traits.loyalty === "number")
                ? identityState.traits.loyalty / 100
                : 0.5,
            thoughtStream: thoughtStream.slice()
        };
    }

    function recordTurn(userMessage, response) {
        ensureBooted();

        window.__jarvisConsciousnessTurns = (window.__jarvisConsciousnessTurns || 0) + 1;

        const emotion = window.EmotionEngine;
        const monologue = window.InternalMonologue;

        try {
            if (emotion && typeof emotion.appraiseThought === "function") {
                emotion.appraiseThought(userMessage);
            }
        } catch (error) {
            console.debug("[ConsciousnessAdapter] appraiseThought failed:", error);
        }

        try {
            if (monologue && typeof monologue.enqueue === "function") {
                monologue.enqueue({ text: response, mode: "responding" });
            }
        } catch (error) {
            console.debug("[ConsciousnessAdapter] monologue.enqueue failed:", error);
        }

        pushThought(response, "responding");

        return getPublicState();
    }

    window.JARVISConsciousnessLocal = { getPublicState, recordTurn };

    console.log("✅ Consciousness Adapter Loaded (local, no API key)");
})();
