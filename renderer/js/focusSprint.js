"use strict";

/* Lightweight, persistent Focus Sprint timer. The saved deadline means
 * the display catches up correctly after sleep or an app reload. */
(function () {
    const STORAGE_KEY = "jarvis_focus_sprint_v1";
    const MAX_MINUTES = 12 * 60;
    const els = {};
    let state = null;
    let tickHandle = null;

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            if (saved && ["running", "paused", "complete", "cancelled"].includes(saved.status)) state = saved;
        } catch (_) { state = null; }
    }
    function save() {
        try { state ? localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) : localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
    function format(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    function remainingMs() {
        if (!state) return 0;
        return state.status === "running" ? Math.max(0, state.deadline - Date.now()) : Math.max(0, state.remainingMs || 0);
    }
    function finish() {
        if (!state || state.status !== "running") return;
        state.status = "complete";
        state.remainingMs = 0;
        state.completedAt = Date.now();
        save();
        render();
        try { window.VoiceEngine?.speak?.("Focus sprint complete. Take a short break."); } catch (_) {}
        window.dispatchEvent(new CustomEvent("jarvis:focus-sprint", { detail: { status: "complete" } }));
    }
    function render() {
        const panel = els.panel;
        if (!panel) return;
        panel.hidden = false;
        const active = state && ["running", "paused"].includes(state.status);
        const remaining = remainingMs();
        const total = state?.durationMs || 25 * 60 * 1000;
        if (els.timer) els.timer.textContent = active ? format(remaining) : state?.status === "complete" ? "00:00" : "25:00";
        if (els.duration && state?.durationMs && document.activeElement !== els.duration) {
            els.duration.value = String(Math.max(1, Math.round(state.durationMs / 60000)));
        }
        if (els.label) {
            const labels = { running: "FOCUS IN PROGRESS", paused: "SPRINT PAUSED", complete: "SPRINT COMPLETE", cancelled: "READY WHEN YOU ARE" };
            els.label.textContent = labels[state?.status] || "READY WHEN YOU ARE";
        }
        if (els.fill) els.fill.style.width = `${Math.max(0, Math.min(100, active ? (1 - remaining / total) * 100 : state?.status === "complete" ? 100 : 0))}%`;
        if (els.start) els.start.hidden = Boolean(active);
        if (els.durationControl) els.durationControl.hidden = Boolean(active);
        if (els.pause) els.pause.hidden = state?.status !== "running";
        if (els.resume) els.resume.hidden = state?.status !== "paused";
        if (els.cancel) els.cancel.hidden = !active;
        panel.dataset.status = state?.status || "ready";
    }
    function start(minutes = 25) {
        const durationMs = Math.max(1, Math.min(MAX_MINUTES, Number(minutes) || 25)) * 60 * 1000;
        state = { status: "running", durationMs, remainingMs: durationMs, startedAt: Date.now(), deadline: Date.now() + durationMs };
        if (els.duration) els.duration.value = String(Math.round(durationMs / 60000));
        save(); render(); ensureTicker();
        return { handled: true, source: "focus-sprint", response: `Focus sprint started for ${Math.round(durationMs / 60000)} minutes. Say “pause focus sprint” or “cancel focus sprint” any time.` };
    }
    function pause() {
        if (!state || state.status !== "running") return { handled: true, source: "focus-sprint", response: "There is no running focus sprint to pause." };
        state.remainingMs = remainingMs(); state.status = "paused"; delete state.deadline; save(); render();
        return { handled: true, source: "focus-sprint", response: `Focus sprint paused with ${format(state.remainingMs)} remaining.` };
    }
    function resume() {
        if (!state || state.status !== "paused") return { handled: true, source: "focus-sprint", response: "There is no paused focus sprint to resume." };
        state.status = "running"; state.deadline = Date.now() + state.remainingMs; save(); render(); ensureTicker();
        return { handled: true, source: "focus-sprint", response: `Focus sprint resumed with ${format(state.remainingMs)} remaining.` };
    }
    function cancel() {
        if (!state || !["running", "paused"].includes(state.status)) return { handled: true, source: "focus-sprint", response: "There is no active focus sprint." };
        state.status = "cancelled"; delete state.deadline; save(); render();
        return { handled: true, source: "focus-sprint", response: "Focus sprint cancelled." };
    }
    function status() {
        if (!state || !["running", "paused"].includes(state.status)) return { handled: true, source: "focus-sprint", response: state?.status === "complete" ? "Your last focus sprint is complete." : "No focus sprint is active. Say ‘start focus sprint’ for a 25 minute session." };
        return { handled: true, source: "focus-sprint", response: `Focus sprint ${state.status}. ${format(remainingMs())} remaining.` };
    }
    function ensureTicker() {
        if (tickHandle) return;
        tickHandle = setInterval(() => {
            if (state?.status !== "running") { clearInterval(tickHandle); tickHandle = null; return; }
            if (remainingMs() <= 0) { finish(); clearInterval(tickHandle); tickHandle = null; return; }
            render();
        }, 1000);
    }
    function handle(command) {
        const text = String(command || "").toLowerCase();
        if (!/focus\s*(?:sprint|timer|session)|फोकस\s*(?:स्प्रिंट|टाइमर)/i.test(text)) return { handled: false };
        if (/\b(pause|hold)\b|रोक|पॉज़/.test(text)) return pause();
        if (/\b(resume|continue)\b|जारी|फिर से शुरू/.test(text)) return resume();
        if (/\b(cancel|stop)\b|रद्द|बंद करो/.test(text)) return cancel();
        if (/\b(status|remaining|left)\b|कितना बाकी/.test(text)) return status();
        const match = text.match(/(?:^|\s)(\d{1,3})\s*(minutes?|mins?|hours?|hrs?|मिनट|घंटे|घंटा)(?=$|\s|[.,!?])/);
        const amount = match ? Number(match[1]) * (/hour|hr|घंट/.test(match[2]) ? 60 : 1) : 25;
        return start(amount);
    }
    function bindUI() {
        els.panel = document.getElementById("focusSprintPanel");
        els.timer = document.getElementById("focusSprintTimer");
        els.label = document.getElementById("focusSprintLabel");
        els.fill = document.getElementById("focusSprintProgress");
        els.start = document.getElementById("focusSprintStart");
        els.pause = document.getElementById("focusSprintPause");
        els.resume = document.getElementById("focusSprintResume");
        els.cancel = document.getElementById("focusSprintCancel");
        els.durationControl = document.getElementById("focusSprintDurationControl");
        els.duration = document.getElementById("focusSprintDuration");
        els.duration?.addEventListener("input", () => els.duration.setCustomValidity(""));
        els.start?.addEventListener("click", () => {
            if (els.duration && !els.duration.checkValidity()) {
                els.duration.reportValidity();
                els.duration.focus();
                return;
            }
            start(els.duration?.valueAsNumber || 25);
        });
        els.pause?.addEventListener("click", pause);
        els.resume?.addEventListener("click", resume);
        els.cancel?.addEventListener("click", cancel);
        load(); render();
        if (state?.status === "running") {
            if (remainingMs() <= 0) finish(); else ensureTicker();
        }
        document.addEventListener("visibilitychange", () => { if (!document.hidden && state?.status === "running" && remainingMs() <= 0) finish(); });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindUI, { once: true });
    else bindUI();
    window.JARVISFocusSprint = Object.freeze({ handle, start, pause, resume, cancel, status, getState: () => state && ({ ...state, remainingMs: remainingMs() }) });
})();
