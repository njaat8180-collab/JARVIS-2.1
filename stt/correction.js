"use strict";
/**
 * JARVIS — Transcript Correction
 * stt/correction.js
 * Engine-agnostic post-processing (wake-word variants, proper nouns,
 * common mishearings, normalization) applied to whatever STT engine
 * (whisper.cpp primary, transformers.js Whisper fallback) produced the
 * raw transcript. No dependency on any specific recognizer.
 */
const fs = require("fs");
const path = require("path");
const CONFIG_PATH = path.join(__dirname, "..", "config", "speech_corrections.json");
let config = null;

function loadConfig() {
    if (config !== null) return config;
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
    catch (e) { console.warn("[Correction] Failed to load speech_corrections.json:", e.message);
        config = { proper_nouns: {}, wake_word_variants: {}, command_words: {}, common_mishearings: {}, normalization_rules: {} }; }
    return config;
}

function reloadConfig() { config = null; return loadConfig(); }

function replaceLongestFirst(text, mapping) {
    if (!mapping || typeof mapping !== "object") return text;
    const entries = Object.entries(mapping).sort((a, b) => b[0].length - a[0].length);
    let result = text;
    for (const [from, to] of entries) { if (!from || from.length === 0) continue; result = result.split(from).join(to); }
    return result;
}

function correct(rawText, options = {}) {
    const enableCorrection = options.enableCorrection !== false;
    const raw = String(rawText || "").trim();
    if (!raw || !enableCorrection) return { raw, corrected: raw, corrections: [], changed: false };
    const cfg = loadConfig();
    const corrections = [];
    let text = raw;
    // Keep spoken Hindi in Devanagari in the transcript shown to the user.
    // The correction dictionary intentionally contains legacy Hindi→Roman
    // command aliases (e.g. खोलो→kholo, यूट्यूब→YouTube); applying those here
    // made the STT appear to translate the user's Hindi before JARVIS saw it.
    // Hindi command normalization belongs to renderer VoiceTolerance, after
    // this original-language transcript has been delivered and displayed.
    // Correct the assistant wake name and proper nouns in Hindi transcripts
    // while leaving the user's Hindi command words in Devanagari. Translating
    // the whole utterance here made the transcript appear English-only.
    if (cfg.wake_word_variants) { const b = text; text = replaceLongestFirst(text, cfg.wake_word_variants); if (text !== b) corrections.push({ type: "wake_word", from: b, to: text }); }
    if (!/[\u0900-\u097F]/.test(text)) {
        if (cfg.proper_nouns) { const b = text; text = replaceLongestFirst(text, cfg.proper_nouns); if (text !== b) corrections.push({ type: "proper_noun", from: b, to: text }); }
        if (cfg.common_mishearings) { const b = text; text = replaceLongestFirst(text, cfg.common_mishearings); if (text !== b) corrections.push({ type: "mishearing", from: b, to: text }); }
        if (cfg.command_words) { const b = text; text = replaceLongestFirst(text, cfg.command_words); if (text !== b) corrections.push({ type: "command_word", from: b, to: text }); }
    }
    const rules = cfg.normalization_rules || {};
    if (rules.collapse_spaces !== false) text = text.replace(/\s+/g, " ");
    if (rules.trim_whitespace !== false) text = text.trim();
    text = text.replace(/\u0964/g, "."); text = text.replace(/\.{2,}/g, "."); text = text.replace(/\s+\./g, "."); text = text.trim();
    const changed = text !== raw;
    return { raw, corrected: text, corrections, changed };
}

function correctText(rawText, options) { return correct(rawText, options).corrected; }

function detectLanguage(text) {
    const t = String(text || "");
    const hasDevanagari = /[\u0900-\u097F]/.test(t);
    const hasLatin = /[a-zA-Z]/.test(t);
    if (hasDevanagari && hasLatin) return "hinglish";
    if (hasDevanagari) return "hi";
    if (hasLatin) return "en";
    return "auto";
}

module.exports = { correct, correctText, detectLanguage, loadConfig, reloadConfig };
