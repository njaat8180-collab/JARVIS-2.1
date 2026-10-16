"use strict";

/**
 * JARVIS Speech-to-Text Module with Enhanced Language Detection
 * Integrates with voiceSTT.js (offline whisper.cpp engine + local
 * transformers.js Whisper fallback) and adds sophisticated
 * language detection for Hindi, English, and Hinglish.
 *
 * detectLanguage() classifies a transcript as:
 *   - "hi"        → Devanagari script only (pure Hindi)
 *   - "hinglish"  → mixed script (Devanagari + Latin) OR romanized Hindi
 *   - "en"        → pure English / no Hindi markers
 */

const voiceSTT = require("../../voiceSTT");

/* ---- Devanagari (Hindi script) ---- */
const HINDI_DEVANAGARI = /[\u0900-\u097F]/;
// Common Devanagari function words / connectors (word-boundary aware)
const HINDI_WORDS = /(?:यह|है|के|लिए|और|हैं|की|का|पर|से|ने|तो|ही|भी|था|थी|थे|गया|गई|गए|रहा|रही|रहे|कर|करता|करती|करते|जाएगा|जाएगी|जाएंगे|सकता|सकती|सकते|चाहिए|मिला|मिली|मिले|आया|आई|आए|लगा|लगी|लगे|बोला|बोली|बोले|सुना|सुनी|सुने|देखा|देखी|देखे|पूछा|पूछी|पूछे|कहा|कही|कहे|क्या|कैसे|क्यों|कब|कहाँ|कितना|कितनी|कितने|कौन|कौनसी|कौनसे|किस|किसे|किसको|किसकी|किसका|मुझे|हमें|आप|तुम|हम|मेरा|मेरी|मेरे|अभी|आज|कल|फिर|अगर|तो|नहीं|ना|हाँ|जी|खोलो|बंद|बताओ|दिखाओ|चलाओ)\b/;

/* ---- Romanized Hindi markers (Hinglish) ----
   STRONG = unambiguous Hindi-in-Latin verbs/markers; one hit ⇒ Hinglish.
   WEAK   = ambiguous function words (also English: "to", "hi", "do");
            require ≥2 distinct hits to count as Hinglish. */
const HINDI_ROMAN_STRONG = /\b(kholo|khol|batao|batayein|bataiyega|dikhao|dikha|chalao|chalu|shuru|nikalo|lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humko|humne|tumne|apne|nahin|nahi|kya|kyun|kyu|kahaan|kahan|kaise|kyunki|kyuki|kitna|kitni|kitne|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|karti|karta|karte|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|matlab|samajh|wala|wali|suno|bolo|jao|aao)\b/i;
const HINDI_ROMAN_WEAK = /\b(hai|hain|hoon|hun|tha|thi|the|gaya|mera|meri|mere|hum|hume|aap|tum|kaun|kab|kaisa|kaisi|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|lo|par|pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar)\b/gi;

/**
 * Detect language from text with enhanced accuracy.
 * @param {string} text - Input text to analyze
 * @returns {string} - 'hi' | 'hinglish' | 'en'
 */
function detectLanguage(text) {
    const value = String(text || "").trim();
    if (!value) return "en";

    const hasDevanagari = HINDI_DEVANAGARI.test(value);
    const hasLatin = /[A-Za-z]/.test(value);

    // Mixed-script (Devanagari + Latin) ⇒ Hinglish (code-switched)
    if (hasDevanagari && hasLatin) return "hinglish";

    // Pure Devanagari ⇒ Hindi
    if (hasDevanagari) {
        // Still call it Hinglish if it also carries Latin tech terms —
        // caught above; here it's pure Hindi script.
        return "hi";
    }

    // Latin only — detect romanized Hindi before defaulting to English.
    if (hasLatin) {
        if (HINDI_ROMAN_STRONG.test(value)) return "hinglish";
        const weakHits = new Set(
            (value.match(HINDI_ROMAN_WEAK) || []).map((w) => w.toLowerCase())
        ).size;
        if (weakHits >= 2) return "hinglish";
    }

    return "en";
}

/**
 * Map a detected language to the STT forced-language hint.
 * Whisper's multilingual model handles mixed Hindi-English
 * (Hinglish) speech best with auto-detect, so Hinglish maps to
 * auto (undefined) rather than forcing a single language.
 * @param {string} language - Detected language
 * @returns {string} - Forced language code ("hi" | "en") or undefined for auto
 */
function getSTTLanguageCode(language) {
    const codes = {
        hi: "hi",
        en: "en",
        hinglish: undefined
    };
    return codes[language] || undefined;
}

/**
 * Enhanced transcribe with automatic language detection.
 * Language is preserved as metadata only — no second model pass
 * (Phase 9 contract is offline-only).
 * @param {Float32Array|Array} samples - Audio samples
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} - Transcription result with detected language
 */
async function transcribeWithLanguageDetection(samples, options = {}) {
    try {
        const result = await voiceSTT.transcribeSamples(samples, {
            ...options,
            language: options.language || undefined
        });
        if (!result.success) return result;

        const detectedLanguage = detectLanguage(result.text);
        return {
            ...result,
            detectedLanguage,
            language: getSTTLanguageCode(detectedLanguage)
        };
    } catch (error) {
        return { success: false, error: error?.message || "Transcription failed." };
    }
}

function startListening() {
    return voiceSTT.startListening();
}

async function stopListeningAndTranscribe() {
    return voiceSTT.stopListeningAndTranscribe();
}

function isCurrentlyListening() {
    return voiceSTT.isCurrentlyListening();
}

function normalizeLanguageTag(language) {
    return voiceSTT.normalizeLanguageTag(language);
}

function sanitizeSamples(input) {
    return voiceSTT.sanitizeSamples(input);
}

function isSilent(samples) {
    return voiceSTT.isSilent(samples);
}

module.exports = {
    transcribeWithLanguageDetection,
    detectLanguage,
    getSTTLanguageCode,
    startListening,
    stopListeningAndTranscribe,
    isCurrentlyListening,
    normalizeLanguageTag,
    sanitizeSamples,
    isSilent
};
