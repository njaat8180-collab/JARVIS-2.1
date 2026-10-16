"use strict";

/*
=========================================================
 JARVIS — REFERENCE RESOLVER
 Phase 5: Reference resolution + topic continuity.
=========================================================

 Purpose
 -------
 Resolves short follow-up questions that refer back to whatever
 JARVIS was just talking about, using pronouns/deictic words instead
 of repeating the subject:

     User: "Tell me about NASA."
     JARVIS: <Wikipedia summary of NASA>
     User: "When was it founded?"
              ^^ "it" must resolve to NASA before this reaches the
                 normal intent/knowledge routes, or "it" will be
                 treated as a nonsense topic.

 This module does NOT decide intents and does NOT call any skill. It
 only rewrites the raw text (substituting the reference word with the
 active topic's subject) so every existing route downstream
 (NaturalCommandEngine, the KNOWLEDGE/WIKIPEDIA regex routes, etc.)
 sees a fully-specified sentence, exactly as if the user had typed
 the subject out. This mirrors the project's existing approach of
 "resolve first, then let existing routing handle it unchanged"
 rather than adding a parallel answer path (see PendingIntentManager
 for the sibling pattern with follow-up ANSWERS instead of follow-up
 REFERENCES).

 Where the "active topic" comes from
 ------------------------------------
 `ConversationContextManager.setTopic()` storage already existed
 since Phase 1 but nothing wrote to it until this phase. See
 renderer/js/chat.js for the call sites that now set the topic after
 a KNOWLEDGE/WIKIPEDIA/COUNTRY_INFO/LOCATION/... answer.

 Deliberately conservative (same philosophy as
 PendingIntentManager's defaultResolver and the WEATHER/PRODUCT_SEARCH
 curated triggers elsewhere in this codebase):
   - Only fires when an active topic actually exists.
   - Only fires when the message is short (a follow-up question,
     not an unrelated long sentence that happens to contain "it").
   - Only replaces a CURATED list of reference words/phrases, not
     every occurrence of common words.
   - Never touches messages that already look like their own
     complete, self-contained command (weather/time/currency/
     product-search/cancel/yes-no), since those already carry their
     own subject and must not be hijacked.
   - Leaves the message completely untouched (resolved: false) if
     nothing matches — callers should just proceed with the original
     text, exactly like a "no-match" pending-intent result.

 See JARVIS_MEMORY_IMPLEMENTATION_STATUS.md, Phase 5, for the full
 write-up, known issues, and what was deliberately left out.
=========================================================
*/

// Longer than this, and a bare "it"/"that" is much more likely to be
// part of an unrelated sentence than a short clarifying follow-up
// question — so we leave it alone rather than risk a bad rewrite.
const MAX_FOLLOWUP_WORDS = 12;

// Curated reference words/phrases, longest-first so "the same one"
// matches before a bare "the same" would, etc. English + common
// Hinglish deictic pronouns used the same way WEATHER/TIME's Hinglish
// triggers are curated elsewhere in this codebase.
const REFERENCE_TOKENS = [
    "the previous one",
    "the same one",
    "the same",
    "it's",
    "its",
    "it",
    "that",
    "this",
    "iske",
    "uske",
    "isse",
    "usse",
    "isme",
    "usme",
    "woh",
    "wo",
    "yeh",
    "ye"
];

// If the message already matches one of these, it's a complete,
// self-contained command with its own subject/parameters — never
// rewrite it, even if it happens to also contain a reference word
// (e.g. "cancel that" should cancel, not get subject-substituted).
const SKIP_PATTERNS = [
    /\bcancel\b/i,
    /\bnevermind\b/i,
    /\bnever mind\b/i,
    /\bforget it\b/i,
    /\bchodo\b/i,
    /\bchhodo\b/i,
    /^\s*(?:yes|yeah|yep|yup|sure|ok|okay|haan|haa|ha)\s*$/i,
    /^\s*(?:no|nope|nah|nahi|nahin)\s*$/i,
    /\bweather\b/i,
    /\bmausam\b/i,
    /\bcurrency\b/i,
    /\bconvert\b/i,
    /\bexchange rate\b/i,
    /\bsearch\s+(?:laptops?|phones?|cameras?|headphones?|tvs?|watches?|tablets?)\b/i
];

function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the first curated reference token present in `text` as a
 * whole-word/phrase match. Returns the matched token (in its
 * lowercase canonical form from REFERENCE_TOKENS) or null.
 */
function findReferenceToken(text) {
    const lower = String(text || "").toLowerCase();

    for (const token of REFERENCE_TOKENS) {
        const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
        if (pattern.test(lower)) {
            return token;
        }
    }

    return null;
}

class ReferenceResolver {
    constructor(contextManager) {
        this.context =
            contextManager ||
            (typeof window !== "undefined" ? window.JARVISConversationContext : null) ||
            null;
    }

    /**
     * Attempts to rewrite `rawText`, substituting the first curated
     * reference word/phrase found with the active topic's subject.
     *
     * Returns exactly one of:
     *   { resolved: false, reason: "no-topic" }        nothing to resolve against
     *   { resolved: false, reason: "too-long" }         message too long to be a safe follow-up
     *   { resolved: false, reason: "self-contained" }   message already has its own subject
     *   { resolved: false, reason: "no-reference" }     no curated reference word found
     *   { resolved: true, text, matchedToken, subject } text is the rewritten message
     */
    resolve(rawText) {
        const text = String(rawText || "").trim();

        if (!text) {
            return { resolved: false, reason: "no-reference" };
        }

        const topic = this.context && typeof this.context.getTopic === "function"
            ? this.context.getTopic()
            : null;

        if (!topic || !topic.subject) {
            return { resolved: false, reason: "no-topic" };
        }

        const wordCount = text.split(/\s+/).filter(Boolean).length;
        if (wordCount > MAX_FOLLOWUP_WORDS) {
            return { resolved: false, reason: "too-long" };
        }

        if (SKIP_PATTERNS.some((pattern) => pattern.test(text))) {
            return { resolved: false, reason: "self-contained" };
        }

        const token = findReferenceToken(text);
        if (!token) {
            return { resolved: false, reason: "no-reference" };
        }

        const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
        const rewritten = text.replace(pattern, topic.subject);

        return {
            resolved: true,
            text: rewritten,
            matchedToken: token,
            subject: topic.subject
        };
    }
}

/* ------------------------------------------------------------
   GLOBAL WIRING (same pattern as ConversationContextManager.js /
   PendingIntentManager.js)
------------------------------------------------------------ */

if (typeof window !== "undefined") {
    window.ReferenceResolver = ReferenceResolver;
    window.JARVISReferenceResolver =
        window.JARVISReferenceResolver ||
        new ReferenceResolver(window.JARVISConversationContext);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { ReferenceResolver, findReferenceToken };
}
