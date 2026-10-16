"use strict";

const WAKE_WORD_PATTERN = /\b(?:hey\s+|hi\s+|okay\s+|ok\s+|suno\s+)?jarvis\b/i;

function detectWakeWord(transcript) {
    const text = String(transcript || "").trim();
    const match = text.match(WAKE_WORD_PATTERN);
    if (!match) return { detected: false, remainder: "" };
    return {
        detected: true,
        phrase: match[0],
        remainder: text.slice(match.index + match[0].length).trim()
    };
}

module.exports = { detectWakeWord, WAKE_WORD_PATTERN };
