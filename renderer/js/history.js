// ============================================
// JARVIS PRO MAX
// COMMAND HISTORY ENGINE
// ============================================

"use strict";

const historyPanel = document.getElementById("historyList");
const HISTORY_KEY = "JARVIS_COMMAND_HISTORY_V2";
const HISTORY_RETENTION_KEY = "JARVIS_COMMAND_HISTORY_RETENTION_DAYS_V1";
const HISTORY_LIMIT = 100;

function getTime(timestamp = Date.now()) {
    return new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
}

function readHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const value = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(value)) return [];
        const days = Math.max(0, Number(localStorage.getItem(HISTORY_RETENTION_KEY) ?? 30) || 0);
        const retained = days ? value.filter(entry => Date.now() - Number(entry.timestamp || 0) <= days * 86400000) : value;
        if (retained.length !== value.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(retained.slice(-HISTORY_LIMIT)));
        return retained.slice(-HISTORY_LIMIT);
    } catch (_) {
        return [];
    }
}

function writeHistory(items) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(-HISTORY_LIMIT)));
    } catch (_) {}
}

function renderItem(entry, prepend = true) {
    if (!historyPanel || !entry) return;

    const item = document.createElement("div");
    item.className = "history-item";
    item.dataset.historyId = String(entry.id || "");

    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = getTime(entry.timestamp);

    const text = document.createElement("span");
    text.className = "history-text";
    text.textContent = String(entry.text || "");

    const state = document.createElement("small");
    state.className = "history-outcome";
    state.textContent = entry.outcome || "Saved locally · not sent to Sarvam by this history panel";
    const actions = document.createElement("div");
    actions.className = "history-row-actions";
    const run = async (command, updateSavedText = false) => {
        if (!window.ChatEngine || typeof window.ChatEngine.sendMessage !== "function") {
            state.textContent = "Replay unavailable · chat is not ready";
            return;
        }
        actions.querySelectorAll("button").forEach(button => { button.disabled = true; });
        state.textContent = "Replaying…";
        try {
            const result = await window.ChatEngine.sendMessage(command, { source: "history-replay" });
            if (updateSavedText) { entry.text = command; text.textContent = command; }
            entry.outcome = result?.success === false ? `Failed · ${String(result.error || "request failed").slice(0, 120)}` : `Replayed · ${result?.aiProviderName || result?.source || "JARVIS"}`;
        } catch (error) { entry.outcome = `Failed · ${String(error?.message || error).slice(0, 120)}`; }
        writeHistory(readHistory().map(saved => saved.id === entry.id ? entry : saved));
        state.textContent = entry.outcome;
        actions.querySelectorAll("button").forEach(button => { button.disabled = false; });
    };
    const replay = document.createElement("button");
    replay.type = "button"; replay.className = "history-replay-button"; replay.textContent = "Replay"; replay.title = "Run this command again";
    replay.addEventListener("click", () => run(entry.text));
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "history-replay-button"; edit.textContent = "Edit"; edit.title = "Correct the transcript and run it";
    edit.addEventListener("click", () => {
        const corrected = window.prompt("Correct the recognized command:", entry.text);
        if (corrected?.trim()) run(corrected.trim().slice(0, 1000), true);
    });
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "history-replay-button history-delete-button"; remove.textContent = "×"; remove.title = "Delete this command from local history";
    remove.addEventListener("click", () => {
        writeHistory(readHistory().filter(saved => saved.id !== entry.id));
        item.remove();
    });
    actions.append(replay, edit, remove);

    item.append(time, text, state, actions);
    if (prepend) historyPanel.prepend(item);
    else historyPanel.appendChild(item);

    while (historyPanel.children.length > HISTORY_LIMIT) {
        historyPanel.removeChild(historyPanel.lastChild);
    }
}

function renderAll() {
    if (!historyPanel) return;
    historyPanel.innerHTML = "";
    readHistory().reverse().forEach(entry => renderItem(entry, false));
}

function applyHistoryFilter() {
    const query = String(document.getElementById("commandHistorySearch")?.value || "").trim().toLocaleLowerCase();
    for (const row of historyPanel?.children || []) row.hidden = Boolean(query && !row.textContent.toLocaleLowerCase().includes(query));
}

function exportHistory() {
    const blob = new Blob([JSON.stringify(readHistory(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `jarvis-command-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setHistoryRetention(days) {
    try { localStorage.setItem(HISTORY_RETENTION_KEY, String(Math.max(0, Number(days) || 0))); } catch (_) {}
    writeHistory(readHistory());
    renderAll();
    applyHistoryFilter();
}

function addHistory(message, options = {}) {
    const text = String(message || "").trim();
    if (!text || !historyPanel) return;
    const currentItems = readHistory();
    const duplicate = [...currentItems].reverse().find(item => item.text === text && Date.now() - Number(item.timestamp || 0) < 1500);
    if (duplicate) return;

    const entry = {
        id: "CMD-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
        text,
        timestamp: Date.now(),
        outcome: Number.isFinite(window.VoiceEngine?.lastTranscriptConfidence)
            ? `Received · voice recognition ${Math.round(window.VoiceEngine.lastTranscriptConfidence * 100)}%${window.VoiceEngine.lastTranscriptConfidence < 0.45 ? " · check transcript; use Edit to correct" : ""}`
            : "Received · waiting for JARVIS"
    };

    renderItem(entry, true);

    if (options.persist !== false) {
        const items = readHistory();
        items.push(entry);
        writeHistory(items);
    }
}

function recordLatestOutcome(result, failed = false) {
    const items = readHistory();
    const entry = [...items].reverse().find(item => String(item.outcome || "").startsWith("Received ·"));
    if (!entry) return;
    const provider = result?.aiProviderName || result?.aiProvider || result?.source || "JARVIS";
    const now = Date.now();
    const wakeAt = Number(window.WakeWordEngine?.lastWakeDetectedAt);
    const hasRecentWake = result?.inputSource === "voice" && Number.isFinite(wakeAt) && wakeAt > 0 && now - wakeAt < 60000;
    const transcriptAt = Number(window.VoiceEngine?.lastTranscriptAt);
    const hasRecentTranscript = result?.inputSource === "voice" && Number.isFinite(transcriptAt) && transcriptAt > 0 && now - transcriptAt < 60000;
    const voiceLatency = hasRecentWake
        ? ` · wake-to-reply ${((now - wakeAt) / 1000).toFixed(1)}s`
        : hasRecentTranscript
            ? ` · voice reply ${((now - transcriptAt) / 1000).toFixed(1)}s`
            : "";
    if (hasRecentWake && window.WakeWordEngine) window.WakeWordEngine.lastWakeDetectedAt = 0;
    entry.outcome = failed || result?.success === false
        ? `Failed · ${String(result?.error || result?.response || "request failed").slice(0, 120)}`
        : `Completed · ${provider}${voiceLatency || (Number.isFinite(result?.duration) ? ` · ${(result.duration / 1000).toFixed(1)}s` : "")}`;
    writeHistory(items);
    const row = [...(historyPanel?.children || [])].find(element => element.dataset.historyId === entry.id);
    const state = row?.querySelector(".history-outcome");
    if (state) state.textContent = entry.outcome;
}

function bindChatOutcomeEvents(attempt = 0) {
    const chat = window.ChatEngine;
    if (!chat?.on) {
        if (attempt < 30) setTimeout(() => bindChatOutcomeEvents(attempt + 1), 100);
        return;
    }
    chat.on("messageComplete", result => recordLatestOutcome(result, false));
    chat.on("messageError", result => recordLatestOutcome(result, true));
    chat.on("messageTimeout", result => recordLatestOutcome(result, true));
}

window.HistoryEngine = {
    add: addHistory,
    render: renderAll,
    setRetention: setHistoryRetention,
    getRetention() { return localStorage.getItem(HISTORY_RETENTION_KEY) ?? "30"; },
    clear() {
        try { localStorage.removeItem(HISTORY_KEY); } catch (_) {}
        if (historyPanel) historyPanel.innerHTML = "";
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { renderAll(); bindChatOutcomeEvents(); }, { once: true });
} else {
    renderAll();
    bindChatOutcomeEvents();
}
document.getElementById("commandHistorySearch")?.addEventListener("input", applyHistoryFilter);
document.getElementById("commandHistoryExport")?.addEventListener("click", exportHistory);
const retention = document.getElementById("commandHistoryRetention");
if (retention) {
    retention.value = localStorage.getItem(HISTORY_RETENTION_KEY) ?? "30";
    retention.addEventListener("change", () => setHistoryRetention(retention.value));
}
document.getElementById("commandHistoryClear")?.addEventListener("click", () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch (_) {}
    renderAll();
});
