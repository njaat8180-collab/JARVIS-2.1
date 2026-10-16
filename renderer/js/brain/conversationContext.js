"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — CONVERSATION CONTEXT ENGINE v2
 * renderer/js/brain/conversationContext.js
 * ============================================================
 *
 * Resolves follow-up references in natural conversation:
 *   User: "Jarvis YouTube kholo"
 *   Jarvis: ✓
 *   User: "usko band karo"  → resolves to "YouTube band karo"
 *
 * Supports: "usko/uss/wo", "wapas/phir se", "band karo",
 * "dusra/dusri", "pichla" + pronoun "it/that/this".
 *
 * Dual-exported: works in browser (window.JARVISConversationContext)
 * and Node (module.exports) for testing.
 * ============================================================
 */

var ConversationContext = (function () {

    var MAX_TURNS = 20;
    var MAX_AGE_MS = 5 * 60 * 1000; // 5 minute context window
    var turns = [];
    var lastCommand = null; // {verb, entity, raw, ts}

    // ---- entity extraction from a command ----
    // Handles BOTH word orders:
    //   English: "open YouTube"   (verb + entity)
    //   Hindi:   "YouTube kholo"  (entity + verb)
    var VERB_MAP = [
        { re: /\b(?:open|kholo|khol|launch|start|chalao|chalu)\b/i, verb: "open" },
        { re: /\b(?:close|band|band karo|stop|ruko)\b/i, verb: "close" },
        { re: /\b(?:search|dhoondo|talash|khojo)\b/i, verb: "search" },
        { re: /\b(?:play|chala|baja)\b/i, verb: "play" },
        { re: /\b(?:tell|batao|bata|poochho)\b/i, verb: "tell" },
        { re: /\b(?:remind|yaad dila)\b/i, verb: "remind" }
    ];

    var VERB_WORDS = /(?:open|kholo|khol|launch|start|chalao|chalu|close|band|band karo|stop|ruko|search|dhoondo|talash|khojo|play|chala|baja|tell|batao|bata|poochho|remind|yaad\s+dila)/i;

    function extractEntity(text) {
        var t = String(text || "").trim();
        var verb = null, entity = null, i;
        for (i = 0; i < VERB_MAP.length; i++) {
            if (VERB_MAP[i].re.test(t)) { verb = VERB_MAP[i].verb; break; }
        }
        if (!verb) return { verb: null, entity: null };
        // Strip leading wake words
        var cleaned = t.replace(/^\s*(?:hey\s+)?(?:jarvis\b[\s,]*)?/i, "").trim();
        if (!cleaned) cleaned = t;
        // English order: verb + entity
        var m = new RegExp("(?:" + VERB_WORDS.source + ")\\s+([\\w\\s]+?)(?:\\s+(?:karo|kholo|band|band karo|chalao|chalu|batao|dhoondo|stop|ruko|baja|chala)|$)", "i").exec(cleaned);
        if (m && m[1] && m[1].trim()) {
            entity = m[1].trim();
        } else {
            // Hindi order: entity + verb — text before the verb
            var vm = cleaned.match(VERB_WORDS);
            if (vm && vm.index > 0) {
                entity = cleaned.slice(0, vm.index).trim();
                entity = entity.replace(/\s*(?:ko|par|mein|pe|ka|ki|ke)\s*$/i, "").trim();
            }
        }
        if (entity && (VERB_WORDS.test(entity) || entity.length < 2)) entity = null;
        return { verb: verb, entity: entity };
    }

    // ---- reference patterns ----
    var REF_PATTERNS = [
        // "usko band karo", "uss ko kholo", "wo band karo"
        /\b(?:usko|uss?|wo|woh|us|ise|is ko|us ko)\s+(band karo|band|kholo|khol|chalao|chalu|stop|ruko|batao|bata|dhoondo|search|karo|khol do|band kar do)\b/i,
        // "wapas chalao", "phir se batao", "wapas kholo"
        /\b(?:wapas|phir se|dobara|again)\s+(chalao|chalu|kholo|khol|batao|bata|play|chala|baja|dhoondo|search|karo)\b/i,
        // "band karo" alone (no entity, no verb context) — refers to last opened thing
        /^\s*(?:band karo|band|close|stop|ruko)\s*$/i,
        // "it/that/this" English
        /\b(?:it|that|this|the same)\b/i
    ];

    function isFollowUp(text) {
        var t = String(text || "").trim();
        if (!t) return false;
        // Short messages with reference words are follow-ups
        if (t.split(/\s+/).length > 12) return false;
        for (var i = 0; i < REF_PATTERNS.length; i++) {
            if (REF_PATTERNS[i].test(t)) return true;
        }
        return false;
    }

    function pushTurn(role, text) {
        var now = Date.now();
        var ext = extractEntity(text);
        var turn = { role: role, text: text, ts: now, verb: ext.verb, entity: ext.entity };
        turns.push(turn);
        if (turns.length > MAX_TURNS) turns.shift();
        if (role === "user" && (ext.verb || ext.entity)) {
            lastCommand = { verb: ext.verb, entity: ext.entity, raw: text, ts: now };
        }
        prune();
    }

    function prune() {
        var now = Date.now();
        while (turns.length > 0 && now - turns[0].ts > MAX_AGE_MS) turns.shift();
        if (lastCommand && now - lastCommand.ts > MAX_AGE_MS) lastCommand = null;
    }

    function resolve(text) {
        var t = String(text || "");
        if (!isFollowUp(t) || !lastCommand) return t;

        var entity = lastCommand.entity || "";
        var lastVerb = lastCommand.verb || "";

        // "usko band karo" → "<entity> band karo"
        if (/\b(?:usko|uss?|wo|woh|us|ise)\b/i.test(t) && entity) {
            return t.replace(/\b(?:usko|uss?|wo|woh|us|ise|is ko|us ko)\b/i, entity);
        }
        // "wapas chalao" / "phir se batao" → "<entity> <verb>" (re-execute last command)
        if (/\b(?:wapas|phir se|dobara|again)\b/i.test(t)) {
            if (entity && lastVerb) return entity + " " + lastVerb;
            if (lastCommand && lastCommand.raw) return lastCommand.raw;
        }
        // "band karo" alone → "<entity> band karo"
        if (/^\s*(?:band karo|band|close|stop|ruko)\s*$/i.test(t) && entity) {
            return entity + " band karo";
        }
        // "it/that" → replace with entity
        if (/\b(?:it|that|this|the same)\b/i.test(t) && entity) {
            return t.replace(/\b(?:it|that|this|the same)\b/i, entity);
        }
        return t;
    }

    function getRecent(n) { prune(); return turns.slice(-(n || 5)); }
    function getLastCommand() { prune(); return lastCommand; }
    // ---- YES/NO confirmation flow (used by chat.js ROUTE -1.2) ----
    // Registered by e.g. the OPEN_CONFIRMATION site-open flow; the next
    // affirmative/negative/cancel message resolves it. Deterministic,
    // time-bounded so a stale question can never hijack a session.
    var CONFIRMATION_TTL_MS = 2 * 60 * 1000; // 2 minutes
    var confirmations = { pending: null };

    function setConfirmation(spec) {
        spec = spec || {};
        confirmations.pending = {
            question: spec.question || "",
            onYes: typeof spec.onYes === "function" ? spec.onYes : null,
            onNo: typeof spec.onNo === "function" ? spec.onNo : null,
            meta: spec.meta || {},
            createdAt: Date.now(),
            expiresAt: Date.now() + CONFIRMATION_TTL_MS
        };
    }

    function hasConfirmation() {
        var c = confirmations.pending;
        if (!c) return false;
        if (Date.now() > c.expiresAt) { confirmations.pending = null; return false; }
        return true;
    }

    function getConfirmation() {
        // Debug-safe copy — callback functions are never exposed.
        if (!hasConfirmation()) return null;
        var c = confirmations.pending;
        return { question: c.question, meta: c.meta, createdAt: c.createdAt, expiresAt: c.expiresAt };
    }

    function clearConfirmation() { confirmations.pending = null; }

    function clear() { turns = []; lastCommand = null; confirmations.pending = null; }

    function getSuggestions() {
        // Suggest follow-ups based on last command
        if (!lastCommand || !lastCommand.entity) return [];
        var s = [];
        if (lastCommand.verb === "open") s.push(lastCommand.entity + " band karo");
        if (lastCommand.verb === "search") s.push(lastCommand.entity + " batao");
        s.push("aur batao");
        return s.slice(0, 3);
    }

    // `pendingConfirmation` is defined as a getter so chat.js can read
    // the RAW stored object (including onYes/onNo callbacks) exactly
    // like it reads context.pendingConfirmation today.
    var api = {
        pushTurn: pushTurn,
        resolve: resolve,
        isFollowUp: isFollowUp,
        getRecent: getRecent,
        getLastCommand: getLastCommand,
        getSuggestions: getSuggestions,
        setConfirmation: setConfirmation,
        hasConfirmation: hasConfirmation,
        getConfirmation: getConfirmation,
        clearConfirmation: clearConfirmation,
        clear: clear,
        _extractEntity: extractEntity,
        _reset: function () { clear(); }
    };
    Object.defineProperty(api, "pendingConfirmation", {
        get: function () { return confirmations.pending; },
        configurable: true
    });
    return api;
})();

// Browser global
// ============================================================
// COLLISION FIX (chat crash: "this.context.hasPendingIntent is
// not a function"):
// This module used to claim window.JARVISConversationContext —
// the SAME global name that renderer/js/context/
// ConversationContextManager.js uses for the newer, full-featured
// context store (pending intents, confirmations, topics, turn
// history). Because this legacy script loads EARLIER in
// index.html, its unconditional assignment here meant the newer
// manager's guarded
//   window.JARVISConversationContext = window.JARVISConversationContext || new ConversationContextManager()
// never installed its instance — the legacy API object (which has
// NO hasPendingIntent()) stayed in place, so
// PendingIntentManager.hasPending() crashed and EVERY chat send
// failed with "I encountered an error while processing your
// request."
//
// This legacy engine now exposes itself under
// window.JARVISLegacyConversationContext (renderer/js/chat.js's
// legacy-API call sites — resolve / getLastCommand / getRecent —
// were updated to match), and the real ConversationContextManager
// correctly installs window.JARVISConversationContext.
// ============================================================
if (typeof window !== "undefined") {
    window.JARVISLegacyConversationContext = ConversationContext;
}
// Node export
if (typeof module !== "undefined" && module.exports) {
    module.exports = ConversationContext;
}
