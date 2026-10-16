"use strict";

(function installDeferredProviderShutdown() {
    const STORAGE_KEY = "JARVIS_DEFERRED_PROVIDER_SHUTDOWN_V1";
    let pending = null;

    function readPending() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            return value && ["ChatGPT", "Gemini"].includes(value.provider) ? value : null;
        } catch (_) { return null; }
    }

    function persist() {
        try {
            if (pending) localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
            else localStorage.removeItem(STORAGE_KEY);
        } catch (_) { /* In-memory behavior remains available for this session. */ }
    }

    function arm(provider) {
        const normalized = /gemini/i.test(String(provider || "")) ? "Gemini" : /chat\s*gpt|openai/i.test(String(provider || "")) ? "ChatGPT" : null;
        if (!normalized) return false;
        pending = { provider: normalized, armedAt: Date.now() };
        persist();
        return true;
    }

    function cancel() {
        const existed = Boolean(pending || readPending());
        pending = null;
        persist();
        return existed;
    }

    function isMatchingRemoteReply(reply, provider) {
        if (!reply || reply.success === false || !(reply.response || reply.text)) return false;
        const providerType = String(reply.aiProvider || "").toLowerCase();
        const isRemote = ["openai-compatible", "openai", "chatgpt", "gemini"].includes(providerType) || /^api\//i.test(String(reply.source || ""));
        if (!isRemote) return false;
        const identity = `${reply.aiProviderName || ""} ${reply.aiModel || ""} ${reply.source || ""}`.toLowerCase();
        if (provider === "Gemini") return /\bgemini\b/.test(identity);
        return /\bchat\s*gpt\b|\bopenai\b|\bgpt(?:[-\w.]*)\b/.test(identity);
    }

    async function onReplyDelivered(reply) {
        pending = pending || readPending();
        if (!pending || !isMatchingRemoteReply(reply, pending.provider)) return false;

        const match = pending;
        // Clear before the side effect so a second completion event can never
        // issue another shutdown, even if the IPC response arrives late.
        pending = null;
        persist();
        const system = window.jarvis?.system;
        if (typeof system?.shutdown !== "function") {
            console.error("[JARVIS] Deferred shutdown could not run: system bridge unavailable.");
            return false;
        }
        try {
            const result = await system.shutdown();
            if (result?.success === false) console.error("[JARVIS] Deferred shutdown failed:", result.error || "unknown error");
            else console.info(`[JARVIS] Shutdown started after the ${match.provider} reply was delivered.`);
            return result?.success !== false;
        } catch (error) {
            console.error("[JARVIS] Deferred shutdown failed:", error?.message || String(error));
            return false;
        }
    }

    pending = readPending();
    window.JARVISDeferredShutdown = Object.freeze({
        arm,
        cancel,
        onReplyDelivered,
        getPending: () => pending || readPending(),
        matchesReply: isMatchingRemoteReply
    });
})();
