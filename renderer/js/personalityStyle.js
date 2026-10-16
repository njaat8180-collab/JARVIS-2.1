"use strict";

// ==========================================================
// JARVIS — Personality Response Style UI
// renderer/js/personalityStyle.js
//
// Wires the #personalityStyleSelect dropdown (index.html) to the
// main-process ConsciousnessLayer's response-style API
// (src/ai/consciousness.js: setResponseStyle/getResponseStyle),
// exposed here via window.jarvis.ai.setPersonalityStyle/
// getPersonalityStyle (preload.js).
//
// Additive only: if window.jarvis.ai isn't available for any reason,
// this quietly does nothing — it cannot break chat/voice/anything else.
// Chat/voice commands ("switch personality to witty", "be more formal")
// go through renderer/js/chat.js's own route and call the same IPC
// method directly; this file only keeps the dropdown in sync and lets
// picking from the dropdown do the same thing chat commands do.
// ==========================================================

(function () {
    const LABELS = {
        professional: "🎭 Professional",
        friendly: "🎭 Friendly",
        witty: "🎭 Witty",
        concise: "🎭 Concise",
        formal: "🎭 Formal",
        focus: "🎯 Focus"
    };

    function getSelects() {
        return [document.getElementById("personalityStyleSelect"), document.getElementById("settingsPersonality")].filter(Boolean);
    }

    function syncStyleUI(style) {
        if (!LABELS[style]) return;
        document.body.dataset.personalityStyle = style;
        getSelects().forEach((select) => { select.value = style; });
        const voice = window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent;
        voice?.setFocusMode?.(style === "focus");
    }

    async function syncFromState() {
        if (!getSelects().length) return;

        if (!window.jarvis || !window.jarvis.ai || typeof window.jarvis.ai.getPersonalityStyle !== "function") {
            // No bridge available (e.g. preload failed to load) — leave
            // the dropdown at its default "professional" option and stop;
            // nothing else in the app depends on this succeeding.
            return;
        }

        try {
            const result = await window.jarvis.ai.getPersonalityStyle();
            const style = result && (result.style || (result.data && result.data.style));
            if (style && LABELS[style]) {
                syncStyleUI(style);
            }
        } catch (error) {
            console.warn("[PersonalityStyle] Could not read current style:", error && error.message);
        }
    }

    async function applyStyle(style) {
        if (!LABELS[style]) return;

        if (!window.jarvis || !window.jarvis.ai || typeof window.jarvis.ai.setPersonalityStyle !== "function") {
            console.warn("[PersonalityStyle] window.jarvis.ai.setPersonalityStyle not available.");
            return;
        }

        try {
            const result = await window.jarvis.ai.setPersonalityStyle(style);
            if (result?.success === false) return;
            syncStyleUI(style);
            document.dispatchEvent(new CustomEvent("jarvis:personality-style-changed", { detail: { style } }));

            // Keep the previously-unused IdentityManager field (renderer/
            // js/brain/consciousness/identity.js) in sync too.
            if (window.Identity && window.Identity.state) {
                window.Identity.state.personality = style;
            }
        } catch (error) {
            console.warn("[PersonalityStyle] Failed to set style:", error && error.message);
        }
    }

    function init() {
        const selects = getSelects();
        if (!selects.length) return;

        const headerSelect = document.getElementById("personalityStyleSelect");
        headerSelect?.addEventListener("change", () => applyStyle(headerSelect.value));

        // If the chat/voice route (renderer/js/chat.js) changes the style
        // via a spoken/typed command, keep this dropdown visually in sync.
        document.addEventListener("jarvis:personality-style-changed", (event) => {
            const style = event && event.detail && event.detail.style;
            if (style && LABELS[style]) {
                syncStyleUI(style);
            }
        });

        syncFromState();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
