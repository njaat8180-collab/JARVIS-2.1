"use strict";

/*
=========================================================
 JARVIS — CONVERSATION CONTEXT MANAGER
 Phase 1: Foundation — Memory + Conversation Context upgrade.
=========================================================

 Purpose
 -------
 Tracks short-term, in-PROCESS conversation state so JARVIS can
 resolve follow-up answers ("Delhi", "yes", "80000") against
 whatever it just asked, and keep a rolling window of recent turns
 for future reference-resolution work ("it", "that", "the previous
 one") — without needing a cloud LLM.

 This is intentionally the ONE place pending-intent / active-topic /
 recent-turn state lives. Skills and the router read and write
 through this manager instead of inventing their own ad-hoc state,
 so every future skill gets follow-up support "for free" once it's
 wired in.

 Scope of this phase
 --------------------
   - Rolling window of recent turns (configurable size).
   - Active topic / active intent bookkeeping (read/write API only —
     nothing yet SETS these automatically; that's a later phase).
   - Pending-intent storage (the actual resolution logic lives in
     PendingIntentManager.js, which sits on top of this class).
   - Yes/No confirmation storage (storage since Phase 1; wired to a
     real skill in Phase 6 — see renderer/js/chat.js).

 NOTHING here is persisted to disk — that is long-term memory's job,
 a separate, later phase. This class is intentionally cleared on
 every app restart.

 See JARVIS_MEMORY_IMPLEMENTATION_STATUS.md for the full roadmap and
 which phase is currently active.
=========================================================
*/

const DEFAULT_MAX_TURNS = 20;

let summarizeTurns = null;
try {
    if (typeof require === "function") {
        ({ summarizeTurns } = require("./ConversationSummarizer.js"));
    }
} catch (_) {
    // Browser builds load the summarizer as a separate script.
}

class ConversationContextManager {
    constructor(options = {}) {
        this.maxTurns =
            Number(options.maxTurns) > 0
                ? Number(options.maxTurns)
                : DEFAULT_MAX_TURNS;

        this.turns = []; // { role: 'user' | 'assistant', text, timestamp }
        this.activeTopic = null; // { subject, ...meta, setAt }
        this.activeIntent = null; // { intent, ...meta, setAt }
        this.pendingIntent = null; // see setPendingIntent()
        this.pendingConfirmation = null; // see setConfirmation()
        this.conversationSummary = null; // compressed history retained after rolling-window eviction
    }

    /* ------------------------------------------------------------
       RECENT TURNS (rolling window)
    ------------------------------------------------------------ */

    pushTurn(role, text) {
        const cleanRole = role === "assistant" ? "assistant" : "user";
        const cleanText = String(text || "").trim();

        if (!cleanText) {
            return null;
        }

        const turn = { role: cleanRole, text: cleanText, timestamp: Date.now() };
        this.turns.push(turn);
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "🧠 CONTEXT UPDATED: TURN", { role: cleanRole, length: cleanText.length });

        if (this.turns.length > this.maxTurns) {
            const olderTurns = this.turns.slice(0, -this.maxTurns);
            this._summarizeOlderTurns(olderTurns);
            this.turns = this.turns.slice(-this.maxTurns);
        }

        return { ...turn };
    }

    getRecentTurns(count) {
        const n = Number(count) > 0 ? Number(count) : this.turns.length;
        return this.turns.slice(-n).map((turn) => ({ ...turn }));
    }

    getLastUserTurn() {
        for (let i = this.turns.length - 1; i >= 0; i--) {
            if (this.turns[i].role === "user") {
                return { ...this.turns[i] };
            }
        }
        return null;
    }

    getLastAssistantTurn() {
        for (let i = this.turns.length - 1; i >= 0; i--) {
            if (this.turns[i].role === "assistant") {
                return { ...this.turns[i] };
            }
        }
        return null;
    }

    _summarizeOlderTurns(turns) {
        if (!Array.isArray(turns) || !turns.length) return null;

        try {
            const summarizer =
                summarizeTurns ||
                (typeof window !== "undefined" && window.JARVISConversationSummarizer?.summarizeTurns);

            if (typeof summarizer !== "function") return null;

            this.conversationSummary = summarizer(turns, this.conversationSummary);
            return this.getConversationSummary();
        } catch (_) {
            // Summarization is an optimization; a failure must never drop turns.
            return null;
        }
    }

    getConversationSummary() {
        if (!this.conversationSummary) return null;
        return {
            ...this.conversationSummary,
            decisions: [...(this.conversationSummary.decisions || [])],
            unresolvedTasks: [...(this.conversationSummary.unresolvedTasks || [])],
            technicalContext: [...(this.conversationSummary.technicalContext || [])],
            userContext: [...(this.conversationSummary.userContext || [])],
            topics: [...(this.conversationSummary.topics || [])]
        };
    }

    clearConversationSummary() {
        this.conversationSummary = null;
    }

    /* ------------------------------------------------------------
       ACTIVE TOPIC
       (e.g. "Tell me about NASA" -> topic = NASA, so "when was it
       founded?" can later resolve "it" -> NASA. The resolution logic
       itself is a later phase; this is just the storage.)
    ------------------------------------------------------------ */

    setTopic(subject, meta = {}) {
        const cleanSubject = String(subject || "").trim();

        if (!cleanSubject) {
            return null;
        }

        this.activeTopic = { subject: cleanSubject, ...meta, setAt: Date.now() };
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "📌 CONTEXT UPDATED: TOPIC", { subject: cleanSubject, source: meta.source || null });
        return { ...this.activeTopic };
    }

    getTopic() {
        return this.activeTopic ? { ...this.activeTopic } : null;
    }

    clearTopic() {
        this.activeTopic = null;
    }

    /* ------------------------------------------------------------
       ACTIVE INTENT
       (last fully-resolved intent, e.g. "WEATHER" — distinct from
       pendingIntent, which is an intent still WAITING on a parameter.)
    ------------------------------------------------------------ */

    setActiveIntent(intentName, meta = {}) {
        const cleanIntent = String(intentName || "").trim();

        if (!cleanIntent) {
            return null;
        }

        this.activeIntent = { intent: cleanIntent, ...meta, setAt: Date.now() };
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "📌 CONTEXT UPDATED: INTENT", { intent: cleanIntent, source: meta.source || null });
        return { ...this.activeIntent };
    }

    getActiveIntent() {
        return this.activeIntent ? { ...this.activeIntent } : null;
    }

    clearActiveIntent() {
        this.activeIntent = null;
    }

    /* ------------------------------------------------------------
       PENDING INTENT (an intent that is missing one parameter)
       Direct storage API. PendingIntentManager.js is the intended
       caller for resolution logic — this class only stores state.
    ------------------------------------------------------------ */

    setPendingIntent(pending) {
        if (!pending || !pending.intent) {
            return null;
        }

        this.pendingIntent = {
            intent: pending.intent,
            skill: pending.skill || pending.intent,
            missingParameter: pending.missingParameter || null,
            collectedParameters: { ...(pending.collectedParameters || {}) },
            originalRequest: pending.originalRequest || null,
            prompt: pending.prompt || null,
            // Not exposed by getPendingIntent() (see below) — kept only
            // for PendingIntentManager to read directly.
            resolver:
                typeof pending.resolver === "function" ? pending.resolver : null,
            createdAt: Date.now()
        };

        const safe = this.getPendingIntent();
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("PENDING", "⏳ PENDING INTENT CREATED", { intent: safe.intent, missingParameter: safe.missingParameter, skill: safe.skill });
        return safe;
    }

    /**
     * Debug/UI-safe snapshot — deliberately omits the resolver function
     * (not serializable, not meant for display) and instead exposes
     * whether one was provided.
     */
    getPendingIntent() {
        if (!this.pendingIntent) {
            return null;
        }

        const { resolver, ...safe } = this.pendingIntent;
        return { ...safe, hasCustomResolver: typeof resolver === "function" };
    }

    hasPendingIntent() {
        return !!this.pendingIntent;
    }

    clearPendingIntent() {
        if (this.pendingIntent && typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("PENDING", "✅ PENDING INTENT RESOLVED/CLEARED", { intent: this.pendingIntent.intent });
        this.pendingIntent = null;
    }

    /* ------------------------------------------------------------
       YES / NO CONFIRMATION
       Storage since Phase 1. Wired to a real skill in Phase 6 (see
       renderer/js/chat.js's ROUTE -1.2 / _resolveConfirmation() and
       the YouTube-open example: "Should I open YouTube?" -> "Yes.").
    ------------------------------------------------------------ */

    setConfirmation(confirmation) {
        if (!confirmation || !confirmation.question) {
            return null;
        }

        this.pendingConfirmation = {
            question: confirmation.question,
            onYes: typeof confirmation.onYes === "function" ? confirmation.onYes : null,
            onNo: typeof confirmation.onNo === "function" ? confirmation.onNo : null,
            meta: confirmation.meta || {},
            createdAt: Date.now()
        };

        const safe = this.getConfirmation();
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "❓ CONTEXT UPDATED: CONFIRMATION", { question: safe.question });
        return safe;
    }

    /**
     * Debug/UI-safe snapshot — deliberately omits the onYes/onNo
     * callback functions (not serializable, not meant for display —
     * same treatment getPendingIntent() gives its resolver function)
     * and instead exposes whether each was provided. Callers that
     * actually need to INVOKE the callbacks (see chat.js's
     * _resolveConfirmation()) read them from the raw
     * `this.pendingConfirmation` object directly, the same documented
     * exception PendingIntentManager.tryResolve() uses for its
     * resolver function.
     */
    getConfirmation() {
        if (!this.pendingConfirmation) {
            return null;
        }

        const { onYes, onNo, ...safe } = this.pendingConfirmation;
        return {
            ...safe,
            hasOnYes: typeof onYes === "function",
            hasOnNo: typeof onNo === "function"
        };
    }

    hasConfirmation() {
        return !!this.pendingConfirmation;
    }

    clearConfirmation() {
        this.pendingConfirmation = null;
    }

    /* ------------------------------------------------------------
       RESET
    ------------------------------------------------------------ */

    /**
     * Clears "waiting for something" state (pending intent + pending
     * confirmation + active topic/intent) but keeps the turn history.
     * Use this when a brand-new, unrelated command arrives.
     */
    clearContext() {
        const hadContext = !!(this.pendingIntent || this.pendingConfirmation || this.activeTopic || this.activeIntent);
        this.pendingIntent = null;
        this.pendingConfirmation = null;
        this.activeTopic = null;
        this.activeIntent = null;
        if (hadContext && typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "🧹 CONTEXT CLEARED");
    }

    /**
     * Wipes everything, including turn history. Intended for explicit
     * "forget this conversation" style commands, not normal routing.
     */
    clearAll() {
        this.turns = [];
        this.clearConversationSummary();
        this.clearContext();
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("CONTEXT", "🧹 CONTEXT CLEARED: ALL");
    }

    /* ------------------------------------------------------------
       DEBUG SNAPSHOT
    ------------------------------------------------------------ */

    getContext() {
        return {
            turns: this.getRecentTurns(),
            conversationSummary: this.getConversationSummary(),
            activeTopic: this.getTopic(),
            activeIntent: this.getActiveIntent(),
            pendingIntent: this.getPendingIntent(),
            pendingConfirmation: this.getConfirmation()
        };
    }
}

/* ------------------------------------------------------------
   GLOBAL WIRING
   Matches every other JARVIS* window global in this codebase —
   there is no bundler / module system in the renderer, scripts are
   loaded via plain <script defer> tags (see renderer/index.html).
------------------------------------------------------------ */

if (typeof window !== "undefined") {
    window.ConversationContextManager = ConversationContextManager;
    window.JARVISConversationContext =
        window.JARVISConversationContext || new ConversationContextManager();
}

// Node / test-harness export (see test/context-managers.test.js, which
// follows the same node:vm pattern as test/natural-command-engine.test.js).
if (typeof module !== "undefined" && module.exports) {
    module.exports = { ConversationContextManager };
}
