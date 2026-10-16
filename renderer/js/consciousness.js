"use strict";

/* JARVIS Consciousness HUD: visualizes the engineered continuity/self-state. */
(function () {
    const $ = id => document.getElementById(id);
    const els = {
        mode: $("consciousnessMode"), mood: $("consciousnessMood"), focus: $("consciousnessFocus"),
        language: $("consciousnessLanguage"), continuity: $("consciousnessContinuity"),
        thought: $("consciousnessThought"), confidence: $("consciousnessConfidence"),
        awareness: $("consciousnessAwareness"), goal: $("consciousnessGoal"),
        energy: $("consciousnessEnergy"), rapport: $("consciousnessRapport"),
        energyMeter: $("consciousnessEnergyMeter"), trustMeter: $("consciousnessTrustMeter"),
        thoughtStream: $("consciousnessThoughtStream")
    };
    if (!els.mode) return;

    function timeLabel(ms) {
        if (!ms) return "";
        const diff = Math.max(0, Date.now() - ms);
        if (diff < 15000) return "just now";
        if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
        if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
        return `${Math.round(diff / 3600000)}h ago`;
    }

    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function renderThoughtStream(thoughts) {
        if (!els.thoughtStream) return;
        if (!Array.isArray(thoughts) || !thoughts.length) {
            els.thoughtStream.innerHTML = "";
            return;
        }

        // Most recent first, so the newest thought is always visible without scrolling.
        els.thoughtStream.innerHTML = thoughts
            .slice()
            .reverse()
            .map(t => `<li><time>${escapeHTML(timeLabel(t.at))} · ${escapeHTML(String(t.mode || "").toUpperCase())}</time>${escapeHTML(t.text || "")}</li>`)
            .join("");
    }

    function render(state) {
        if (!state) return;
        if (els.mode) els.mode.textContent = String(state.mode || "aware").toUpperCase();
        if (els.mood) els.mood.textContent = String(state.mood || "calm").toUpperCase();
        if (els.focus) els.focus.textContent = String(state.focus || "ready").toUpperCase();
        if (els.language) els.language.textContent = String(state.lastLanguage || "en").toUpperCase();
        if (els.continuity) els.continuity.textContent = String(state.continuity || 0);
        if (els.thought) els.thought.textContent = state.lastThought || "Monitoring conversation and system context…";
        if (els.confidence) els.confidence.style.width = `${Math.round((Number(state.confidence) || 0) * 100)}%`;
        if (els.awareness) els.awareness.textContent = `${Math.round((Number(state.awarenessLevel) || 0) * 100)}%`;
        if (els.goal) els.goal.textContent = state.activeGoal ? String(state.activeGoal).toUpperCase() : "NONE";
        if (els.energy) els.energy.textContent = `${Math.round((Number(state.energy) || 0) * 100)}%`;
        if (els.energyMeter) els.energyMeter.style.width = `${Math.round((Number(state.energy) || 0) * 100)}%`;
        if (els.rapport) els.rapport.textContent = String(state.userRelationship || "new acquaintance").toUpperCase();
        if (els.trustMeter) els.trustMeter.style.width = `${Math.round((Number(state.trustLevel) || 0) * 100)}%`;
        renderThoughtStream(state.thoughtStream);
    }

    async function refresh() {
        try {
            const result = await window.jarvis?.ai?.consciousnessState?.();
            const state = result?.data?.consciousness || result?.consciousness;
            if (result?.success && state) {
                render(state);
                return;
            }
            if (window.JARVISConsciousnessLocal?.getPublicState) {
                render(window.JARVISConsciousnessLocal.getPublicState());
            }
        } catch (error) { console.debug("Consciousness HUD refresh:", error); }
    }

    window.JARVISConsciousnessHUD = { render, refresh };
    refresh();
    setInterval(refresh, 1500);
})();
