"use strict";

/*
============================================================
 JARVIS — WHISPER FALLBACK STT ENGINE (transformers.js)
 src/speech/whisperFallback.js
============================================================
 WHY THIS EXISTS
 ---------------
 The primary STT engine is now whisper.cpp
 (stt/whisper/provider.js) — fully offline, subprocess based,
 with a multilingual GGML model. If the whisper.cpp executable
 or model cannot be made available (auto-download disabled,
 network down during first setup, …) every transcription would
 otherwise fail and voice input would appear dead.

 This module is a fully-local Whisper-tiny engine that runs
 IN the Electron main process (Node) via @huggingface/transformers
 (already a project dependency — no Python, no extra install).
 On first use it downloads the quantized model (~40 MB) to a
 visible cache dir and then works offline from then on.

 Selected through config/voice_settings.json -> "engine":
   "auto"        (default) whisper.cpp first, this engine as fallback
   "whisper"     whisper.cpp only (no fallback)
   "whisper-js"  this engine only

 AUDIO FORMAT
 ------------
 Expects mono Float32Array @16 kHz — exactly what the renderer
 (voice.js) already captures and resamples, so no extra
 conversion is needed anywhere in the chain.
============================================================
*/

const fs = require("fs");
const path = require("path");

const MODEL_ID = process.env.WHISPER_JS_MODEL || "Xenova/whisper-tiny";

const state = {
    pipeline: null,      // resolved ASR pipeline
    pipelinePromise: null,
    loading: false,
    ready: false,
    lastError: null,
    cacheDir: null,
    lastProgressLog: 0
};

/* ---------------------------------------------------------
   MODEL CACHE DIR (Priority: works in dev AND packaged app)
   1. If the model ships with the project (models/whisper/<model>/),
      use that — works offline out of the box, dev and packaged alike.
   2. Electron main  -> <userData>/whisper-models  (writable even
      when the app is packaged as asar; used for downloads)
   3. Plain Node     -> <project>/models/whisper      (tests)
--------------------------------------------------------- */
function modelDirExists(dir) {
    try {
        return fs.existsSync(path.join(dir, ...MODEL_ID.split("/"), "config.json"));
    } catch (_) {
        return false;
    }
}

function resolveCacheDir() {
    if (state.cacheDir) return state.cacheDir;

    // 1. Bundled with the project?
    const projectDir = path.join(__dirname, "..", "..", "models", "whisper");
    if (modelDirExists(projectDir)) {
        state.cacheDir = projectDir;
        return projectDir;
    }

    // 2. Electron userData (writable when packaged)
    try {
        if (process.versions && process.versions.electron) {
            const { app } = require("electron");
            if (app && typeof app.getPath === "function") {
                const dir = path.join(app.getPath("userData"), "whisper-models");
                fs.mkdirSync(dir, { recursive: true });
                state.cacheDir = dir;
                return dir;
            }
        }
    } catch (_) { /* fall through to project-local dir */ }

    // 3. Plain Node (tests): project models dir
    try { fs.mkdirSync(projectDir, { recursive: true }); } catch (_) {}
    state.cacheDir = projectDir;
    return projectDir;
}

/* ---------------------------------------------------------
   MODEL VALIDATION (startup-safe, never throws)
   Reports whether the model has already been cached so the
   caller can log an honest "ready" vs "will download on
   first use" status.
--------------------------------------------------------- */
function validateModel() {
    const dir = resolveCacheDir();
    // The model is cached when its own directory + config.json exist under
    // the cache dir (e.g. <cacheDir>/Xenova/whisper-tiny/config.json).
    let hasCache = modelDirExists(dir);
    if (!hasCache && process.versions && process.versions.electron) {
        // Also check the project-bundled copy even when the active cache
        // dir is userData (download target) — that copy is usable read-only.
        try {
            const { app } = require("electron");
            if (app && typeof app.getPath === "function") {
                hasCache = modelDirExists(path.join(path.dirname(app.getAppPath()), "models", "whisper"))
                    || modelDirExists(path.join(app.getAppPath(), "models", "whisper"));
            }
        } catch (_) { /* ignore */ }
    }
    return { model: MODEL_ID, cacheDir: dir, cached: hasCache };
}

/* ---------------------------------------------------------
   PIPELINE LOADER (lazy, single-flight, with progress logs)
--------------------------------------------------------- */
function logProgress(p) {
    if (!p || p.status !== "progress" || typeof p.progress !== "number") return;
    // Throttle: one log per file, at most every 2 seconds
    const now = Date.now();
    if (now - state.lastProgressLog < 2000) return;
    state.lastProgressLog = now;
    console.log(
        `[STT][ENGINE] Downloading Whisper model (${p.file || "file"}): ` +
        `${p.progress.toFixed(1)}%` +
        (p.total ? ` of ${(p.total / 1048576).toFixed(1)} MB` : "")
    );
}

function getPipeline(sessionOptions) {
    if (state.pipelinePromise) return state.pipelinePromise;

    state.loading = true;
    state.lastError = null;
    console.log(`[STT][ENGINE] Initializing local Whisper engine (${MODEL_ID})...`);
    const v = validateModel();
    if (v.cached) {
        console.log(`[STT][MODEL] Model cache found: ${v.cacheDir}`);
    } else {
        const error = new Error(`Offline-only mode: local Whisper model ${MODEL_ID} is not installed. Add the model to ${v.cacheDir} before using this speech fallback.`);
        state.lastError = error.message;
        state.loading = false;
        state.pipelinePromise = Promise.reject(error);
        state.pipelinePromise.catch(() => {});
        return state.pipelinePromise;
    }

    state.pipelinePromise = (async () => {
        const mod = await import("@huggingface/transformers");
        const { pipeline, env } = mod;

        env.cacheDir = v.cacheDir;      // explicit, validated path
        env.allowLocalModels = true;     // use the cache when present

        const asr = await pipeline("automatic-speech-recognition", MODEL_ID, {
            dtype: "q8",                  // quantized — small + fast on CPU
            progress_callback: logProgress,
            ...(sessionOptions ? { session_options: sessionOptions } : {})
        });

        state.ready = true;
        state.loading = false;
        console.log(`[STT][ENGINE] Whisper engine READY (model: ${MODEL_ID}, cache: ${v.cacheDir})`);
        return asr;
    })().catch((error) => {
        state.loading = false;
        state.ready = false;
        state.pipelinePromise = null;   // allow a retry on next use
        state.lastError = error?.message || String(error);
        console.error(`[STT][ERROR] Whisper engine failed to initialize: ${state.lastError}`);
        if (/fetch|ENOTFOUND|network|ECONN/i.test(state.lastError)) {
            console.error("[STT][ERROR] This looks like a network problem — the model needs to download once. Check internet / firewall (huggingface.co).");
        } else if (/Cannot find module|onnxruntime/i.test(state.lastError)) {
            console.error("[STT][ERROR] @huggingface/transformers may not be installed — run: npm install");
        }
        throw error;
    });

    return state.pipelinePromise;
}

/* ---------------------------------------------------------
   TRANSCRIBE
   samples: Float32Array mono @16 kHz
   options.language: optional 'en' | 'hi' (2-letter). Omit
   for Whisper auto-detect (recommended for Hinglish).
--------------------------------------------------------- */
async function transcribeSamples(samples, options = {}) {
    if (!samples || !samples.length) {
        return { success: false, error: "Empty audio" };
    }

    const startedAt = Date.now();
    let asr;
    try {
        asr = await getPipeline();
    } catch (error) {
        return {
            success: false,
            error: `WHISPER INIT FAILED: ${error?.message || String(error)}`,
            code: "WHISPER_INIT_FAILED"
        };
    }

    const lang = normalizeLanguage(options.language);

    // ORT spins up its thread pool lazily on first inference. On constrained
    // environments (limited process/thread quotas) that can fail with
    // "pthread_create failed" — in that case rebuild the pipeline pinned to
    // a single thread and try once more.
    let output;
    try {
        output = await runInference(asr, samples, lang);
    } catch (error) {
        const msg = String(error?.message || error);
        if (!/pthread|thread|Cannot allocate/i.test(msg)) {
            return { success: false, error: `WHISPER ERROR: ${msg}`, code: "WHISPER_ERROR" };
        }
        console.warn("[STT][ENGINE] Thread-pool creation failed — retrying with single-threaded session...");
        try {
            state.pipelinePromise = null;
            state.ready = false;
            asr = await getPipeline({ intraOpNumThreads: 1, interOpNumThreads: 1 });
            output = await runInference(asr, samples, lang);
        } catch (retryError) {
            return {
                success: false,
                error: `WHISPER ERROR (single-thread retry): ${retryError?.message || String(retryError)}`,
                code: "WHISPER_ERROR"
            };
        }
    }

    const text = String((Array.isArray(output) ? output[0] : output)?.text || "").replace(/\s+/g, " ").trim();
    const detected = (Array.isArray(output) ? output[0] : output)?.language || lang || "auto";

    return {
        success: true,
        text,
        language: detected,
        engine: "whisper-tiny",
        offline: true,
        durationMs: Date.now() - startedAt
    };
}

async function runInference(asr, samples, lang) {
    return await asr(samples, {
        ...(lang ? { language: lang } : {}),
        return_language: true,
        chunk_length_s: 30,
        stride_length_s: 5
    });
}

function normalizeLanguage(language) {
    const v = String(language || "").trim().toLowerCase();
    if (!v) return undefined;
    const base = v.split(/[-_]/)[0];
    return /^[a-z]{2}$/.test(base) ? base : undefined;
}

/* ---------------------------------------------------------
   STATUS / WARMUP
--------------------------------------------------------- */
function getStatus() {
    const v = validateModel();
    return {
        engine: "whisper-tiny",
        model: MODEL_ID,
        modelPath: v.cacheDir,
        modelCached: v.cached,
        ready: state.ready,
        loading: state.loading,
        error: state.lastError
    };
}

function warmUp() {
    if (!state.ready && !state.loading) {
        getPipeline().catch(() => { /* already logged inside getPipeline */ });
    }
}

module.exports = { transcribeSamples, getStatus, warmUp, validateModel };
