"use strict";

/**
 * ============================================================
 * JARVIS MISTAKE-LEARNING LEDGER
 * ============================================================
 *
 * Purpose (as requested):
 *   Jarvis apni galtiyon se seekh sake — jab user Jarvis ko
 *   batata hai ki uska jawab galat tha, aur sahi jawab kya hai,
 *   to Jarvis usse yaad rakhe aur agli baar wahi galti na dohraye.
 *
 * This is intentionally simple and honest about what it is: a
 * disk-backed ledger of (question -> wrong answer -> correction)
 * plus a fuzzy lookup, NOT a neural-network fine-tuning system.
 * That keeps it fully offline, fast, explainable, and safe to
 * ship inside an Electron app with no GPU/training step.
 *
 * Storage: userData/jarvis_mistakes.json — a plain JSON array,
 * so it survives app restarts (unlike renderer localStorage,
 * which some of the existing agents use).
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 5000;
const MATCH_THRESHOLD = 0.45; // fraction of overlapping meaningful words

let FILE_PATH = null;
let BASE_DIR = null;
let ACTIVE_USER_ID = "guest";
let ledger = []; // { id, timestamp, userMessage, jarvisResponse, correction, tokens }

const STOPWORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "in",
    "on", "for", "kya", "hai", "hain", "ka", "ki", "ke", "ko", "se", "ye",
    "yeh", "wo", "woh", "me", "mein", "aur", "kaun", "kab", "kaha", "kyu",
    "kyun", "batao", "bata", "please", "tha", "thi", "the"
]);

/* ============================================================
   INIT / PERSISTENCE
============================================================ */

function init(baseDir) {
    BASE_DIR = baseDir;
    const guestFile = path.join(BASE_DIR, "jarvis_mistakes_guest.json");
    const legacyFile = path.join(BASE_DIR, "jarvis_mistakes.json");
    FILE_PATH = !fs.existsSync(guestFile) && fs.existsSync(legacyFile) ? legacyFile : guestFile;

    return loadLedger();
}

function loadLedger() {
    ledger = [];

    try {
        if (fs.existsSync(FILE_PATH)) {
            const raw = fs.readFileSync(FILE_PATH, "utf8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) ledger = parsed;
        }
    } catch (error) {
        ledger = [];
    }

    return { success: true, file: FILE_PATH, entries: ledger.length };
}

function setActiveUser(userId) {
    if (!BASE_DIR) return { success: false, error: "Learning store is not initialized." };
    const safeId = String(userId || "guest").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "guest";
    if (safeId === ACTIVE_USER_ID) return { success: true, userId: safeId, entries: ledger.length };
    persist();
    ACTIVE_USER_ID = safeId;
    FILE_PATH = path.join(BASE_DIR, `jarvis_mistakes_${safeId}.json`);
    return { ...loadLedger(), userId: safeId };
}

function persist() {
    if (!FILE_PATH) return false;
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(ledger, null, 2), "utf8");
        return true;
    } catch (error) {
        return false;
    }
}

/* ============================================================
   TEXT HELPERS
============================================================ */

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function similarity(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;

    const setB = new Set(tokensB);
    const overlap = tokensA.filter((word) => setB.has(word)).length;

    return overlap / Math.max(tokensA.length, tokensB.length);
}

/* ============================================================
   PUBLIC API
============================================================ */

/**
 * Records a mistake: what the user asked, what Jarvis wrongly
 * answered, and what the correct answer actually is.
 */
function recordMistake({ userMessage, jarvisResponse, correction } = {}) {
    if (!userMessage || !correction) {
        return { success: false, error: "userMessage and correction are required." };
    }

    const entry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        userMessage: String(userMessage),
        jarvisResponse: String(jarvisResponse || ""),
        correction: String(correction),
        tokens: tokenize(userMessage)
    };

    ledger.push(entry);

    if (ledger.length > MAX_ENTRIES) {
        ledger = ledger.slice(ledger.length - MAX_ENTRIES);
    }

    persist();

    return { success: true, entry };
}

/**
 * Given a new user message, looks for the closest past mistake
 * and returns its correction if the match is confident enough.
 */
function findLesson(message) {
    const queryTokens = tokenize(message);

    if (!queryTokens.length || !ledger.length) {
        return { success: true, found: false };
    }

    let best = null;
    let bestScore = 0;

    for (const entry of ledger) {
        const score = similarity(queryTokens, entry.tokens || tokenize(entry.userMessage));
        if (score > bestScore) {
            bestScore = score;
            best = entry;
        }
    }

    if (best && bestScore >= MATCH_THRESHOLD) {
        return {
            success: true,
            found: true,
            confidence: Number(bestScore.toFixed(2)),
            correction: best.correction,
            originalMistake: best.jarvisResponse,
            originalQuestion: best.userMessage,
            learnedAt: best.timestamp
        };
    }

    return { success: true, found: false };
}

function getAll(limit = 200) {
    return {
        success: true,
        entries: ledger.slice(-limit).reverse()
    };
}

function clearAll() {
    ledger = [];
    persist();
    return { success: true };
}

module.exports = {
    init,
    setActiveUser,
    recordMistake,
    findLesson,
    getAll,
    clearAll
};
