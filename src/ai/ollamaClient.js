"use strict";

/**
 * ============================================================
 * JARVIS — OLLAMA LOCAL AI CLIENT
 * src/ai/ollamaClient.js
 * ============================================================
 * Thin HTTP client for the LOCAL Ollama server
 * (https://ollama.com) — the optional local AI conversation
 * engine. No cloud API, no API key, fully offline.
 *
 * SAFETY ARCHITECTURE (critical):
 *   This client is CONVERSATION ONLY. It never receives — and
 *   never asks Ollama for — OS execution capability. Every PC
 *   action in JARVIS goes through the deterministic Action
 *   Engine / SafetyGate; Ollama only produces natural-language
 *   responses and structured suggestions. Responses returned
 *   here are treated strictly as text.
 *
 * CONFIGURATION
 *   OLLAMA_BASE_URL  env var         (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL     env var         (explicit model override)
 *   config/ai_settings.json:
 *     { "ollamaBaseUrl": "...", "ollamaModel": "..." }
 *
 *   The model is NEVER downloaded automatically — models can be
 *   several GB, so the user pulls one explicitly (`ollama pull …`).
 *   This client only DETECTS installed models and uses them.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");
const { writeJsonAtomic } = require("../utils/atomicJson");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
let AI_SETTINGS_PATH = path.join(PROJECT_ROOT, "config", "ai_settings.json");

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const HEALTH_TTL_MS = 15000;      // cache the server probe briefly
const STATUS_TIMEOUT_MS = 4000;   // server must answer fast to be "online"
const CHAT_TIMEOUT_MS = 120000;   // local models can take a while on CPU

/* Preferred models when more than one is installed (smallest
   sensible local instruct models first — the user can always
   override with OLLAMA_MODEL / config). */
const MODEL_PREFERENCE = [
    // Prefer general conversation models over coder-tuned variants so an
    // automatically selected local model handles everyday questions well.
    "qwen2.5:3b", "qwen2.5", "qwen3:4b", "qwen3", "qwen:1.8b",
    "llama3.2", "llama3.2:3b", "llama3.1:8b", "llama3", "llama3.1",
    "qwen2.5-coder:1.5b",
    "gemma3:4b", "gemma2:2b", "gemma", "phi3.5", "phi3",
    "mistral", "tinyllama", "deepseek-r1:1.5b"
];

/* ---------------------------------------------------------
   CONFIG
--------------------------------------------------------- */
let settingsCache = null;

function loadSettings() {
    if (settingsCache) return settingsCache;
    let saved = {};
    try {
        saved = JSON.parse(fs.readFileSync(AI_SETTINGS_PATH, "utf8"));
    } catch (_) { /* no settings yet */ }
    settingsCache = saved;
    return saved;
}

function saveSettings(patch) {
    const saved = { ...loadSettings(), ...patch };
    settingsCache = saved;
    try {
        writeJsonAtomic(AI_SETTINGS_PATH, saved);
    } catch (error) {
        console.warn(`[Ollama] Could not persist ai_settings.json: ${error.message}`);
    }
    return saved;
}

/** Use a writable per-user location in packaged Electron builds. */
function configureSettingsPath(userDataPath) {
    const nextPath = path.join(String(userDataPath || ""), "ai_settings.json");
    if (!userDataPath || nextPath === AI_SETTINGS_PATH) return AI_SETTINGS_PATH;

    // Carry forward the project/bundled preference once, then keep future
    // model selections writable outside app.asar.
    try {
        if (!fs.existsSync(nextPath) && fs.existsSync(AI_SETTINGS_PATH)) {
            fs.mkdirSync(path.dirname(nextPath), { recursive: true });
            fs.copyFileSync(AI_SETTINGS_PATH, nextPath);
        }
    } catch (error) {
        console.warn(`[Ollama] Could not migrate ai_settings.json: ${error.message}`);
    }
    AI_SETTINGS_PATH = nextPath;
    settingsCache = null;
    return AI_SETTINGS_PATH;
}

function getBaseUrl() {
    const env = String(process.env.OLLAMA_BASE_URL || "").trim();
    if (env) return env.replace(/\/+$/, "");
    const saved = String(loadSettings().ollamaBaseUrl || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
    return DEFAULT_BASE_URL;
}

function isLoopbackBaseUrl(value) {
    try {
        const url = new URL(String(value || ""));
        const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        const octets = host.split(".");
        const ipv4Loopback = octets.length === 4 && octets[0] === "127" &&
            octets.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
        return url.protocol === "http:" &&
            (host === "localhost" || host === "::1" || ipv4Loopback);
    } catch (_) {
        return false;
    }
}

function getConfiguredModel() {
    const env = String(process.env.OLLAMA_MODEL || "").trim();
    if (env) return env;
    return String(loadSettings().ollamaModel || "").trim() || null;
}

function isEnabled() {
    return loadSettings().ollamaEnabled !== false;
}

function setEnabled(enabled) {
    saveSettings({ ollamaEnabled: enabled === true });
    healthCache = { at: 0, value: null };
    return { success: true, enabled: enabled === true };
}

/* ---------------------------------------------------------
   LOW-LEVEL HTTP (local only)
--------------------------------------------------------- */
function request(method, urlPath, body, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(Object.assign(new Error("Operation cancelled."), { name: "AbortError" }));
            return;
        }
        if (!isLoopbackBaseUrl(getBaseUrl())) {
            reject(new Error("Offline-only mode allows Ollama connections to localhost only."));
            return;
        }
        const url = new URL(urlPath, getBaseUrl());
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        let settled = false;
        const cleanup = () => signal?.removeEventListener("abort", onAbort);
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const onAbort = () => req.destroy(Object.assign(new Error("Operation cancelled."), { name: "AbortError" }));
        const req = http.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === "https:" ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {},
            timeout: timeoutMs
        }, (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => finish(resolve, { status: res.statusCode, body: data }));
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        req.on("timeout", () => {
            req.destroy(new Error(`Ollama request timed out after ${timeoutMs}ms (server not responding at ${getBaseUrl()})`));
        });
        req.on("error", error => finish(reject, error));
        if (payload) req.write(payload);
        req.end();
    });
}

function requestStream(method, urlPath, body, timeoutMs, onToken, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(Object.assign(new Error("Operation cancelled."), { name: "AbortError" }));
            return;
        }
        if (!isLoopbackBaseUrl(getBaseUrl())) {
            reject(new Error("Offline-only mode allows Ollama connections to localhost only."));
            return;
        }
        const url = new URL(urlPath, getBaseUrl());
        const payload = Buffer.from(JSON.stringify(body));
        let settled = false;
        const cleanup = () => signal?.removeEventListener("abort", onAbort);
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const onAbort = () => req.destroy(Object.assign(new Error("Operation cancelled."), { name: "AbortError" }));
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method,
            headers: { "Content-Type": "application/json", "Content-Length": payload.length },
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode !== 200) {
                let errorBody = "";
                res.setEncoding("utf8");
                res.on("data", chunk => { errorBody += chunk; });
                res.on("end", () => finish(resolve, { status: res.statusCode, body: errorBody }));
                return;
            }

            let buffer = "";
            let text = "";
            let responseModel = null;
            let evalCount = null;
            const consume = (line) => {
                if (!line.trim()) return;
                const item = parseJson(line);
                if (!item) return;
                const token = item.message?.content;
                if (typeof token === "string" && token) {
                    text += token;
                    try { onToken(token); } catch (error) { console.warn("[Ollama] Reply token listener failed:", error.message); }
                }
                responseModel = item.model || responseModel;
                if (item.done) evalCount = Number(item.eval_count) || evalCount;
            };

            res.setEncoding("utf8");
            res.on("data", chunk => {
                buffer += chunk;
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                lines.forEach(consume);
            });
            res.on("end", () => {
                consume(buffer);
                finish(resolve, { status: res.statusCode, body: JSON.stringify({ model: responseModel, message: { content: text }, eval_count: evalCount }) });
            });
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        req.on("timeout", () => req.destroy(new Error(`Ollama request timed out after ${timeoutMs}ms (server not responding at ${getBaseUrl()})`)));
        req.on("error", error => finish(reject, error));
        req.write(payload);
        req.end();
    });
}

/* ---------------------------------------------------------
   INSTALLED DETECTION
   "Installed" = the `ollama` CLI is on the system PATH. This is
   informational only — "running" (server probe below) is the
   authoritative check for UI status.
--------------------------------------------------------- */
function detectInstalled() {
    return new Promise((resolve) => {
        execFile("ollama", ["--version"], { timeout: 5000, windowsHide: true }, (error, stdout) => {
            if (error) return resolve({ installed: false, version: null });
            const match = String(stdout || "").match(/(\d+\.\d+\.\d+[^\s)]*)/);
            resolve({ installed: true, version: match ? match[1] : "unknown" });
        });
    });
}

/* ---------------------------------------------------------
   HEALTH / STATUS
   Returns:
   {
     installed:   boolean  — ollama CLI present on PATH
     running:     boolean  — local server VERIFIED (real /api/tags probe)
     models:      [{name, size}] — installed models (empty if not running)
     selectedModel: string|null — explicit config, else auto-preference
     error:       string|null
   }
   The server probe result is cached briefly (HEALTH_TTL_MS) so
   repeated UI polls don't hammer localhost, but a fresh probe
   can always be forced.
--------------------------------------------------------- */
let healthCache = { at: 0, value: null };
let healthInFlight = null;

async function getStatus({ force = false } = {}) {
    const now = Date.now();
    if (!force && healthCache.value && now - healthCache.at < HEALTH_TTL_MS) {
        return healthCache.value;
    }
    if (healthInFlight) return healthInFlight;

    healthInFlight = (async () => {
        const installed = await detectInstalled();
        let running = false;
        let models = [];
        let error = null;

        try {
            const res = await request("GET", "/api/tags", undefined, STATUS_TIMEOUT_MS);
            if (res.status === 200) {
                const parsed = parseJson(res.body);
                if (parsed && Array.isArray(parsed.models)) {
                    running = true;
                    models = parsed.models
                        .map((m) => ({ name: String(m.name || m.model || ""), size: Number(m.size) || 0 }))
                        .filter((m) => m.name);
                } else {
                    error = "Ollama server responded but the model list was malformed.";
                }
            } else {
                error = `Ollama server responded with HTTP ${res.status}.`;
            }
        } catch (probeError) {
            error = `Ollama server not reachable at ${getBaseUrl()} (${probeError.message})`;
        }

        if (!running && !installed.installed) {
            // The malformed-probe message is more specific — keep it.
            if (!error) error = "Ollama is not installed. Install it from https://ollama.com, then pull a model (e.g. `ollama pull llama3.2`).";
        } else if (!running && installed.installed && !error) {
            error = "Ollama is installed but the local server is not running. Start it with `ollama serve` (or launch the Ollama app).";
        } else if (running && models.length === 0) {
            error = "No Ollama model is installed. Pull one with `ollama pull llama3.2` (models are several GB — this is never done automatically).";
        }

        const status = {
            installed: installed.installed,
            version: installed.version,
            running,
            baseUrl: getBaseUrl(),
            models,
            selectedModel: running && models.length > 0 ? pickModel(models) : null,
            enabled: isEnabled(),
            connected: running && models.length > 0 && isEnabled(),
            error: running && models.length > 0 ? null : error
        };
        healthCache = { at: Date.now(), value: status };
        return status;
    })();

    try {
        return await healthInFlight;
    } finally {
        healthInFlight = null;
    }
}

function parseJson(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
}

/** Select which model to use: explicit config > saved pick > preference order > first model. */
function pickModel(models) {
    const configured = getConfiguredModel();
    const names = models.map((m) => m.name);
    if (configured) {
        if (names.length === 0 || names.includes(configured)) return configured;
        // configured model not installed — fall through to preference and report below
        const fallback = preferredFromList(names);
        console.warn(`[Ollama] Configured model "${configured}" is not installed — using "${fallback}" instead. Available: ${names.join(", ")}`);
        return fallback;
    }
    return preferredFromList(names);
}

function preferredFromList(names) {
    if (names.length === 0) return null;
    for (const preferred of MODEL_PREFERENCE) {
        if (names.includes(preferred)) return preferred;
    }
    // If the user has a Qwen model installed under a concrete tag
    // (for example qwen:1.8b), prefer that exact installed tag rather
    // than guessing a different model family.
    const installedQwen = names.find(n => /^qwen(?:2(?:\.5)?|3)?[:@]/i.test(n));
    if (installedQwen) return installedQwen;
    // otherwise prefer the smallest installed model (fastest on CPU)
    return [...names].sort((a, b) => a.length - b.length)[0];
}

/** Explicitly set + persist the selected model. */
function setSelectedModel(name) {
    const value = String(name || "").trim();
    if (!value) return { success: false, error: "Model name is required." };
    saveSettings({ ollamaModel: value });
    // invalidate health so the next status call re-validates against models
    healthCache = { at: 0, value: null };
    return { success: true, model: value };
}

/* ---------------------------------------------------------
   CHAT
   messages: [{ role: "system"|"user"|"assistant", content: string }, ...]
   Returns { success, text, model, evalCount, durationMs } or
   { success:false, error }.
   NOTE: responses are plain text. This client NEVER executes
   anything Ollama produces — no shell, no tools, no actions.
--------------------------------------------------------- */
async function chat(messages, options = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return { success: false, error: "Messages array is required." };
    }
    for (const m of messages) {
        if (!m || typeof m.content !== "string" || !["system", "user", "assistant"].includes(m.role) ||
            (m.images !== undefined && (!Array.isArray(m.images) || m.images.length > 2 || m.images.some(image =>
                typeof image !== "string" || image.length > 7_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image))))) {
            return { success: false, error: "Malformed messages — each needs role (system|user|assistant) and string content." };
        }
    }

    const status = await getStatus();
    if (!status.enabled) {
        return { success: false, error: "Ollama is disconnected from JARVIS." };
    }
    if (!status.running) {
        return { success: false, error: status.error || "Ollama server is not running.", offline: true };
    }
    if (!status.selectedModel) {
        return { success: false, error: status.error || "No Ollama model is installed.", noModel: true };
    }

    const model = String(options.model || status.selectedModel);
    const startedAt = Date.now();
    try {
        const payload = {
            model,
            messages,
            stream: typeof options.onToken === "function",
            // Keep the small local model resident between turns and cap
            // context/output sizes for faster replies on CPU.
            keep_alive: options.keepAlive || "30m",
            ...(options.format ? { format: options.format } : {}),
            options: {
                temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
                num_ctx: Number.isFinite(options.numContext) ? Number(options.numContext) : 2048,
                num_predict: Number.isFinite(options.numPredict) ? Number(options.numPredict) : 160
            }
        };
        const res = typeof options.onToken === "function"
            ? await requestStream("POST", "/api/chat", payload, options.timeoutMs || CHAT_TIMEOUT_MS, options.onToken, options.signal)
            : await request("POST", "/api/chat", payload, options.timeoutMs || CHAT_TIMEOUT_MS, options.signal);

        if (res.status !== 200) {
            return { success: false, error: `Ollama chat failed with HTTP ${res.status}: ${safeSlice(res.body, 300)}` };
        }
        const parsed = parseJson(res.body);
        const text = parsed?.message?.content;
        if (!parsed || typeof text !== "string" || !text.trim()) {
            return { success: false, error: "Ollama returned a malformed response." };
        }
        return {
            success: true,
            text: text.trim(),
            model: parsed.model || model,
            evalCount: Number(parsed.eval_count) || null,
            durationMs: Date.now() - startedAt
        };
    } catch (error) {
        return { success: false, error: `Ollama chat error: ${error.message}` };
    }
}

function safeSlice(text, n) {
    const v = String(text || "");
    return v.length > n ? `${v.slice(0, n)}…` : v;
}

module.exports = {
    getStatus,
    chat,
    configureSettingsPath,
    setSelectedModel,
    setEnabled,
    getConfiguredModel,
    getBaseUrl,
    DEFAULT_BASE_URL,
    MODEL_PREFERENCE
};
