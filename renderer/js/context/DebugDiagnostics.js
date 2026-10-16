"use strict";

/*
 * JARVIS Phase 14 — bounded debug/diagnostics event bus.
 *
 * Observational only: it never participates in routing or skill execution.
 * Events are recorded only while ChatEngine.config.debug is truthy.
 */
(function (root) {
    const MAX_EVENTS = 150;
    const events = [];
    let sequence = 0;

    function enabled() {
        try {
            return !!(root && root.ChatEngine && root.ChatEngine.config && root.ChatEngine.config.debug);
        } catch (_) {
            return false;
        }
    }

    function safeDetails(details) {
        if (!details || typeof details !== "object") return null;
        const out = {};
        for (const [key, value] of Object.entries(details)) {
            if (/password|api.?key|token|secret|credential|authorization/i.test(key)) {
                out[key] = "[REDACTED]";
            } else if (typeof value === "function") {
                out[key] = "[Function]";
            } else if (value && typeof value === "object") {
                try { out[key] = JSON.parse(JSON.stringify(value)); }
                catch (_) { out[key] = String(value); }
            } else {
                out[key] = value;
            }
        }
        return out;
    }

    function record(kind, message, details) {
        if (!enabled()) return null;
        const event = {
            id: ++sequence,
            timestamp: Date.now(),
            kind: String(kind || "DEBUG").toUpperCase(),
            message: String(message || ""),
            details: safeDetails(details)
        };
        events.push(event);
        while (events.length > MAX_EVENTS) events.shift();

        const line = `[JARVIS ${event.kind}] ${event.message}`;
        if (event.kind === "ERROR") console.error(line, event.details || "");
        else console.log(line, event.details || "");

        try { root.dispatchEvent(new CustomEvent("jarvis:diagnostic", { detail: event })); } catch (_) {}
        return { ...event, details: event.details && { ...event.details } };
    }

    function snapshot() {
        return {
            enabled: enabled(),
            eventCount: events.length,
            events: events.map((event) => ({ ...event, details: event.details && { ...event.details } })),
            context: root.JARVISConversationContext?.getContext?.() || null,
            activeIntent: root.JARVISConversationContext?.getActiveIntent?.() || null,
            pendingIntent: root.JARVISConversationContext?.getPendingIntent?.() || null,
            confirmation: root.JARVISConversationContext?.getConfirmation?.() || null,
            topic: root.JARVISConversationContext?.getTopic?.() || null
        };
    }

    function clear() {
        if (!enabled()) return false;
        events.length = 0;
        record("CONTEXT", "DEBUG DIAGNOSTIC BUFFER CLEARED");
        return true;
    }

    root.JARVISDiagnostics = root.JARVISDiagnostics || Object.freeze({
        enabled,
        record,
        snapshot,
        clear,
        maxEvents: MAX_EVENTS
    });
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
    module.exports = { createDiagnosticsForTest };
}

function createDiagnosticsForTest(debug = true) {
    const events = [];
    return {
        record(kind, message, details) {
            if (!debug) return null;
            const event = { kind: String(kind).toUpperCase(), message: String(message || ""), details: details || null };
            events.push(event);
            return event;
        },
        snapshot() { return { enabled: !!debug, eventCount: events.length, events: events.slice() }; },
        clear() { if (!debug) return false; events.length = 0; return true; }
    };
}
