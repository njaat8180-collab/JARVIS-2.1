"use strict";

/*
 * JARVIS command routing firewall.
 *
 * Routing is decided from intent, not from a single keyword.  Local actions
 * are fail-closed: if their executor cannot handle them, they must not fall
 * through to an AI answer that could pretend the action happened.
 */
(function () {
    const LOCAL_INTENTS = new Set([
        "SYSTEM_CONTROL", "COMPUTER_USE", "MINECRAFT_WORLD_FLOW", "MINECRAFT_LAUNCH_FLOW", "APP_TASK_FLOW", "OPEN_APP", "OPEN_ALARM", "SET_VOLUME", "CREATE_FOLDER", "FILE_OPERATIONS", "WINDOW_CONTROL",
        "TIME", "DATE", "GREETING", "AI_MESSAGE_QUEUE"
    ]);
    const ONLINE_INTENTS = new Set([
        "SEARCH_WEB", "SITE_SEARCH", "OPEN_WEBSITE", "WEATHER", "NEWS", "TIME",
        "LOCATION", "BOOK_SEARCH", "TV_SEARCH", "RECIPE_SEARCH", "POKEMON",
        "IMAGE_SEARCH", "VIDEO_SEARCH", "GITHUB_SEARCH", "COUNTRY_INFO", "CURRENCY"
    ]);

    const LOCAL_COMMAND = /^(?:please\s+|jarvis\s+|hey\s+jarvis[,:]?\s*)?(?:shut\s*down|shutdown|shut\s+my\s+system\s+down|power\s+off|turn\s+off|restart|reboot|lock\s+(?:my\s+)?(?:pc|computer|system)|log\s*(?:off|out)|sleep\s+(?:my\s+)?(?:pc|computer|system)|(?:open|launch|start|close)\s+|mute(?:\s+volume)?|unmute|set\s+(?:the\s+)?volume|computer\s+use|control\s+(?:my\s+)?computer|system\s+(?:status|information)|pc\s+status|(?:what(?:'s|\s+is)\s+the\s+)?(?:current\s+)?time|(?:today's|current)\s+date|(?:remember|save)\s+(?:that|this)|show\s+(?:my\s+)?memory|(?:सिस्टम|कंप्यूटर|पीसी)\s+(?:शटडाउन|बंद|रीस्टार्ट|लॉक)|(?:समय|टाइम|तारीख)\s+(?:बताओ|बता\s+दो))\b/iu;

    const EXPLICIT_AI = /\b(?:ask\s+(?:the\s+)?ai|ask\s+chat\s*gpt|ask\s+gemini|use\s+(?:the\s+)?ai|let\s+ai\s+(?:answer|explain|think)|ai\s+(?:se|ko)\s+(?:pucho|poochho|batao)|chat\s*gpt\s+(?:se|ko)\s+(?:pucho|poochho|batao)|online\s+ai|ai\s+mode)\b/iu;

    function decide(input) {
        const text = String(input || "").normalize("NFKC").trim();
        if (!text) return { route: "conversation", confidence: 0, reason: "empty" };

        let detected = null;
        try {
            detected = window.JARVISNaturalCommandEngine?.detect?.(text) || null;
        } catch (_) {}

        if (detected?.intent === "OPEN_WEBSITE" && Number(detected.confidence || 0) >= 0.78) {
            return { route: "online", mode: "online", intent: detected.intent, confidence: detected.confidence, reason: "natural-browser-action", detected };
        }

        // Safety-sensitive local actions always win over an AI phrase in the
        // same utterance.  The local executor will still ask for approval.
        const detectedIsLocal = detected && LOCAL_INTENTS.has(detected.intent) && !(detected.intent === "TIME" && detected.entities?.location);
        if (detectedIsLocal && Number(detected.confidence || 0) >= 0.78) {
            return { route: "local", mode: "offline", intent: detected.intent, confidence: detected.confidence, reason: "natural-local-intent", detected };
        }
        if (LOCAL_COMMAND.test(text)) {
            return { route: "local", mode: "offline", intent: detected?.intent || "LOCAL_COMMAND", confidence: 0.82, reason: "explicit-local-command", detected };
        }
        if (EXPLICIT_AI.test(text)) {
            return { route: "ai", mode: "online", intent: "EXPLICIT_AI", confidence: 0.96, reason: "explicit-ai-request", detected };
        }
        if (detected && ONLINE_INTENTS.has(detected.intent) && Number(detected.confidence || 0) >= 0.78) {
            return { route: "online", mode: "online", intent: detected.intent, confidence: detected.confidence, reason: "natural-online-intent", detected };
        }
        return { route: "conversation", mode: "undecided", intent: detected?.intent || "unknown", confidence: Number(detected?.confidence || 0), reason: "no-explicit-route", detected };
    }

    window.JARVISCommandRoutePolicy = Object.freeze({ decide, LOCAL_INTENTS, ONLINE_INTENTS });
})();
