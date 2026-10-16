"use strict";

/**
 * ============================================================
 * JARVIS — WHISPER.CPP STT PROVIDER (PRIMARY OFFLINE ENGINE)
 * stt/whisper/provider.js
 * ============================================================
 * Fully local, fully offline speech recognition using the
 * whisper.cpp command-line tool (https://github.com/ggml-org/whisper.cpp)
 * with a multilingual GGML Whisper model.
 *
 * No Python, no cloud API, no API key, no native Node binding.
 *
 * AUDIO FORMAT
 * ------------
 * Expects mono Float32Array @16 kHz — exactly what the renderer
 * (voice.js) already captures and resamples, so no extra
 * conversion is needed anywhere in the chain.
 *
 * MODEL MANAGEMENT
 * ----------------
 *   models/whisper/ggml-<name>.bin   (model binaries — NOT committed)
 *   models/whisper/bin/<platform>/    (auto-downloaded whisper.cpp executable)
 *
 * Configuration (config/voice_settings.json, overridable by env):
 *   whisperModel          tiny | base | small      (default: base)
 *   whisperModelPath      explicit model file path
 *   whisperExecutable     explicit whisper.cpp executable path
 *   whisperAutoDownload   auto-download missing exe/model (default: true)
 *   whisperTimeoutMs      per-utterance transcription timeout (default: 120000)
 *   whisperLanguage       "auto" | "hi" | "en" forced language
 * Env overrides:
 *   WHISPER_MODEL, WHISPER_MODEL_PATH, WHISPER_CPP_PATH,
 *   STT_LANGUAGE, WHISPER_NO_DOWNLOAD
 *
 * STATUS CONTRACT (getStatus())
 *   executable: { found, path, source }
 *   model:      { name, path, status: "READY"|"NOT_INSTALLED"|"DOWNLOADING"|"ERROR", sizeBytes }
 *   ready / loading / lastError
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { spawn, execFile } = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const WHISPER_ROOT = path.join(PROJECT_ROOT, "models", "whisper");
const BIN_ROOT = path.join(WHISPER_ROOT, "bin");
const SAMPLE_RATE = 16000;

/* In a PACKAGED Electron app (asar), the whisper.cpp executable and GGML
   models are shipped via extraResources into <resources>/models/whisper —
   they can never live inside the asar (an exe must sit on real disk to
   spawn). Prefer those when running packaged. */
function whisperRoots() {
    const roots = [WHISPER_ROOT];
    try {
        if (process.resourcesPath && process.resourcesPath !== PROJECT_ROOT) {
            roots.push(path.join(process.resourcesPath, "models", "whisper"));
        }
    } catch (_) { /* not packaged */ }
    return roots;
}

/* ---------------------------------------------------------
   MODEL REGISTRY
   Sizes are approximate download sizes in bytes (informational
   only — used for progress display, not validation).
--------------------------------------------------------- */
const MODELS = {
    tiny:  { file: "ggml-tiny.bin",  bytes: 77_691_713,  note: "fastest, lower accuracy" },
    base:  { file: "ggml-base.bin",  bytes: 147_951_465, note: "recommended default for 8 GB CPU-only machines" },
    small: { file: "ggml-small.bin", bytes: 487_601_967, note: "best accuracy, slowest on CPU" }
};
const MODEL_URL_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/* whisper.cpp prebuilt release (CPU builds for win64 / ubuntu x64) */
const WHISPER_CPP_RELEASE = "b5130";
const EXECUTABLE_ASSETS = {
    "win32-x64":   { url: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_RELEASE}/whisper-bin-x64.zip`,         archive: "zip" },
    "linux-x64":   { url: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_RELEASE}/whisper-bin-ubuntu-x64.tar.gz`, archive: "tar" },
    "linux-arm64": { url: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_RELEASE}/whisper-bin-ubuntu-arm64.tar.gz`, archive: "tar" }
};
/* Executable names accepted, in priority order (both new and
   historic whisper.cpp CLI names — the argument surface we use
   is identical for all of them). */
const EXECUTABLE_NAMES = ["whisper-cli", "whisper-cli.exe", "whisper", "whisper.exe", "main", "main.exe", "command", "command.exe"];
// PATH may contain OpenAI Whisper's Python whisper.exe, whose CLI uses
// -f for output format. JARVIS passes whisper.cpp flags, so only search
// for names that identify whisper.cpp safely. Older local/bundled installs
// may still use whisper.exe; those resolve from app-owned model directories.
const PATH_EXECUTABLE_NAMES = ["whisper-cli", "whisper-cli.exe", "main", "main.exe"];

/* ---------------------------------------------------------
   CONFIGURATION (config/voice_settings.json + env overrides)
--------------------------------------------------------- */
const VOICE_SETTINGS_PATH = path.join(PROJECT_ROOT, "config", "voice_settings.json");
const SETTINGS_DEFAULTS = {
    whisperModel: "base",
    whisperModelPath: "",
    whisperExecutable: "",
    whisperAutoDownload: true,
    whisperTimeoutMs: 120000,
    whisperLanguage: "auto",
    whisperThreads: 0            // 0 = auto (min(8, cpus))
};
let SETTINGS = { ...SETTINGS_DEFAULTS };
try {
    const raw = fs.readFileSync(VOICE_SETTINGS_PATH, "utf8");
    SETTINGS = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
} catch (_) { /* defaults */ }

function getConfig() {
    return {
        model: String(process.env.WHISPER_MODEL || SETTINGS.whisperModel || "base").trim().toLowerCase(),
        modelPath: String(process.env.WHISPER_MODEL_PATH || SETTINGS.whisperModelPath || "").trim(),
        executable: String(process.env.WHISPER_CPP_PATH || SETTINGS.whisperExecutable || "").trim(),
        autoDownload: process.env.WHISPER_NO_DOWNLOAD ? false : SETTINGS.whisperAutoDownload !== false,
        timeoutMs: Number(SETTINGS.whisperTimeoutMs) > 0 ? Number(SETTINGS.whisperTimeoutMs) : 120000,
        language: String(process.env.STT_LANGUAGE || SETTINGS.whisperLanguage || "auto").trim().toLowerCase(),
        threads: Number(SETTINGS.whisperThreads) > 0 ? Number(SETTINGS.whisperThreads) : 0
    };
}

function platformKey() {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return `${process.platform}-${arch}`;
}

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
const state = {
    ready: false,
    loading: false,
    lastError: null,
    modelStatus: "NOT_INSTALLED",   // READY | NOT_INSTALLED | DOWNLOADING | ERROR
    modelDownloadError: null,
    exeDownloadPromise: null,
    modelDownloadPromise: null,
    progressListener: null,          // fn({type, percent, downloaded, total, detail})
    transcribeCount: 0,
    totalTranscribeMs: 0,
    lastTranscribeMs: null,
    // single-flight transcription lock — never overlap two whisper processes
    queue: Promise.resolve()
};

function reportProgress(info) {
    try { if (typeof state.progressListener === "function") state.progressListener(info); } catch (_) { /* listener errors must never break STT */ }
}

/* ---------------------------------------------------------
   EXECUTABLE RESOLUTION
   1. explicit config/env path
   2. project-local models/whisper/bin/<platform>/
   3. system PATH (whisper-cli / main / whisper / command)
--------------------------------------------------------- */
function isExecutableFile(file) {
    try { return fs.statSync(file).isFile(); } catch (_) { return false; }
}

function findExecutableInDir(dir) {
    if (!dir || !fs.existsSync(dir)) return null;
    let found = null;
    const walk = (d) => {
        if (found) return;
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        // prefer exact priority names at this level first
        for (const name of EXECUTABLE_NAMES) {
            const full = path.join(d, name);
            if (isExecutableFile(full)) { found = full; return; }
        }
        for (const e of entries) {
            if (e.isDirectory()) walk(path.join(d, e.name));
            if (found) return;
        }
    };
    walk(dir);
    return found;
}

function lookupOnPath(names) {
    const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        for (const name of names) {
            const full = path.join(dir, name);
            if (isExecutableFile(full)) return full;
        }
    }
    return null;
}

function resolveExecutable() {
    const cfg = getConfig();
    if (cfg.executable) {
        if (isExecutableFile(cfg.executable)) {
            return { found: true, path: path.resolve(cfg.executable), source: "config" };
        }
        return { found: false, path: cfg.executable, source: "config", error: "Configured whisper.cpp executable does not exist" };
    }
    for (const root of whisperRoots()) {
        const bundled = findExecutableInDir(path.join(root, "bin", platformKey()));
        if (bundled) return { found: true, path: bundled, source: "bundled" };
        // Also accept a model dir that directly contains a binary (manual install)
        const loose = findExecutableInDir(root);
        if (loose) return { found: true, path: loose, source: "bundled" };
    }
    const onPath = lookupOnPath(PATH_EXECUTABLE_NAMES);
    if (onPath) return { found: true, path: onPath, source: "path" };
    return { found: false, path: null, source: null };
}

/* ---------------------------------------------------------
   HTTPS DOWNLOAD HELPERS (built-in https, follows redirects)
--------------------------------------------------------- */
function downloadToFile(url, destPath, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
        const attempt = (u, redirectsLeft) => {
            const req = https.get(u, { timeout: 30000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) return reject(new Error("Too many redirects while downloading"));
                    const next = new URL(res.headers.location, u).toString();
                    return attempt(next, redirectsLeft - 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`Download failed with HTTP ${res.statusCode} for ${u}`));
                }
                const total = Number(res.headers["content-length"]) || 0;
                let received = 0;
                const out = fs.createWriteStream(destPath);
                res.on("data", (chunk) => {
                    received += chunk.length;
                    if (onProgress && total) {
                        onProgress({ downloaded: received, total, percent: Math.round((received / total) * 100) });
                    }
                });
                res.on("error", (e) => { out.destroy(); reject(e); });
                res.on("end", () => {
                    out.end(() => {
                        if (total && received < total * 0.95) {
                            reject(new Error(`Download incomplete (${received} of ${total} bytes)`));
                        } else {
                            resolve({ bytes: received });
                        }
                    });
                });
                res.pipe(out);
                out.on("error", (e) => reject(e));
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(new Error("Download timed out")); });
        };
        attempt(url, 6);
    });
}

function extractArchive(archivePath, destDir, archiveType) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(destDir, { recursive: true });
        // tar is available on Windows 10+ (bsdtar — handles zip), Linux, macOS
        const child = spawn("tar", ["-xf", archivePath, "-C", destDir], { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (d) => { stderr += String(d); });
        child.on("error", (err) => {
            if (process.platform === "win32") {
                // Fallback: PowerShell Expand-Archive (always present on Windows)
                const ps = spawn("powershell.exe", [
                    "-NoProfile", "-NonInteractive", "-Command",
                    "Expand-Archive", "-LiteralPath", JSON.stringify(archivePath), "-DestinationPath", JSON.stringify(destDir), "-Force"
                ], { stdio: ["ignore", "ignore", "pipe"] });
                ps.on("error", (e) => reject(new Error(`Archive extraction failed: ${err.message} / ${e.message}`)));
                ps.on("close", (code) => code === 0 ? resolve() : reject(new Error("PowerShell Expand-Archive failed")));
            } else {
                reject(new Error(`Archive extraction failed (tar missing?): ${err.message}`));
            }
        });
        child.on("close", (code) => {
            if (code === 0) return resolve();
            if (process.platform === "win32" && archiveType === "zip") {
                const ps = spawn("powershell.exe", [
                    "-NoProfile", "-NonInteractive", "-Command",
                    "Expand-Archive", "-LiteralPath", JSON.stringify(archivePath), "-DestinationPath", JSON.stringify(destDir), "-Force"
                ], { stdio: ["ignore", "ignore", "pipe"] });
                let psErr = "";
                ps.stderr.on("data", (d) => { psErr += String(d); });
                ps.on("error", (e) => reject(new Error(`Archive extraction failed: ${stderr} / ${e.message}`)));
                ps.on("close", (c) => c === 0 ? resolve() : reject(new Error(`Archive extraction failed: ${psErr}`)));
            } else {
                reject(new Error(`Archive extraction failed: ${stderr}`));
            }
        });
    });
}

/**
 * Download the official prebuilt whisper.cpp release for this platform
 * into models/whisper/bin/<platform>/. Idempotent via a single-flight
 * promise — concurrent callers share one download.
 */
async function ensureExecutable() {
    const resolved = resolveExecutable();
    if (resolved.found) return resolved;

    const cfg = getConfig();
    if (!cfg.autoDownload) {
        return { found: false, path: null, source: null, error: "Whisper executable missing and auto-download is disabled (WHISPER_NO_DOWNLOAD / whisperAutoDownload:false)" };
    }

    const key = platformKey();
    const asset = EXECUTABLE_ASSETS[key];
    if (!asset) {
        return { found: false, path: null, source: null, error: `No prebuilt whisper.cpp for ${key}. Install whisper.cpp and set whisperExecutable / WHISPER_CPP_PATH, or place the binary in models/whisper/bin/${key}/` };
    }

    if (!state.exeDownloadPromise) {
        state.exeDownloadPromise = (async () => {
            const installDir = path.join(BIN_ROOT, key);
            fs.mkdirSync(installDir, { recursive: true });
            const tmpArchive = path.join(os.tmpdir(), `jarvis-whisper-exe-${Date.now()}.${asset.archive === "zip" ? "zip" : "tar.gz"}`);
            try {
                reportProgress({ type: "whisper-exe", status: "DOWNLOADING", detail: `Downloading whisper.cpp runtime (${key})…` });
                await downloadToFile(asset.url, tmpArchive, {
                    onProgress: (p) => reportProgress({ type: "whisper-exe", status: "DOWNLOADING", percent: p.percent, downloaded: p.downloaded, total: p.total })
                });
                reportProgress({ type: "whisper-exe", status: "EXTRACTING", detail: "Extracting whisper.cpp runtime…" });
                await extractArchive(tmpArchive, installDir, asset.archive);
            } finally {
                try { fs.unlinkSync(tmpArchive); } catch (_) { /* temp cleanup best-effort */ }
            }
            const exe = findExecutableInDir(installDir);
            if (!exe) throw new Error("whisper.cpp archive did not contain a recognized executable");
            if (process.platform !== "win32") {
                try { fs.chmodSync(exe, 0o755); } catch (_) { /* best-effort */ }
            }
            reportProgress({ type: "whisper-exe", status: "READY", detail: "whisper.cpp runtime installed" });
            console.log(`[Whisper] whisper.cpp runtime installed at ${exe}`);
            return exe;
        })().finally(() => { state.exeDownloadPromise = null; });
    }

    try {
        const exe = await state.exeDownloadPromise;
        return { found: true, path: exe, source: "downloaded" };
    } catch (error) {
        state.lastError = `Whisper executable download failed: ${error.message}`;
        return { found: false, path: null, source: null, error: state.lastError };
    }
}

/* ---------------------------------------------------------
   MODEL MANAGEMENT
--------------------------------------------------------- */
function getModelName() {
    const cfg = getConfig();
    return MODELS[cfg.model] ? cfg.model : "base";
}

function resolveModelPath() {
    const cfg = getConfig();
    if (cfg.modelPath) {
        return { path: path.resolve(cfg.modelPath), source: "config" };
    }
    const name = getModelName();
    const file = MODELS[name].file;
    for (const root of whisperRoots()) {
        const candidate = path.join(root, file);
        if (isExecutableFile(candidate)) return { path: candidate, source: "default" };
    }
    return { path: path.join(WHISPER_ROOT, file), source: "default" };
}

function isModelAvailable() {
    try {
        const st = fs.statSync(resolveModelPath().path);
        return st.isFile() && st.size > 1_000_000; // a real GGML model is never under 1 MB
    } catch (_) {
        return false;
    }
}

/**
 * Download the configured GGML model if missing. Single-flight,
 * resumable-by-retry (a failed .part is discarded), reports progress.
 */
async function ensureModel() {
    if (isModelAvailable()) {
        state.modelStatus = "READY";
        state.modelDownloadError = null;
        return { ok: true, path: resolveModelPath().path };
    }

    const cfg = getConfig();
    if (!cfg.autoDownload) {
        state.modelStatus = "NOT_INSTALLED";
        return { ok: false, error: `Whisper model missing (${getModelName()}) and auto-download is disabled. Download ${MODELS[getModelName()].file} into models/whisper/ or run: npm run setup:whisper` };
    }

    if (!state.modelDownloadPromise) {
        state.modelDownloadPromise = (async () => {
            const name = getModelName();
            const info = MODELS[name];
            const target = resolveModelPath().path;
            const part = `${target}.part`;
            fs.mkdirSync(path.dirname(target), { recursive: true });
            state.modelStatus = "DOWNLOADING";
            state.modelDownloadError = null;
            try {
                reportProgress({ type: "whisper-model", status: "DOWNLOADING", model: name, detail: `Downloading Whisper ${name} model (~${Math.round(info.bytes / 1048576)} MB, one time only)…` });
                await downloadToFile(`${MODEL_URL_BASE}/${info.file}`, part, {
                    onProgress: (p) => reportProgress({ type: "whisper-model", status: "DOWNLOADING", model: name, percent: p.percent, downloaded: p.downloaded, total: p.total })
                });
                fs.renameSync(part, target);
                state.modelStatus = "READY";
                reportProgress({ type: "whisper-model", status: "READY", model: name });
                console.log(`[Whisper] Model ${name} downloaded to ${target}`);
                return { ok: true, path: target };
            } catch (error) {
                try { fs.unlinkSync(part); } catch (_) { /* best-effort */ }
                state.modelStatus = "ERROR";
                state.modelDownloadError = error.message;
                reportProgress({ type: "whisper-model", status: "ERROR", model: name, detail: error.message });
                throw error;
            } finally {
                state.modelDownloadPromise = null;
            }
        })();
    }

    try {
        return await state.modelDownloadPromise;
    } catch (error) {
        return { ok: false, error: `Whisper model download failed: ${error.message}` };
    }
}

/* Combined pre-flight: executable + model, with auto-download. */
async function ensureReady() {
    const exe = await ensureExecutable();
    if (!exe.found) return { ok: false, error: exe.error || "whisper.cpp executable not found" };
    const model = await ensureModel();
    if (!model.ok) return { ok: false, error: model.error };
    state.ready = true;
    state.lastError = null;
    return { ok: true, executable: exe.path, model: model.path };
}

/* ---------------------------------------------------------
   WAV WRITER (mono 16-bit PCM @16 kHz — the only format
   whisper.cpp needs from us)
--------------------------------------------------------- */
function writeWavFile(samples, sampleRate) {
    const numSamples = samples.length;
    const dataSize = numSamples * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);          // PCM chunk size
    buf.writeUInt16LE(1, 20);           // format = PCM
    buf.writeUInt16LE(1, 22);           // channels
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buf.writeUInt16LE(2, 32);           // block align
    buf.writeUInt16LE(16, 34);          // bits per sample
    buf.write("data", 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < numSamples; i++) {
        let s = Number(samples[i]);
        if (!Number.isFinite(s)) s = 0;
        if (s > 1) s = 1; else if (s < -1) s = -1;
        buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
    }
    return buf;
}

/* ---------------------------------------------------------
   TRANSCRIPTION (serialized — one whisper.cpp process at a time)
--------------------------------------------------------- */
function parseTranscriptionJson(jsonPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const segments = Array.isArray(data.transcription) ? data.transcription : [];
    const text = segments.map((s) => String(s.text || "")).join(" ").replace(/\s+/g, " ").trim();
    const language = data.result?.language || null;
    return { text, language };
}

function runWhisperCli(exePath, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(exePath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
        let stderr = "";
        let timer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch (_) { /* already gone */ }
            reject(new Error(`Whisper transcription timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stderr.on("data", (d) => { stderr += String(d); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
        child.on("error", (err) => { clearTimeout(timer); reject(err); });
        child.on("close", (code) => { clearTimeout(timer); resolve({ code, stderr }); });
    });
}

/**
 * Batch transcription — the path used by JARVIS (renderer records a
 * full VAD-trimmed utterance and hands it over in one shot).
 * samples: Float32Array mono @16 kHz
 * options.language: "hi" | "en" (forced) — otherwise the configured
 * default ("auto" = Whisper auto-detect, recommended for Hinglish).
 */
function transcribeSamples(samples, options = {}) {
    // serialize: never run two whisper processes concurrently
    const job = state.queue.then(() => doTranscribe(samples, options));
    // keep the chain alive even if a job rejects
    state.queue = job.then(() => {}, () => {});
    return job;
}

async function doTranscribe(samples, options) {
    if (!samples || !samples.length) return { success: false, error: "Empty audio", code: "EMPTY_AUDIO" };

    const cfg = getConfig();
    const sampleRate = Number(options.sampleRate) > 0 ? Number(options.sampleRate) : SAMPLE_RATE;

    const preflight = await ensureReady();
    if (!preflight.ok) {
        return { success: false, error: `WHISPER NOT READY: ${preflight.error}`, code: "WHISPER_NOT_READY" };
    }

    const language = normalizeWhisperLanguage(options.language) || normalizeWhisperLanguage(cfg.language) || "auto";
    // Use more available CPU parallelism by default to reduce local decode
    // time while retaining an explicit whisperThreads override for tuning.
    const threads = cfg.threads > 0 ? String(cfg.threads) : String(Math.min(8, os.cpus()?.length || 2));

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-whisper-"));
    const wavPath = path.join(workDir, "utterance.wav");
    const outPrefix = path.join(workDir, "out");
    try {
        fs.writeFileSync(wavPath, writeWavFile(samples, sampleRate));
        const args = [
            "-m", preflight.model,
            "-f", wavPath,
            "-l", language,
            "-nt",           // no timestamps in text output
            "-oj",            // JSON output (written to <outPrefix>.json)
            "-of", outPrefix,
            "-t", threads,
            "-np"            // suppress progress prints
        ];
        const startedAt = Date.now();
        const { code, stderr } = await runWhisperCli(preflight.executable, args, cfg.timeoutMs);
        const durationMs = Date.now() - startedAt;

        state.transcribeCount += 1;
        state.lastTranscribeMs = durationMs;
        state.totalTranscribeMs += durationMs;

        if (code !== 0) {
            const hint = /failed to load|invalid model file|no such file/i.test(stderr)
                ? " — model file may be corrupted; delete models/whisper/ggml-*.bin and restart to re-download"
                : "";
            return { success: false, error: `WHISPER ERROR (exit ${code}): ${stderr.trim().split("\n").slice(-3).join(" ")}${hint}`, code: "WHISPER_PROCESS_ERROR" };
        }

        const jsonPath = `${outPrefix}.json`;
        if (!fs.existsSync(jsonPath)) {
            return { success: false, error: "WHISPER ERROR: no transcription output produced", code: "WHISPER_NO_OUTPUT" };
        }
        const { text, language: detected } = parseTranscriptionJson(jsonPath);
        if (!text) {
            return { success: false, error: "No speech recognized.", code: "WHISPER_EMPTY_RESULT" };
        }
        return {
            success: true,
            text,
            language: detected || (language === "auto" ? "auto" : language),
            // whisper.cpp's -oj output carries no reliable per-utterance
            // confidence score — we deliberately return null instead of
            // inventing one.
            confidence: null,
            engine: "whisper.cpp",
            durationMs
        };
    } catch (error) {
        return { success: false, error: `WHISPER ERROR: ${error?.message || String(error)}`, code: "WHISPER_TRANSCRIBE_ERROR" };
    } finally {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* best-effort temp cleanup */ }
    }
}

function normalizeWhisperLanguage(language) {
    const v = String(language || "").trim().toLowerCase();
    if (!v || v === "auto") return "auto";
    const base = v.split(/[-_]/)[0];
    return /^[a-z]{2}$/.test(base) ? base : "auto";
}

/* ---------------------------------------------------------
   STATUS / WARMUP / CLEANUP
--------------------------------------------------------- */
function getStatus() {
    const cfg = getConfig();
    const exe = resolveExecutable();
    const modelPath = resolveModelPath().path;
    let sizeBytes = 0;
    try { sizeBytes = fs.statSync(modelPath).size; } catch (_) { /* missing */ }
    const modelAvailable = isModelAvailable();
    if (modelAvailable && state.modelStatus !== "DOWNLOADING") state.modelStatus = "READY";
    return {
        engine: "whisper.cpp",
        ready: exe.found && modelAvailable,
        loading: state.loading || state.modelStatus === "DOWNLOADING",
        lastError: state.lastError,
        executable: {
            found: exe.found,
            path: exe.path,
            source: exe.source,
            platform: platformKey(),
            autoDownloadSupported: !!EXECUTABLE_ASSETS[platformKey()]
        },
        model: {
            name: getModelName(),
            path: modelPath,
            configured: cfg.model,
            status: state.modelStatus,      // READY | NOT_INSTALLED | DOWNLOADING | ERROR
            sizeBytes,
            downloadError: state.modelDownloadError,
            autoDownload: !!cfg.autoDownload
        },
        language: cfg.language,
        transcribeCount: state.transcribeCount,
        avgTranscribeMs: state.transcribeCount > 0 ? Math.round(state.totalTranscribeMs / state.transcribeCount) : null,
        lastTranscribeMs: state.lastTranscribeMs,
        offline: true
    };
}

/** Warm up: validate (and auto-download if allowed) executable + model. */
async function warmUp() {
    state.loading = true;
    try {
        const result = await ensureReady();
        if (!result.ok) {
            state.lastError = result.error;
            console.warn(`[Whisper] warmUp: ${result.error}`);
            return false;
        }
        console.log(`[Whisper] READY — model: ${result.model}, executable: ${result.executable}`);
        return true;
    } finally {
        state.loading = false;
    }
}

/** true when transcription is possible RIGHT NOW without any download. */
function isAvailable() {
    return resolveExecutable().found && isModelAvailable();
}

function setProgressListener(fn) {
    state.progressListener = typeof fn === "function" ? fn : null;
}

function cleanup() {
    // nothing persistent to release — whisper.cpp runs as a child process
    // per utterance and temp dirs are removed after each run.
    state.queue = Promise.resolve();
}

module.exports = {
    transcribeSamples,
    getStatus,
    warmUp,
    isAvailable,
    ensureReady,
    ensureModel,
    resolveExecutable,
    setProgressListener,
    cleanup,
    MODELS,
    platformKey
};
