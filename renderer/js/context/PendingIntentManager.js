"use strict";

/*
=========================================================
 JARVIS — PENDING INTENT MANAGER
 Phase 1: Foundation — Memory + Conversation Context upgrade.
=========================================================

 Generic, skill-agnostic "ask a follow-up question, then resolve the
 answer" architecture.

 A skill (weather, time, search, ...) that is missing a required
 parameter calls setPending() instead of guessing or silently
 defaulting (e.g. the old "weather batao" -> silently assumes Delhi
 bug). The NEXT user message is then tried against the pending
 intent, BEFORE any other route runs (see the "ROUTE -1" hook added
 to renderer/js/chat.js's processBrainRouter()).

 This is deliberately NOT hardcoded per skill. Skills provide their
 own `resolver(rawText) -> value|null` function when they register
 the pending intent. If they don't provide one, a generic default
 resolver is used: short, non-command-looking replies are taken as
 the literal parameter value. New skills therefore get follow-up
 support without needing a new isolated implementation each time.

 Currently wired-up skills: WEATHER, TIME, CURRENCY, PRODUCT_SEARCH
 (parameter follow-ups). isAffirmative()/isNegative()/isCancelPhrase()
 below are also reused by chat.js's Phase 6 Yes/No CONFIRMATION
 resolution route (a separate storage bucket on
 ConversationContextManager, not a "pending intent" itself).
 See JARVIS_MEMORY_IMPLEMENTATION_STATUS.md for what's next.
=========================================================
*/

const CANCEL_WORDS = [
    "cancel",
    "nevermind",
    "never mind",
    "forget it",
    "chodo",
    "chhodo",
    "rehne do",
    "reh do",
    "skip",
    "stop it"
];

// A short safety net so an unrelated new command doesn't get silently
// swallowed as "the answer" to a stale pending question. This is
// intentionally generic (shared across every skill, not just
// weather) — it is a coarse guard, not a full intent parser; the
// downstream router already knows how to detect real intents. Skills
// whose parameter type needs tighter validation (e.g. "this must
// look like a place name") should supply their own `resolver`
// instead of relying solely on this default.
const NEW_COMMAND_HINTS = [
    "open ",
    "search ",
    "kholo",
    "jarvis stop",
    "browser",
    "youtube",
    "play ",
    "current time",
    "current date",
    "time now",
    "today's date",
    "todays date",
    "system status",
    "system information",
    "jarvis status",
    "system diagnostics",
    "are you online",
    "are you there",
    "what do you remember",
    "show my memory"
];

const AFFIRMATIVE_WORDS = new Set([
    "yes",
    "yeah",
    "yep",
    "yup",
    "sure",
    "ok",
    "okay",
    "haan",
    "haa",
    "ha",
    "yes please",
    "please do",
    "go ahead",
    "haan bilkul",
    "haan karo"
]);

const NEGATIVE_WORDS = new Set([
    "no",
    "nope",
    "nah",
    "nahi",
    "nahin",
    "no thanks",
    "not now",
    "mat karo"
]);

/**
 * Default parameter resolver used when a skill doesn't provide its
 * own. Deliberately conservative: only accepts short replies that
 * don't look like a brand-new command.
 */
function defaultResolver(rawText) {
    const text = String(rawText || "").trim();

    if (!text) {
        return null;
    }

    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (wordCount > 6) {
        return null;
    }

    if (NEW_COMMAND_HINTS.some((hint) => lower.includes(hint))) {
        return null;
    }

    return text;
}

function isCancelPhrase(rawText) {
    const lower = String(rawText || "").trim().toLowerCase();

    if (!lower) {
        return false;
    }

    return CANCEL_WORDS.some((word) => lower === word || lower.startsWith(`${word} `));
}

function isAffirmative(rawText) {
    return AFFIRMATIVE_WORDS.has(String(rawText || "").trim().toLowerCase());
}

function isNegative(rawText) {
    return NEGATIVE_WORDS.has(String(rawText || "").trim().toLowerCase());
}

class PendingIntentManager {
    constructor(contextManager) {
        this.context =
            contextManager ||
            (typeof window !== "undefined" ? window.JARVISConversationContext : null) ||
            null;
    }

    hasPending() {
        // Guarded: a context object that doesn't implement the pending-intent
        // storage API must never crash the whole chat send pipeline (it used
        // to throw "this.context.hasPendingIntent is not a function" and
        // fail every message when a legacy context object was installed —
        // see the window.JARVISConversationContext collision fix in
        // renderer/js/brain/conversationContext.js).
        return !!(
            this.context &&
            typeof this.context.hasPendingIntent === "function" &&
            this.context.hasPendingIntent()
        );
    }

    getPending() {
        return this.context ? this.context.getPendingIntent() : null;
    }

    /**
     * Registers a pending intent. `resolver` is optional — omit it to
     * use the generic default resolver.
     *
     * Required fields: intent, missingParameter, prompt.
     */
    setPending({
        intent,
        skill,
        missingParameter,
        collectedParameters,
        originalRequest,
        prompt,
        resolver
    } = {}) {
        if (!this.context) {
            console.warn("[PendingIntentManager] No ConversationContextManager available.");
            return null;
        }

        if (!intent || !missingParameter || !prompt) {
            console.warn(
                "[PendingIntentManager] setPending() requires intent, missingParameter and prompt."
            );
            return null;
        }

        return this.context.setPendingIntent({
            intent,
            skill,
            missingParameter,
            collectedParameters,
            originalRequest,
            prompt,
            resolver
        });
    }

    /**
     * Tries to resolve the pending intent (if any) against a new user
     * message.
     *
     * Returns exactly one of:
     *   { resolved: false, reason: "no-pending" }     nothing was pending
     *   { resolved: false, reason: "cancelled" }       user cancelled; pending cleared
     *   { resolved: false, reason: "no-match" }        pending KEPT; caller should
     *                                                   fall through to normal routing
     *   { resolved: true, intent, skill, originalRequest, parameters }
     */
    tryResolve(rawText) {
        if (
            !this.context ||
            typeof this.context.hasPendingIntent !== "function" ||
            !this.context.hasPendingIntent()
        ) {
            return { resolved: false, reason: "no-pending" };
        }

        if (isCancelPhrase(rawText)) {
            const pendingBeforeCancel = this.context.getPendingIntent();
            this.context.clearPendingIntent();
            if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("PENDING", "❌ PENDING INTENT CANCELLED", { intent: pendingBeforeCancel?.intent || null });
            return { resolved: false, reason: "cancelled" };
        }

        // getPendingIntent() returns a debug-safe copy without the
        // resolver function, so read the resolver from the raw stored
        // object (an intentional, documented exception — see
        // ConversationContextManager.setPendingIntent()).
        const pendingSafe = this.context.getPendingIntent();
        const pendingRaw = this.context.pendingIntent;

        const resolverFn =
            pendingRaw && typeof pendingRaw.resolver === "function"
                ? pendingRaw.resolver
                : defaultResolver;

        let value;

        try {
            value = resolverFn(rawText);
        } catch (error) {
            console.error("[PendingIntentManager] resolver threw:", error);
            value = null;
        }

        if (value === null || value === undefined || value === "") {
            return { resolved: false, reason: "no-match" };
        }

        const parameters = {
            ...(pendingSafe.collectedParameters || {}),
            [pendingSafe.missingParameter]: value
        };

        const resolvedIntent = pendingSafe.intent;
        this.context.clearPendingIntent();
        if (typeof window !== "undefined" && window.JARVISDiagnostics) window.JARVISDiagnostics.record("PENDING", "✅ PENDING INTENT RESOLVED", { intent: resolvedIntent, parameter: pendingSafe.missingParameter });

        return {
            resolved: true,
            intent: pendingSafe.intent,
            skill: pendingSafe.skill,
            originalRequest: pendingSafe.originalRequest,
            parameters
        };
    }

    clear() {
        if (this.context) {
            this.context.clearPendingIntent();
        }
    }
}

/* ------------------------------------------------------------
   GLOBAL WIRING (same pattern as ConversationContextManager.js)
------------------------------------------------------------ */

if (typeof window !== "undefined") {
    window.PendingIntentManager = PendingIntentManager;
    window.JARVISPendingIntent =
        window.JARVISPendingIntent ||
        new PendingIntentManager(window.JARVISConversationContext);

    // Phase 6: the yes/no helpers below previously existed only for
    // internal use (tryResolve()'s cancel-phrase check) and Node
    // tests (via module.exports). Exposed on window too, unchanged,
    // so chat.js's confirmation-resolution route (renderer's
    // ROUTE -1.2, see JARVIS_MEMORY_IMPLEMENTATION_STATUS.md) can
    // reuse the exact same word lists instead of duplicating them —
    // "storage/helpers built early, wired up later" is the same
    // pattern Phase 5 followed for setTopic()/getTopic().
    window.JARVISPendingIntentHelpers = window.JARVISPendingIntentHelpers || {
        isAffirmative,
        isNegative,
        isCancelPhrase
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        PendingIntentManager,
        defaultResolver,
        isCancelPhrase,
        isAffirmative,
        isNegative
    };
}
