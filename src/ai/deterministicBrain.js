"use strict";

/**
 * ============================================================
 * JARVIS PRO MAX — DETERMINISTIC BRAIN
 * src/ai/deterministicBrain.js
 * ============================================================
 * The ONLY "thinking" engine in the main process.
 * ZERO AI / ZERO LLM / ZERO network model loading.
 *
 * Composes replies deterministically from:
 *   - locally learned knowledge (offline knowledge cache)
 *   - deterministic language templates (en / hi / hinglish)
 *   - stable hash-based variant selection (same input →
 *     same output, every run — no randomness)
 *
 * If knowledge is missing, it answers HONESTLY and flags the
 * topic for background research (the learning system picks it
 * up on its next cycle).
 * ============================================================
 */

// ------------------------------------------------------------
// Stable string hash (djb2) — deterministic variant selection
// ------------------------------------------------------------
function stableHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
    }
    return h;
}

function pickVariant(pool, key) {
    if (!pool || !pool.length) return "";
    return pool[stableHash(String(key || "")) % pool.length];
}

// ------------------------------------------------------------
// Language templates
// ------------------------------------------------------------
const TEMPLATES = {
    en: {
        knowledgeOpen: [
            "Here's what I know about {topic}.",
            "From my knowledge base on {topic}.",
            "I can tell you about {topic}.",
        ],
        knowledgeFollowUp: [
            "Want me to look up more on this?",
            "Should I research this further?",
            "Ask me anything else about it.",
        ],
        unknown: [
            "I don't have verified knowledge about \"{topic}\" yet. I've queued it for research — ask me again shortly.",
            "That's not in my knowledge base yet. I've marked \"{topic}\" for background learning.",
            "I can't answer that from my local knowledge yet. I've queued \"{topic}\" so I can learn it.",
        ],
        learnedLine: "Learned from {source}.",
    },
    hi: {
        knowledgeOpen: [
            "{topic} के बारे में मेरे पास यह जानकारी है।",
            "{topic} के बारे में मुझे यह पता है।",
        ],
        knowledgeFollowUp: [
            "इसके बारे में और पता करूँ?",
            "कुछ और पूछना चाहेंगे?",
        ],
        unknown: [
            "\"{topic}\" के बारे में मेरे पास अभी कोई पक्की जानकारी नहीं है। मैंने इसे सीखने के लिए queue कर दिया है — थोड़ी देर में फिर पूछिए।",
            "यह मेरे knowledge base में अभी नहीं है। मैं \"{topic}\" background learning में डाल देता हूँ।",
        ],
        learnedLine: "{source} से सीखा।",
    },
    hinglish: {
        knowledgeOpen: [
            "{topic} ke baare mein mujhe yeh pata hai.",
            "{topic} ke baare mein maine yeh seekha hai.",
        ],
        knowledgeFollowUp: [
            "Iske baare mein aur research karoon?",
            "Aur kuch poochna hai iske baare mein?",
        ],
        unknown: [
            "\"{topic}\" ke baare mein mere paas abhi knowledge nahi hai. Maine ise research queue mein daal diya hai — thodi der mein firse pooch lena.",
            "Yeh abhi mere knowledge base mein nahi hai. Maine \"{topic}\" learn karne ke liye mark kar diya hai.",
        ],
        learnedLine: "{source} se seekha.",
    },
};

function templatesFor(language) {
    if (language === "hi") return TEMPLATES.hi;
    if (language === "hinglish") return TEMPLATES.hinglish;
    return TEMPLATES.en;
}

function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (_, k) =>
        vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : "");
}

// ------------------------------------------------------------
// Topic extraction (deterministic, main process)
// ------------------------------------------------------------
const STOP_WORDS = new Set([
    "what", "who", "when", "where", "why", "how", "is", "are", "was", "were",
    "the", "a", "an", "of", "about", "tell", "me", "kya", "kaun", "kab",
    "kahan", "kyun", "kaise", "hai", "hain", "tha", "the", "ka", "ki", "ke",
    "batao", "bata", "mujhe", "please", "jarvis", "do", "does", "did",
    "can", "you", "u", "explain", "describe", "define", "information",
    "info", "details", "ka", "baare", "baarein", "mein", "me", "in", "on",
    "for", "and", "to", "sikha", "sikhaao", "seekh",
]);

function extractTopic(text) {
    const words = String(text || "")
        .toLowerCase()
        .replace(/[?!.,;:"'`]/g, " ")
        .split(/\s+/)
        .filter((w) => w && !STOP_WORDS.has(w));
    if (!words.length) return String(text || "").trim().slice(0, 80);
    return words.slice(0, 6).join(" ");
}

// ------------------------------------------------------------
// Main composer
// ------------------------------------------------------------
/**
 * Compose a deterministic reply.
 *
 * @param {Object} input
 * @param {string} input.text          — raw user text
 * @param {string} [input.language]    — "en" | "hi" | "hinglish"
 * @param {Array}  [input.localKnowledge] — offline learned knowledge
 *        entries: { topic, content, source, sourceUrl, timestamp }
 *
 * @returns {{ reply: string, source: string, topic: string,
 *             usedKnowledge: boolean, researchQueued: boolean }}
 */
function compose(input = {}) {
    const text = String(input.text || "").trim();
    const language = ["hi", "hinglish"].includes(input.language) ? input.language : "en";
    const t = templatesFor(language);
    const topic = extractTopic(text);

    // ---- 1. Knowledge-first ----
    const knowledge = Array.isArray(input.localKnowledge) ? input.localKnowledge : [];
    if (knowledge.length > 0) {
        const best = knowledge[0];
        const open = fill(pickVariant(t.knowledgeOpen, text), { topic: topic });
        const follow = pickVariant(t.knowledgeFollowUp, text + "|follow");
        const learned = fill(t.learnedLine, { source: best.source || "my knowledge base" });
        const urlLine = best.sourceUrl ? `\n\nSource: ${best.sourceUrl}` : "";
        const reply = `${open}\n\n${best.content}\n\n${learned}${urlLine}\n\n${follow}`;
        return {
            reply: reply.trim(),
            source: "deterministic-brain/knowledge",
            topic,
            usedKnowledge: true,
            researchQueued: false,
        };
    }

    // ---- 2. Honest unknown + research queue ----
    const unknown = fill(pickVariant(t.unknown, text), { topic: topic || "that" });
    return {
        reply: unknown,
        source: "deterministic-brain/unknown",
        topic,
        usedKnowledge: false,
        researchQueued: true,
    };
}

module.exports = { compose, extractTopic, stableHash, pickVariant, TEMPLATES };
