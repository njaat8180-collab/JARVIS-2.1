"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT CLASSIFIER (Phase 6)
 * ============================================================
 *
 * Deterministic, rule-based request classification. NO AI/LLM of
 * any kind is used or called here — every decision below is a
 * plain keyword/pattern match, in a fixed priority order, so the
 * same input always produces the same category.
 *
 * Architectural note (see PHASE6 project brief, STEP 4 —
 * "INSPECT BEFORE CODING" / STEP 6 — "Use the existing Intent
 * Engine wherever possible"):
 *
 *   renderer/js/brain/intentEngine.js is the project's existing,
 *   much larger natural-language intent engine. It is a renderer
 *   (browser) module: it reads/writes `window` directly and is
 *   loaded via a <script> tag into the Electron renderer process,
 *   not `require()`-able from plain Node. This project's own test
 *   convention (`npm test` => `node --test test/*.test.js`) runs
 *   in plain Node with no live Electron/browser window, and the
 *   Phase 6 brief requires the new test suite to run the same way
 *   with no live Electron. Actually invoking intentEngine.js from
 *   here would therefore require either (a) a live renderer/IPC
 *   round-trip, which does not exist for the Node test process, or
 *   (b) rewriting intentEngine.js to drop its `window` dependency —
 *   both of which the brief explicitly forbids ("do NOT rewrite the
 *   project", "do NOT modify completed features unnecessarily").
 *
 *   Given that constraint, this module implements its OWN small,
 *   deterministic classifier scoped to exactly the categories
 *   Phase 6 needs for task orchestration. It intentionally does not
 *   duplicate intentEngine.js's much larger command-matching
 *   surface — it only decides which high-level category a request
 *   belongs to (so AssistantOrchestrator can plan/execute it), the
 *   same narrow job description in STEP 6 of the brief. When this
 *   assistant layer is eventually wired into the live renderer
 *   (main.js/IPC), the renderer's own chat pipeline may continue to
 *   consult intentEngine.js first and only fall back to this
 *   classifier for requests intentEngine.js does not resolve —
 *   that wiring is left to main.js/preload.js and is out of scope
 *   for this deterministic, Node-testable module.
 * ============================================================
 */

/** Every category this classifier can return. */
const CATEGORIES = [
    "conversation",
    "system_command",
    "application_action",
    "browser_action",
    "research",
    "memory",
    "task",
    "goal",
    "evolution",
    "information",
    "presentation",
    "unsupported"
];

/** Actions considered destructive/dangerous regardless of category — used by safetyGate.js too. */
const DESTRUCTIVE_ACTIONS = [
    "shutdown",
    "restart",
    "reboot",
    "delete",
    "remove",
    "erase",
    "wipe",
    "format",
    "overwrite",
    "uninstall",
    "kill",
    "terminate",
    "clear history",
    "clear browser history",
    "clear downloads",
    "logoff",
    "log off",
    "lock the computer",
    "lock my screen",
    "lock the pc",
    "sleep the computer",
    "put the computer to sleep",
    "put the pc to sleep"
];

function normalize(text) {
    return String(text || "")
        .trim()
        .toLowerCase();
}

function matchesAny(text, patterns) {
    return patterns.some((p) => (p instanceof RegExp ? p.test(text) : text.includes(p)));
}

function extractDestructiveAction(text) {
    return DESTRUCTIVE_ACTIONS.find((word) => text.includes(word)) || null;
}

function extractPresentationTopic(text) {
    const value = normalize(text).replace(/^(?:hey\s+)?jarvis[\s,:-]*/i, "").trim();
    const patterns = [
        /^(?:please\s+)?(?:research\s+)?(?:and\s+)?(?:create|make|build|prepare|generate)\s+(?:(?:me|a|an|the)\s+)*(?:\d{1,2}[- ]?slide\s+)?(?:pptx?|power\s*point|presentation|slides|पीपीटी|प्रेजेंटेशन)\s*(?:(?:about|on|for|of|के\s+ऊपर|के\s+बारे\s+में|पर)\s+)?(.+?)\s*$/iu,
        /^(?:please\s+)?(?:research\s+)?(?:create|make|build|prepare|generate)\s+(.+?)\s+(?:pptx?|power\s*point|presentation|slides)\s+(?:about|on|for|of)\s+(.+?)\s*$/iu,
        /^research\s+(.+?)\s+and\s+(?:create|make|build|prepare|generate)\s+(?:a\s+)?(?:pptx?|power\s*point|presentation|slides)(?:\s+(?:about|on|for|of))?\s*(.+?)\s*$/iu
    ];
    for (const pattern of patterns) {
        const match = value.match(pattern);
        const secondCapture = String(match?.[2] || "").trim();
        const topic = (/^(?:it|that|this|उसे|उसके\s+बारे\s+में)$/iu.test(secondCapture) ? (match?.[1] || secondCapture) : (match?.[2] || match?.[1] || ""))
            .replace(/\s+(?:please|now|for\s+me|and\s+research\s+it)$/iu, "")
            .replace(/^(?:about|on|for|of|के\s+ऊपर|के\s+बारे\s+में|पर)\s+/iu, "")
            .trim();
        if (topic && topic.length <= 120) return topic;
    }
    return "";
}

/** Maps whatever raw destructive phrase matched onto the canonical
 * SystemActionAdapter/BrowserActionAdapter action name it corresponds to. */
function canonicalDestructiveAction(rawMatch) {
    if (!rawMatch) return null;
    if (rawMatch === "shutdown") return "shutdown";
    if (rawMatch === "restart" || rawMatch === "reboot") return "restart";
    if (rawMatch.startsWith("lock")) return "lock";
    if (rawMatch.includes("sleep")) return "sleep";
    if (rawMatch === "logoff" || rawMatch === "log off") return "logoff";
    if (rawMatch === "terminate" || rawMatch === "kill") return "terminateProcess";
    if (rawMatch.includes("clear") && rawMatch.includes("download")) return "clearDownloads";
    if (rawMatch.includes("clear") && rawMatch.includes("history")) return "clearHistory";
    return rawMatch;
}

/**
 * Ordered rule table. Order matters: earlier rules win, so more
 * specific/higher-risk categories (system_command, memory, goal,
 * evolution) are checked before the broad research/information
 * fallback.
 */
const RULES = [
    {
        category: "presentation",
        patterns: [
            /\b(?:create|make|build|prepare|generate)\b.{0,100}\b(?:pptx?|power\s*point|presentation|slides)\b/i,
            /\b(?:research|look\s+up)\b.{0,100}\b(?:and|then)\b.{0,40}\b(?:create|make|build|prepare|generate)\b.{0,60}\b(?:pptx?|power\s*point|presentation|slides)\b/i,
            /(?:बनाओ|बना\s+दो|तैयार\s+करो).{0,80}(?:पीपीटी|प्रेजेंटेशन|स्लाइड)/iu
        ]
    },
    {
        category: "system_command",
        patterns: [
            "shutdown",
            "restart",
            "reboot",
            /\bturn off (?:my |the )?(computer|pc|system|laptop)\b/,
            /\block (the )?(computer|pc|screen)\b/,
            "sleep the computer",
            "shut down",
            "log off",
            "logoff",
            /\bterminate (the )?process\b/,
            /\bkill (the )?process\b/,
            /\bend task\b/
        ]
    },
    {
        // Checked before generic browser_action patterns so a destructive
        // browser request is never mistaken for a plain navigation one.
        category: "browser_action",
        patterns: [
            /\bclear (my )?(browser )?history\b/,
            /\bclear (my )?downloads\b/,
            /\bnew tab\b/,
            /\bclose (this |the )?tab\b/,
            /\bswitch (to )?tab\b/,
            /\b(go back|navigate back)\b/,
            /\b(go forward|navigate forward)\b/,
            /\breload\b/,
            /\brefresh (the )?page\b/,
            /\bstop loading\b/
        ]
    },
    {
        category: "memory",
        patterns: [
            /\bremember\b/,
            /\brecall\b/,
            /\bforget\b/,
            /\bwhat do you remember\b/,
            /\bdo you remember\b/
        ]
    },
    {
        category: "goal",
        patterns: [/\bgoal(s)?\b/, /\bmy goal\b/, /\bset a goal\b/, /\btrack (my )?progress\b/]
    },
    {
        category: "evolution",
        patterns: [
            /\bevolve\b/,
            /\bevolution\b/,
            /\bimprove yourself\b/,
            /\bself[- ]improve\b/,
            /\bupgrade yourself\b/,
            /\bpropose (an? )?improvement\b/
        ]
    },
    {
        category: "task",
        patterns: [/\bcontinue (my )?(previous |last )?task\b/, /\bresume (my )?task\b/, /\bresume\b/, /\btask status\b/, /\bcancel (my )?task\b/]
    },
    {
        // Checked BEFORE application_action: "open chrome and search X" must
        // route through the existing browser system, not a bare app-launch.
        category: "browser_action",
        patterns: [
            /\b.+\s+(find|search)\s+(on|in)\s+(google|youtube|the web|browser)\b/,
            /\b(find|search) .+\b(on|in) (google|youtube|the web|browser)\b/,
            /\b(open|go to) .+\b(in|on) (the )?(browser|chrome|edge)\b/,
            /\bsearch (for )?.+ (on|in) (google|chrome|the browser|the web)\b/,
            /\bopen (chrome|the browser) and search\b/,
            /\bgo to https?:\/\//,
            /\bnavigate to\b/,
            /\bbrowse to\b/
        ]
    },
    {
        category: "application_action",
        patterns: [
            /\bopen (chrome|notepad|calculator|word|excel|spotify|vs code|vscode|explorer)\b/,
            /\b(open|launch|start) .{1,80}/,
            /\blaunch\b/,
            /\bstart (the )?(app|application|program)\b/,
            /\bclose (chrome|notepad|calculator|word|excel|spotify)\b/
        ]
    },
    {
        category: "research",
        patterns: [
            /\b(find|search) .+\b(on|in) wikipedia\b/,
            /^what is\b/,
            /^what are\b/,
            /^who is\b/,
            /^who was\b/,
            /^where is\b/,
            /^when (was|did|is)\b/,
            /^how (many|much|far|tall|old)\b/,
            /\bresearch\b/,
            /\blook up\b/,
            /\bfind information (about|on)\b/
        ]
    },
    {
        category: "conversation",
        patterns: [
            /^(hi|hello|hey|good morning|good evening|good night)\b/,
            /\bhow are you\b/,
            /\bthank you\b/,
            /\bthanks\b/,
            /\bwho are you\b/,
            /\bwhat can you do\b/
        ]
    }
];

/**
 * Classifies a single user request deterministically.
 *
 * @param {string} text
 * @returns {{category:string, confidence:number, matched:string|null, destructiveAction:string|null}}
 */
function classify(text) {
    const normalized = normalize(text);

    if (!normalized) {
        return { category: "unsupported", confidence: 0, matched: null, destructiveAction: null };
    }

    const rawDestructiveMatch = extractDestructiveAction(normalized);
    const destructiveAction = canonicalDestructiveAction(rawDestructiveMatch);

    for (const rule of RULES) {
        if (matchesAny(normalized, rule.patterns)) {
            return {
                category: rule.category,
                confidence: 1,
                matched: rule.category,
                destructiveAction
            };
        }
    }

    // Fallback: a question-shaped sentence we didn't already match is
    // treated as "information" (still fully deterministic — no
    // model call).
    if (/\?\s*$/.test(normalized)) {
        return { category: "information", confidence: 0.5, matched: "fallback-question", destructiveAction };
    }

    // A request naming a destructive action that no other rule claimed
    // (e.g. "delete my files") is still a real, actionable request — it
    // must never be silently downgraded to "unsupported" just because it
    // didn't match a more specific pattern, since that would also mean
    // it never gets safetyGate's approval gate. Route it to
    // system_command instead, where STEP 9 of the project brief already
    // requires explicit approval before anything runs.
    if (destructiveAction) {
        return { category: "system_command", confidence: 0.6, matched: "fallback-destructive", destructiveAction };
    }

    return { category: "unsupported", confidence: 0, matched: null, destructiveAction: null };
}

module.exports = {
    classify,
    extractPresentationTopic,
    CATEGORIES,
    DESTRUCTIVE_ACTIONS,
    canonicalDestructiveAction
};
