"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

// Inject this concise fixed identity on every Sarvam request. It is a
// product instruction only; no profile, saved memory, or earlier turn is sent.
const SARVAM_JARVIS_SYSTEM_PROMPT = [
    "You are JARVIS, the AI assistant inside Nakul's JARVIS PRO MAX desktop app.",
    "Sarvam AI is only the underlying model provider. Never introduce yourself as Sarvam.",
    "When greeted with 'Hey Jarvis' or asked 'What is Jarvis?', respond as the user's assistant, not with an encyclopedia explanation of the name or Marvel character.",
    "If asked who you are, say briefly that you are JARVIS, created by Nakul and powered by the selected AI model.",
    "Address the user naturally. Give exactly one answer, only in the language used by the user. Do not translate, repeat, or append the answer in another language."
].join(" ");

function buildProviderMessages(provider, messages, options = {}) {
    // Sarvam chat should stay privacy-conscious (current turn only), but it
    // must retain task instructions. Dropping every caller system message
    // made structured tasks such as PPT generation arrive without their JSON
    // schema or slide-count requirements.
    const outgoing = provider === "sarvam"
        ? [
            { role: "system", content: SARVAM_JARVIS_SYSTEM_PROMPT },
            ...messages.filter(message => message.role === "system").slice(-3),
            ...(options.includeConversationHistory === true
                ? messages.filter(message => message.role === "user" || message.role === "assistant").slice(-16)
                : messages.filter(message => message.role === "user").slice(-1))
        ]
        : messages;
    return outgoing.slice(-24).map(message => ({
        role: message.role,
        content: typeof message.content === "string"
            ? message.content.slice(0, 12000)
            : Array.isArray(message.content)
                ? message.content.slice(0, 8).map(part => {
                    if (part?.type === "text") return { type: "text", text: String(part.text || "").slice(0, 12000) };
                    if (part?.type === "image_url" && typeof part.image_url?.url === "string") return { type: "image_url", image_url: { url: part.image_url.url.slice(0, 8_000_000) } };
                    return null;
                }).filter(Boolean)
                : String(message.content || "").slice(0, 12000)
    }));
}

function createOpenAICompatibleClient({ app, safeStorage }) {
    const configPath = () => path.join(app.getPath("userData"), "ai-provider.json");
    const envSarvamKey = () => String(process.env.SARVAM_API_KEY || "").trim();
    const envGrokKey = () => String(process.env.XAI_API_KEY || "").trim();
    const envGroqKey = () => String(process.env.GROQ_API_KEY || "").trim();

    function readRaw() {
        try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
        catch (_) { return {}; }
    }

    function readApiKey(raw = readRaw()) {
        try {
            if (raw.apiKeyEncrypted && safeStorage?.isEncryptionAvailable?.()) {
                const stored = safeStorage.decryptString(Buffer.from(raw.apiKeyEncrypted, "base64"));
                if (stored) return stored;
            }
        } catch (_) { /* Try the environment key below. */ }
        if (raw.provider === "sarvam" || /api\.sarvam\.ai/i.test(String(raw.endpoint || ""))) return envSarvamKey();
        if (raw.provider === "grok" || /api\.x\.ai/i.test(String(raw.endpoint || ""))) return envGrokKey();
        if (raw.provider === "groq" || /api\.groq\.com/i.test(String(raw.endpoint || ""))) return envGroqKey();
        return "";
    }

    function readSarvamApiKey(raw = readRaw()) {
        // When both are present, .env is the explicitly configured runtime key.
        // A stale encrypted key left from an older setup must not shadow it.
        const envKey = envSarvamKey();
        if (envKey) return envKey;
        const savedKey = raw.sarvamApiKeyEncrypted || (raw.provider === "sarvam" ? raw.apiKeyEncrypted : "");
        try {
            if (savedKey && safeStorage?.isEncryptionAvailable?.()) {
                const stored = safeStorage.decryptString(Buffer.from(savedKey, "base64"));
                if (stored) return stored;
            }
        } catch (_) { /* Fall through to the main-process environment key. */ }

        return "";
    }

    function readSavedSarvamApiKey(raw = readRaw()) {
        const savedKey = raw.sarvamApiKeyEncrypted || (raw.provider === "sarvam" ? raw.apiKeyEncrypted : "");
        try {
            if (savedKey && safeStorage?.isEncryptionAvailable?.()) {
                return safeStorage.decryptString(Buffer.from(savedKey, "base64")) || "";
            }
        } catch (_) { /* A configured environment key may still work. */ }
        return "";
    }

    function getConfig() {
        const raw = readRaw();
        // Older builds stored Ollama as the chat provider before the explicit
        // provider selector existed. Preserve the one-time Sarvam migration
        // when a saved Sarvam credential is present, while honoring a current
        // explicit Ollama/Grok choice.
        const legacySarvam = raw.provider === "ollama" && !raw.providerPreferenceSet && Boolean(raw.sarvamApiKeyEncrypted);
        // Older setup instructions could save GPT-OSS under Grok. Treat that
        // known endpoint/model mismatch as Groq when the Groq env key exists,
        // so the app recovers without requiring a manual config-file edit.
        const savedGptOssUnderGrok = raw.provider === "grok"
            && (String(raw.model || "").toLowerCase() === "openai/gpt-oss-120b" || (!envGrokKey() && Boolean(envGroqKey())));
        const provider = legacySarvam ? "sarvam" : savedGptOssUnderGrok ? "groq" : ["sarvam", "grok", "groq", "ollama", "openai-compatible"].includes(raw.provider) ? raw.provider : "sarvam";
        const usesSavedProvider = raw.provider === provider;
        const isSarvam = provider === "sarvam" || /api\.sarvam\.ai/i.test(String(raw.endpoint || ""));
        const isGrok = provider === "grok" || /api\.x\.ai/i.test(String(raw.endpoint || ""));
        const isGroq = provider === "groq" || /api\.groq\.com/i.test(String(raw.endpoint || ""));
        const envKey = envSarvamKey();
        return {
            success: true,
            provider,
            providerName: String(provider === "sarvam" ? "Sarvam AI" : provider === "grok" ? "Grok" : provider === "groq" ? "Groq" : raw.providerName || (provider === "openai-compatible" ? "API model" : "Ollama")),
            endpoint: String((usesSavedProvider && raw.endpoint) || (provider === "sarvam" ? "https://api.sarvam.ai/v1" : provider === "grok" ? "https://api.x.ai/v1" : provider === "groq" ? "https://api.groq.com/openai/v1" : "")),
            model: String((usesSavedProvider && raw.model) || (provider === "sarvam" ? (process.env.SARVAM_CHAT_MODEL || "sarvam-105b") : provider === "grok" ? (process.env.XAI_MODEL || "grok-4.1-fast") : provider === "groq" ? (process.env.GROQ_MODEL || "openai/gpt-oss-120b") : "")),
            hasApiKey: Boolean(readApiKey(raw) || (isSarvam && (envKey || readSarvamApiKey(raw))) || (isGrok && envGrokKey()) || (isGroq && envGroqKey())),
            hasSarvamApiKey: Boolean(readSarvamApiKey(raw)),
            visionModel: String((usesSavedProvider && raw.visionModel) || (provider === "groq" ? process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b" : provider === "grok" ? process.env.XAI_VISION_MODEL || "" : "")),
            envKeyAvailable: Boolean(envKey),
            apiKeySource: raw.apiKeyEncrypted || raw.sarvamApiKeyEncrypted ? "secure-storage" : isSarvam && envKey ? "environment" : isGrok && envGrokKey() ? "environment" : isGroq && envGroqKey() ? "environment" : "none",
            sarvamHistoryTurns: Number.isInteger(Number(raw.sarvamHistoryTurns)) ? Math.max(0, Math.min(8, Number(raw.sarvamHistoryTurns))) : 8
        };
    }

    function savePrivacySettings(input = {}) {
        const raw = readRaw();
        const turns = Number(input.sarvamHistoryTurns);
        if (!Number.isInteger(turns) || turns < 0 || turns > 8) return { success: false, error: "Choose between 0 and 8 recent conversation turns." };
        try {
            fs.mkdirSync(path.dirname(configPath()), { recursive: true });
            fs.writeFileSync(configPath(), JSON.stringify({ ...raw, sarvamHistoryTurns: turns }, null, 2), { encoding: "utf8", mode: 0o600 });
            return { success: true, config: getConfig() };
        } catch (error) {
            return { success: false, error: `Could not save privacy settings: ${error.message}` };
        }
    }

    function saveConfig(input = {}) {
        const provider = ["sarvam", "grok", "groq", "openai-compatible", "ollama"].includes(input.provider) ? input.provider : null;
        if (!provider) return { success: false, error: "Choose Ollama, Sarvam AI, Grok or an OpenAI-compatible API." };
        const old = readRaw();
        const keepOldKey = old.provider === provider;
        const suppliedKey = String(input.apiKey || "").trim();
        let apiKeyEncrypted = keepOldKey ? (old.apiKeyEncrypted || "") : "";
        if (provider === "sarvam" && !apiKeyEncrypted && old.sarvamApiKeyEncrypted) apiKeyEncrypted = old.sarvamApiKeyEncrypted;
        if (suppliedKey) {
            if (!safeStorage?.isEncryptionAvailable?.()) return { success: false, error: "Secure local key storage is unavailable on this device." };
            try { apiKeyEncrypted = safeStorage.encryptString(suppliedKey).toString("base64"); }
            catch (_) { return { success: false, error: "Could not securely store the API key." }; }
        }
        const next = {
            provider,
            visionModel: String(input.visionModel ?? (keepOldKey ? old.visionModel || "" : "")).trim().slice(0, 200),
            providerName: String(input.providerName || (provider === "sarvam" ? "Sarvam AI" : provider === "grok" ? "Grok" : provider === "groq" ? "Groq" : old.providerName || "API model")).trim().slice(0, 80),
            endpoint: String(input.endpoint || (provider === "sarvam" ? "https://api.sarvam.ai/v1" : provider === "grok" ? "https://api.x.ai/v1" : provider === "groq" ? "https://api.groq.com/openai/v1" : "")).trim().slice(0, 1000),
            model: String(input.model || (provider === "sarvam" ? (process.env.SARVAM_CHAT_MODEL || "sarvam-105b") : provider === "grok" ? (process.env.XAI_MODEL || "grok-4.1-fast") : provider === "groq" ? (process.env.GROQ_MODEL || "openai/gpt-oss-120b") : "")).trim().slice(0, 200),
            apiKeyEncrypted: provider === "sarvam" || provider === "grok" || provider === "groq" || provider === "openai-compatible" ? apiKeyEncrypted : "",
            sarvamApiKeyEncrypted: provider === "sarvam" && suppliedKey
                ? apiKeyEncrypted
                : old.sarvamApiKeyEncrypted || (provider === "sarvam" ? apiKeyEncrypted : ""),
            sarvamHistoryTurns: Number.isInteger(Number(input.sarvamHistoryTurns))
                ? Math.max(0, Math.min(8, Number(input.sarvamHistoryTurns)))
                : Number.isInteger(Number(old.sarvamHistoryTurns)) ? Math.max(0, Math.min(8, Number(old.sarvamHistoryTurns))) : 8,
            providerPreferenceSet: true
        };
        if (provider === "openai-compatible" || provider === "sarvam" || provider === "grok" || provider === "groq") {
            if (!next.endpoint || !next.model) return { success: false, error: "API endpoint and model are required." };
            let url;
            try { url = new URL(next.endpoint); }
            catch (_) { return { success: false, error: "Enter a valid API endpoint URL." }; }
            const loopback = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname);
            if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback)) || url.username || url.password) {
                return { success: false, error: "Use HTTPS for remote APIs. HTTP is allowed only for localhost." };
            }
            if (provider === "sarvam" && url.hostname.toLowerCase() !== "api.sarvam.ai") {
                return { success: false, error: "Sarvam AI must use https://api.sarvam.ai/v1." };
            }
            if (provider === "grok" && url.hostname.toLowerCase() !== "api.x.ai") {
                return { success: false, error: "Grok must use https://api.x.ai/v1." };
            }
            if (provider === "groq" && url.hostname.toLowerCase() !== "api.groq.com") {
                return { success: false, error: "Groq must use https://api.groq.com/openai/v1." };
            }
            if (provider === "openai-compatible" && url.hostname.toLowerCase() === "api.sarvam.ai") {
                return { success: false, error: "Select the Sarvam AI provider and configure SARVAM_API_KEY in .env; renderer-entered Sarvam keys are not accepted." };
            }
            if (provider === "sarvam" && !readSarvamApiKey(next)) return { success: false, error: "Enter your Sarvam API key in Settings, or set SARVAM_API_KEY in .env." };
            if (provider === "grok" && !next.apiKeyEncrypted && !envGrokKey()) return { success: false, error: "Enter your Grok API key, or set XAI_API_KEY in .env." };
            if (provider === "groq" && !next.apiKeyEncrypted && !envGroqKey()) return { success: false, error: "Enter your Groq API key, or set GROQ_API_KEY in .env." };
            if (provider === "openai-compatible" && !next.apiKeyEncrypted) return { success: false, error: "Enter an API key before selecting this provider." };
        }
        try {
            fs.mkdirSync(path.dirname(configPath()), { recursive: true });
            fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
            return { success: true, config: getConfig() };
        } catch (error) {
            return { success: false, error: `Could not save provider settings: ${error.message}` };
        }
    }

    function completionUrl(endpoint) {
        const url = new URL(endpoint);
        if (!/\/chat\/completions\/?$/i.test(url.pathname)) {
            url.pathname = `${url.pathname.replace(/\/+$/, "")}${/\/v1$/i.test(url.pathname) ? "" : "/v1"}/chat/completions`;
        }
        return url;
    }

    function chat(messages, options = {}, providerOverride = "") {
        const raw = readRaw();
        const config = providerOverride === "sarvam"
            ? {
                ...getConfig(),
                provider: "sarvam",
                providerName: "Sarvam AI",
                endpoint: raw.provider === "sarvam" ? (raw.endpoint || "https://api.sarvam.ai/v1") : "https://api.sarvam.ai/v1",
                model: raw.provider === "sarvam" ? (raw.model || process.env.SARVAM_CHAT_MODEL || "sarvam-105b") : (process.env.SARVAM_CHAT_MODEL || "sarvam-105b")
            }
            : getConfig();
        let apiKey = config.provider === "sarvam" ? readSarvamApiKey(raw) : readApiKey(raw);
        const envSarvamCredential = config.provider === "sarvam" ? envSarvamKey() : "";
        const savedSarvamCredential = config.provider === "sarvam" ? readSavedSarvamApiKey(raw) : "";
        const alternateSarvamCredential = apiKey === envSarvamCredential ? savedSarvamCredential : envSarvamCredential;
        let triedAlternateSarvamCredential = false;
        if (!["openai-compatible", "sarvam", "grok", "groq"].includes(config.provider)) return Promise.resolve({ success: false, error: "A remote API provider is not selected." });
        if (!config.endpoint || !config.model || !apiKey) return Promise.resolve({
            success: false,
            error: providerOverride === "sarvam"
                ? "Sarvam chat key is unavailable. Add SARVAM_API_KEY to the app environment or save the Sarvam provider key in JARVIS Settings."
                : "Configure the API endpoint, model and key in Settings."
        });
        if (!Array.isArray(messages) || !messages.length || messages.some(m => !["system", "user", "assistant"].includes(m?.role) || !(typeof m?.content === "string" || Array.isArray(m?.content)))) {
            return Promise.resolve({ success: false, error: "Messages must contain valid chat roles and text." });
        }
        let url;
        try { url = completionUrl(config.endpoint); }
        catch (_) { return Promise.resolve({ success: false, error: "The configured API endpoint is invalid." }); }
        const transport = url.protocol === "https:" ? https : http;
        const requestModel = options.vision === true ? (config.visionModel || config.model) : config.model;
        if (options.vision === true && /gpt-oss/i.test(requestModel)) return Promise.resolve({ success: false, error: "GPT-OSS cannot read screenshots. Choose a vision model in AI provider settings; the chat model can stay unchanged." });
        const body = Buffer.from(JSON.stringify({
            model: requestModel,
            messages: buildProviderMessages(config.provider, messages, options),
            temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
            max_tokens: Number.isFinite(options.maxTokens) ? Math.max(32, Math.min(options.maxTokens, 4096)) : 1200,
            // Sarvam reasoning can consume the entire completion budget even
            // at low effort, leaving message.content=null. Normal chat is a
            // direct conversation, so disable hidden reasoning by default and
            // reserve the full token budget for the user-facing answer. Pass
            // an explicit effort only for callers that need it.
            ...(config.provider === "sarvam" ? { reasoning_effort: options.reasoningEffort || null } : {}),
            ...(config.provider === "sarvam" && options.responseFormat ? { response_format: options.responseFormat } : {})
        }));
        const started = Date.now();
        const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 120000, 180000));
        const signal = options.signal;
        if (signal?.aborted) return Promise.resolve({ success: false, networkUnavailable: true, error: "Request cancelled." });
        const providerLabel = config.provider === "sarvam" ? "Sarvam" : config.provider === "grok" ? "Grok" : config.provider === "groq" ? "Groq" : "API provider";
        const retryableNetworkCodes = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);
        const retryDelay = (retryAfter, attempt) => {
            const header = String(retryAfter || "").trim();
            const seconds = Number(header);
            const dateDelay = Date.parse(header) - Date.now();
            const requested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : dateDelay;
            return Math.max(250, Math.min(requested > 0 ? requested : 350 * (2 ** attempt), 8000));
        };
        const attemptRequest = attempt => new Promise(resolve => {
            let settled = false;
            let request = null;
            let retryTimer = null;
            let deadlineTimer = null;
            const onAbort = () => {
                finish({ success: false, cancelled: true, error: "Request cancelled." });
                request?.destroy(Object.assign(new Error("Request cancelled."), { code: "ABORT_ERR" }));
            };
            const finish = value => {
                if (settled) return;
                settled = true;
                clearTimeout(retryTimer);
                clearTimeout(deadlineTimer);
                signal?.removeEventListener?.("abort", onAbort);
                resolve(value);
            };
            const scheduleRetry = (nextAttempt, delay) => {
                if (settled) return;
                retryTimer = setTimeout(() => {
                    if (!settled) attemptRequest(nextAttempt).then(finish);
                }, delay);
            };
            const remainingMs = timeoutMs - (Date.now() - started);
            if (signal?.aborted) { onAbort(); return; }
            if (remainingMs <= 0) {
                finish({ success: false, networkUnavailable: true, error: `${providerLabel} request timed out after ${timeoutMs}ms.` });
                return;
            }
            deadlineTimer = setTimeout(() => {
                finish({ success: false, networkUnavailable: true, error: `${providerLabel} request timed out after ${timeoutMs}ms.` });
                request?.destroy(Object.assign(new Error("Request deadline exceeded."), { code: "ETIMEDOUT" }));
            }, remainingMs);
            const req = request = transport.request(url, {
                method: "POST",
                timeout: remainingMs,
                headers: {
                    ...(config.provider === "sarvam" || /api\.sarvam\.ai/i.test(url.hostname)
                        ? { "api-subscription-key": apiKey }
                        : { "Authorization": `Bearer ${apiKey}` }),
                    "Content-Type": "application/json",
                    "Content-Length": body.length,
                    "User-Agent": "JARVIS-Desktop/1.0"
                }
            }, res => {
                const chunks = [];
                let responseBytes = 0;
                res.on("data", chunk => {
                    responseBytes += chunk.length;
                    if (responseBytes > 2_000_000) {
                        res.destroy(new Error(`${providerLabel} response exceeded the 2 MB limit.`));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on("end", () => {
                    if (settled) return;
                    const rawBody = Buffer.concat(chunks).toString("utf8");
                    let parsed;
                    try { parsed = JSON.parse(rawBody); } catch (_) { parsed = null; }
                    const statusCode = Number(res.statusCode) || 0;
                    if (statusCode < 200 || statusCode >= 300) {
                        const apiError = parsed?.error;
                        const detail = apiError?.message || (typeof apiError === "string" ? apiError : parsed?.message) || rawBody.slice(0, 400) || `HTTP ${statusCode}`;
                        const errorCode = apiError?.code || parsed?.code || parsed?.error_code || "";
                        const quotaFailure = /no\s+(?:api\s+)?credits?|insufficient[_\s]+quota|quota.{0,30}(?:exhaust|credit)|credit.{0,30}(?:exhaust|unavailable)/i.test(`${detail} ${errorCode}`);
                        // The environment and Settings can contain different
                        // Sarvam accounts. If the primary credential is stale,
                        // try the other locally configured credential once so
                        // an old no-credit key cannot mask the active one.
                        if (config.provider === "sarvam" && !triedAlternateSarvamCredential && alternateSarvamCredential && alternateSarvamCredential !== apiKey && (quotaFailure || statusCode === 401 || statusCode === 403)) {
                            triedAlternateSarvamCredential = true;
                            apiKey = alternateSarvamCredential;
                            return scheduleRetry(0, 0);
                        }
                        const canRetry = attempt < 2 && !quotaFailure && (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500);
                        if (canRetry) {
                            return scheduleRetry(attempt + 1, retryDelay(res.headers["retry-after"], attempt));
                        }
                        const requestId = res.headers["x-request-id"] || res.headers["request-id"] || res.headers["x-correlation-id"];
                        const providerError = `${providerLabel} API HTTP ${statusCode}${errorCode ? ` (${String(errorCode).slice(0, 80)})` : ""}: ${String(detail).slice(0, 400)}${requestId ? ` · request ${String(requestId).slice(0, 100)}` : ""}`;
                        return finish({ success: false, error: providerError, statusCode, errorCode: String(errorCode || ""), requestId: String(requestId || "") });
                    }
                    const choice = parsed?.choices?.[0];
                    const text = choice?.message?.content;
                    if (typeof text !== "string" || !text.trim()) {
                        const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown";
                        const completionTokens = Number(parsed?.usage?.completion_tokens);
                        const reasoningTokens = Number(parsed?.usage?.completion_tokens_details?.reasoning_tokens);
                        const budgetNote = finishReason === "length"
                            ? ` The response stopped at its token limit${Number.isFinite(completionTokens) ? ` (${completionTokens} completion tokens` : ""}${Number.isFinite(reasoningTokens) && reasoningTokens > 0 ? `, ${reasoningTokens} used for reasoning` : ""}${Number.isFinite(completionTokens) ? ")" : ""}.` 
                            : "";
                        return finish({ success: false, error: `${providerLabel} returned HTTP ${statusCode} without assistant text (finish reason: ${finishReason}).${budgetNote}`, statusCode, finishReason });
                    }
                    finish({ success: true, text: text.trim(), model: requestModel, statusCode, durationMs: Date.now() - started });
                });
                res.on("error", error => finish({ success: false, error: `${providerLabel} response failed: ${error.message || error}` }));
            });
            req.on("timeout", () => req.destroy(Object.assign(new Error(`${providerLabel} request timed out after ${timeoutMs}ms.`), { code: "ETIMEDOUT" })));
            req.on("error", error => {
                if (settled) return;
                if (signal?.aborted) return finish({ success: false, networkUnavailable: true, error: "Request cancelled." });
                if (attempt < 2 && retryableNetworkCodes.has(error?.code)) {
                    return scheduleRetry(attempt + 1, retryDelay("", attempt));
                }
                finish({ success: false, networkUnavailable: true, error: `${providerLabel} network request failed${error?.code ? ` (${error.code})` : ""}: ${error.message || "Could not reach the configured service."}` });
            });
            signal?.addEventListener?.("abort", onAbort, { once: true });
            if (signal?.aborted) { onAbort(); return; }
            req.end(body);
        });
        return attemptRequest(0);
    }

    function generateImage(prompt, options = {}) {
        const apiKey = String(process.env.HOLDAPI_API_KEY || process.env.AI_HOLD_API_KEY || "").trim();
        const endpoint = String(process.env.HOLDAPI_BASE_URL || "https://holdapi.lol/v1").replace(/\/+$/, "");
        const model = String(options.model || process.env.HOLDAPI_IMAGE_MODEL || "").trim();
        if (!apiKey) return Promise.resolve({ success: false, error: "Add HOLDAPI_API_KEY to the local .env before using HoldAPI image generation." });
        if (!/^api_/i.test(apiKey)) return Promise.resolve({ success: false, error: "The HoldAPI key format is invalid. Create a new key in the HoldAPI dashboard; it should start with api_." });
        if (!model) return Promise.resolve({ success: false, error: "Set HOLDAPI_IMAGE_MODEL to an image model ID from the HoldAPI catalog." });
        if (!model.includes("/")) return Promise.resolve({ success: false, error: "HOLDAPI_IMAGE_MODEL must be the full catalog ID in provider/model format, not a display name." });
        const text = String(prompt || "").trim().slice(0, 4000);
        if (!text) return Promise.resolve({ success: false, error: "An image prompt is required." });
        let url;
        try { url = new URL(`${endpoint}/images/generations`); } catch (_) { return Promise.resolve({ success: false, error: "The HoldAPI base URL is invalid." }); }
        const body = Buffer.from(JSON.stringify({ model, prompt: text, n: Math.max(1, Math.min(4, Number(options.n) || 1)), ...(options.size ? { size: String(options.size) } : {}) }));
        const transport = url.protocol === "https:" ? https : http;
        return new Promise(resolve => {
            const req = transport.request(url, { method: "POST", timeout: Math.min(180000, Math.max(1000, Number(options.timeoutMs) || 120000)), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Content-Length": body.length, "User-Agent": "JARVIS-Desktop/1.0" } }, res => {
                const chunks = []; let bytes = 0;
                res.on("data", chunk => { bytes += chunk.length; if (bytes <= 12_000_000) chunks.push(chunk); });
                res.on("end", () => {
                    const raw = Buffer.concat(chunks).toString("utf8"); let parsed = null;
                    try { parsed = JSON.parse(raw); } catch (_) {}
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        const detail = parsed?.error?.message || parsed?.error || parsed?.message || raw.slice(0, 400) || `HTTP ${res.statusCode}`;
                        resolve({ success: false, error: `HoldAPI image request failed (${res.statusCode}): ${String(detail).slice(0, 500)}` }); return;
                    }
                    const item = Array.isArray(parsed?.data) ? parsed.data[0] : null;
                    if (!item?.b64_json && !item?.url) { resolve({ success: false, error: "HoldAPI returned no image data." }); return; }
                    resolve({ success: true, model, url: item.url || "", b64Json: item.b64_json || "", revisedPrompt: item.revised_prompt || "" });
                });
                res.on("error", error => resolve({ success: false, error: `HoldAPI response failed: ${error.message}` }));
            });
            req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "HoldAPI image request timed out." }); });
            req.on("error", error => resolve({ success: false, error: `HoldAPI network request failed: ${error.message}` }));
            req.end(body);
        });
    }

    return { getConfig, saveConfig, savePrivacySettings, chat, generateImage, chatSarvam: (messages, options = {}) => chat(messages, options, "sarvam") };
}

module.exports = { createOpenAICompatibleClient, SARVAM_JARVIS_SYSTEM_PROMPT, buildProviderMessages };
