"use strict";
const fs = require("fs");
const path = require("path");
const whisperProvider = require("./stt/whisper/provider");
const transcriptCorrection = require("./stt/correction");
const whisperFallback = require("./src/speech/whisperFallback");
const ENGINE_NAME = "whisper";

// ============================================================
// CONFIGURABLE VAD — read from config/voice_settings.json
// ============================================================
const VOICE_SETTINGS_PATH = path.join(__dirname, "config", "voice_settings.json");
const VOICE_SETTINGS_DEFAULTS = {
    engine: "auto",
    silenceRmsThreshold: 0.002,
    minAudioSamples: 1600,
    trimSilence: true,
    hallucinationRepeatThreshold: 0.75,
    enableCorrection: true,
    sampleRate: 16000
};
let VOICE_SETTINGS = { ...VOICE_SETTINGS_DEFAULTS };
try {
    const raw = fs.readFileSync(VOICE_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    VOICE_SETTINGS = { ...VOICE_SETTINGS_DEFAULTS, ...parsed };
    console.log("[STT] voice_settings.json loaded:", JSON.stringify({
        engine: VOICE_SETTINGS.engine,
        silenceRmsThreshold: VOICE_SETTINGS.silenceRmsThreshold,
        minAudioSamples: VOICE_SETTINGS.minAudioSamples,
        trimSilence: VOICE_SETTINGS.trimSilence
    }));
} catch (e) {
    console.warn("[STT] voice_settings.json not readable, using defaults:", e.message);
}

const MIN_AUDIO_SAMPLES = VOICE_SETTINGS.minAudioSamples;
const SILENCE_RMS_THRESHOLD = VOICE_SETTINGS.silenceRmsThreshold;
const HALLUCINATION_REPEAT = VOICE_SETTINGS.hallucinationRepeatThreshold;
let listening = false;

// ============================================================
// ENGINE SELECTION
//   "auto"      whisper.cpp (offline, subprocess) first, local
//               transformers.js Whisper as fallback
//   "whisper"   whisper.cpp only — no fallback
//   "whisper-js" local Whisper (transformers.js, in-process) only
// Set via config/voice_settings.json -> "engine".
// Legacy values "vosk" / "sravaani" (pre-migration configs) are
// treated as "auto".
// ============================================================
const RAW_ENGINE_SETTING = String(VOICE_SETTINGS.engine || "").trim().toLowerCase();
const STT_ENGINE_MODE = ["auto", "whisper", "whisper-js"].includes(RAW_ENGINE_SETTING)
    ? RAW_ENGINE_SETTING
    : "auto"; // vosk / sravaani / unknown -> auto

console.log(`[STT][INIT] Voice settings loaded — engine mode: ${STT_ENGINE_MODE}`);

function getVoiceSettings() {
    return { ...VOICE_SETTINGS };
}

function normalizeSamples(input) {
    if (input instanceof Float32Array) return input;
    if (ArrayBuffer.isView(input)) return Float32Array.from(input);
    if (Array.isArray(input)) return Float32Array.from(input);
    throw new TypeError("Audio samples must be a Float32Array or number array.");
}
function sanitizeSamples(input) {
    const s = normalizeSamples(input); const o = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) { const v = Number(s[i]); o[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }
    return o;
}
function isSilent(samples) {
    if (!samples.length) return true;
    let sum = 0; for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length) < SILENCE_RMS_THRESHOLD;
}
function trimSilence(samples) {
    if (!samples.length) return samples;
    const fs = 160; let first = 0, last = samples.length;
    const rms = (s, e) => { let sum = 0; for (let i = s; i < e; i++) sum += samples[i] * samples[i]; return Math.sqrt(sum / Math.max(1, e - s)); };
    while (first + fs < last && rms(first, Math.min(first + fs, last)) < SILENCE_RMS_THRESHOLD) first += fs;
    while (last - fs > first && rms(Math.max(first, last - fs), last) < SILENCE_RMS_THRESHOLD) last -= fs;
    return first === 0 && last === samples.length ? samples : samples.slice(first, last);
}
function isLikelyHallucination(text) {
    const w = String(text || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (w.length < 8) return false;
    const c = new Map(); for (const word of w) c.set(word, (c.get(word) || 0) + 1);
    return Math.max(...c.values()) / w.length >= HALLUCINATION_REPEAT;
}
function isSupportedLanguageText(text) {
    const value = String(text || ""); if (!value.trim()) return true;
    for (const ch of value) {
        if (!/\p{L}/u.test(ch)) continue;
        if (!/\p{Script=Latin}/u.test(ch) && !/\p{Script=Devanagari}/u.test(ch)) return false;
    }
    return true;
}
const UNSUPPORTED_LANGUAGE_ERROR = "Sorry — main sirf Hindi, English aur Hinglish samajhta hoon. (I only understand Hindi, English and Hinglish.)";
function normalizeWhisperLanguage(language) {
    const v = String(language || "").trim().toLowerCase(); if (!v) return undefined;
    const b = v.split(/[-_]/)[0]; return /^[a-z]{2}$/.test(b) ? b : undefined;
}
function getModelStatus() {
    const w = whisperProvider.getStatus();
    const js = whisperFallback.getStatus();
    // Combined, backward-compatible status. `ready`/`loading` reflect the
    // engines actually in play for the configured mode, so the renderer's
    // first-run timeout logic ("LOADING VOICE MODEL...", 180s window)
    // keeps working.
    const useWhisperCpp = STT_ENGINE_MODE !== "whisper-js";
    const useWhisperJs = STT_ENGINE_MODE !== "whisper";
    return {
        ready: (useWhisperCpp && w.ready) || (useWhisperJs && js.ready),
        loading: (useWhisperCpp && w.loading) || (useWhisperJs && js.loading),
        error: (useWhisperCpp && w.lastError) || (useWhisperJs && js.error) || null,
        engine: STT_ENGINE_MODE,
        model: STT_ENGINE_MODE === "whisper-js" ? js.model : w.model.path,
        offline: true,
        mode: STT_ENGINE_MODE,
        whisper: w,               // whisper.cpp detail (executable + model status)
        whisperJs: {              // transformers.js fallback detail
            ready: js.ready,
            loading: js.loading,
            error: js.error,
            model: js.model,
            modelPath: js.modelPath,
            modelCached: js.modelCached
        },
        // Backward-compatible aliases (old UI/tests read these flat fields)
        whisperReady: js.ready,
        whisperLoading: js.loading,
        whisperError: js.error,
        whisperModel: js.model,
        whisperModelPath: js.modelPath,
        whisperCached: js.modelCached
    };
}
function warmUp() {
    if (STT_ENGINE_MODE === "whisper-js") {
        whisperFallback.warmUp();
        return;
    }
    // AUTO / whisper: warm whisper.cpp (validates executable + model,
    // auto-downloads them once if allowed). If whisper.cpp can't be made
    // available, pre-load the local transformers.js Whisper fallback in
    // the background so a cold first utterance isn't stuck mid-conversation.
    whisperProvider.warmUp().then((ok) => {
        if (!ok && STT_ENGINE_MODE === "auto") {
            console.warn("[STT][INIT] whisper.cpp unavailable — preloading local Whisper (transformers.js) fallback...");
            whisperFallback.warmUp();
        }
    });
}
async function transcribeSamples(input, options = {}) {
    let samples = sanitizeSamples(input);
    if (!samples.length || samples.length < MIN_AUDIO_SAMPLES) return { success: false, error: "Audio recording is too short." };
    samples = VOICE_SETTINGS.trimSilence !== false ? trimSilence(samples) : samples;
    if (!samples.length || isSilent(samples)) { listening = false; return { success: false, error: "No speech detected." }; }
    // Re-check the minimum length AFTER trimming: a momentary spike/cough
    // trims down to a sliver that passes the RMS check but is far too short
    // to be real speech — sending that to the STT engine (and triggering a
    // first-use model download for it) is pointless.
    if (samples.length < MIN_AUDIO_SAMPLES) { listening = false; return { success: false, error: "Audio recording is too short." }; }
    listening = false;

    // ---- ENGINE CHAIN ---------------------------------------
    let result = null;
    if (STT_ENGINE_MODE !== "whisper-js") {
        try {
            result = await whisperProvider.transcribeSamples(samples, { sampleRate: 16000, language: options.language });
        } catch (error) {
            result = { success: false, error: `WHISPER ERROR: ${error?.message || String(error)}`, code: "WHISPER_ERROR" };
        }
        if (!result.success) {
            if (STT_ENGINE_MODE === "whisper") {
                return { success: false, error: result.error || "Whisper transcription failed.", code: result.code || "WHISPER_FAILED" };
            }
            console.warn(`[STT][ENGINE] whisper.cpp failed (${result.error}) — falling back to local Whisper (transformers.js)`);
            result = null;
        }
    }
    if (!result) {
        try {
            result = await whisperFallback.transcribeSamples(samples, { language: options.language });
        } catch (error) {
            return { success: false, error: `WHISPER ERROR: ${error?.message || String(error)}`, code: "WHISPER_ERROR" };
        }
        if (!result.success) {
            return { success: false, error: result.error || "Whisper transcription failed.", code: result.code || "WHISPER_FAILED" };
        }
    }

    // ---- SHARED POST-PROCESSING (correction + language) ------
    try {
        let text = String(result.text || "").replace(/\s+/g, " ").trim();
        if (!text) return { success: false, error: `Empty transcript from ${result.engine || "STT engine"}.` };
        if (isLikelyHallucination(text)) return { success: false, error: "Unclear speech detected. Please try again." };
        if (!isSupportedLanguageText(text)) { console.warn("[STT] Unsupported language input — rejected."); return { success: false, error: UNSUPPORTED_LANGUAGE_ERROR, code: "UNSUPPORTED_LANGUAGE" }; }
        const cr = transcriptCorrection.correct(text, { enableCorrection: options.enableCorrection !== undefined ? options.enableCorrection !== false : VOICE_SETTINGS.enableCorrection !== false });
        const correctedText = cr.corrected; const lang = transcriptCorrection.detectLanguage(correctedText);
        if (cr.changed) console.log(`[STT] Correction: "${text}" -> "${correctedText}"`);
        console.log(`[STT] Transcript (${result.engine || ENGINE_NAME}, ${lang}): "${correctedText}"`);
        return { success: true, text: correctedText, rawText: text, engine: result.engine || ENGINE_NAME, offline: true, language: lang, detectedLanguage: result.language, confidence: (typeof result.confidence === "number") ? result.confidence : null, corrections: cr.corrections, durationMs: result.durationMs, timestamp: Date.now() };
    } catch (error) { return { success: false, error: `STT POST-PROCESS ERROR: ${error?.message || String(error)}`, code: "STT_POSTPROCESS" }; }
}
// ---- MICROPHONE / SESSION LIFECYCLE ---------------------------
// `listening` is the single source of truth for "is a recognition
// session active". Every entry point below goes through it, so
// calling startListening() twice in a row cannot spin up two
// concurrent sessions, and stop/cleanup are always safe to call
// even if nothing is running. (The renderer captures the mic and
// pushes audio; this module guards the recognition session state.)
let paused = false;
function startListening() {
    if (listening) return { started: false, reason: "Already listening." };
    listening = true; paused = false;
    return { started: true };
}
async function stopListeningAndTranscribe() {
    if (!listening) return { success: false, error: "Not currently listening." };
    listening = false; paused = false;
    return { success: false, error: "No audio samples were supplied by the renderer." };
}
function pauseListening() {
    if (!listening) return { paused: false, reason: "Not currently listening." };
    paused = true;
    return { paused: true };
}
function resumeListening() {
    if (!listening) return { resumed: false, reason: "Not currently listening." };
    paused = false;
    return { resumed: true };
}
function cleanup() {
    listening = false; paused = false;
    whisperProvider.cleanup();
}
function isCurrentlyListening() { return listening && !paused; }
function normalizeLanguageTag(language) { return normalizeWhisperLanguage(language); }

// Forward whisper.cpp download/setup progress to a listener
// (main.js uses this to emit IPC events to the UI).
function setProgressListener(fn) {
    whisperProvider.setProgressListener(fn);
}

module.exports = {
    startListening, stopListeningAndTranscribe, pauseListening, resumeListening, cleanup,
    transcribeSamples, isCurrentlyListening,
    normalizeWhisperLanguage, normalizeLanguageTag,
    sanitizeSamples, isSilent, trimSilence, isLikelyHallucination, isSupportedLanguageText,
    warmUp, getModelStatus, getVoiceSettings, setProgressListener,
    ENGINE_NAME, DEFAULT_MODEL: ENGINE_NAME
};
