"use strict";

/**
 * ============================================================
 * JARVIS OFFLINE KNOWLEDGE CACHE
 * ============================================================
 *
 * Purpose (as requested):
 *   Jarvis kisi bhi website se (Wikipedia, Wikidata, REST
 *   Countries, Open Library, Wikimedia Commons images, NASA,
 *   etc. — see src/services/wikipedia.js and dataSources.js)
 *   jo bhi data ya image leta hai, use disk par save kar deta
 *   hai. Agar agli baar internet na ho, wahi cached jawab /
 *   image offline mil jaati hai.
 *
 * Design:
 *   - Runs in the MAIN process (Node fs), same pattern as the
 *     other src/services/*.js files.
 *   - Everything is stored under Electron's userData folder, so
 *     it survives app restarts (unlike renderer localStorage).
 *   - Text/JSON answers -> jarvis_offline_cache/data/<hash>.json
 *   - Images (thumbnails, Commons images, NASA APOD, etc.)
 *     -> jarvis_offline_cache/images/<hash>.<ext>, referenced
 *     back to callers as a local "file://" path so <img> tags
 *     in the renderer keep working with zero internet.
 *   - A lightweight index.json keeps metadata (source url, when
 *     it was saved, a search-friendly title/snippet) so the
 *     whole offline library can be browsed/searched even when
 *     completely offline.
 *
 * This module is intentionally dependency-free (Node core only)
 * so it works in the "self-contained offline brain" build with
 * no extra npm installs required.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const REQUEST_TIMEOUT_MS = 15000;
const ONLINE_CHECK_TIMEOUT_MS = 3500;
const ONLINE_CHECK_CACHE_MS = 10000; // don't hammer the network every call
const USER_AGENT = "JARVIS-PRO-MAX/1.0 (local desktop assistant, offline cache)";

let ROOT_DIR = null;
let DATA_DIR = null;
let offlineOnly = false;
let IMAGES_DIR = null;
let INDEX_PATH = null;

let index = { entries: {} }; // key -> { type, sourceUrl, title, snippet, savedAt, file }
let lastOnlineCheck = { at: 0, online: true };
let electronNetworkFetch = null;

function setNetworkFetch(fetcher) {
    electronNetworkFetch = typeof fetcher === "function" ? fetcher : null;
}

/* ============================================================
   INITIALISATION
============================================================ */

function init(baseDir) {
    ROOT_DIR = path.join(baseDir, "jarvis_offline_cache");
    DATA_DIR = path.join(ROOT_DIR, "data");
    IMAGES_DIR = path.join(ROOT_DIR, "images");
    INDEX_PATH = path.join(ROOT_DIR, "index.json");

    for (const dir of [ROOT_DIR, DATA_DIR, IMAGES_DIR]) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
            // ignore, we'll fail loudly later on actual read/write if needed
        }
    }

    loadIndex();

    return { success: true, root: ROOT_DIR };
}

function loadIndex() {
    try {
        if (fs.existsSync(INDEX_PATH)) {
            const raw = fs.readFileSync(INDEX_PATH, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.entries) {
                index = parsed;
            }
        }
    } catch (error) {
        index = { entries: {} };
    }
}

function saveIndex() {
    try {
        fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
        return true;
    } catch (error) {
        return false;
    }
}

/* ============================================================
   KEY HELPERS
============================================================ */

function hashKey(key) {
    return crypto.createHash("sha1").update(String(key)).digest("hex");
}

function normalizeKey(key) {
    return String(key || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

/* ============================================================
   ONLINE / OFFLINE DETECTION
============================================================ */

function isOnline() {
    if (offlineOnly) return Promise.resolve(false);
    const now = Date.now();

    if (now - lastOnlineCheck.at < ONLINE_CHECK_CACHE_MS) {
        return Promise.resolve(lastOnlineCheck.online);
    }

    return new Promise((resolve) => {
        const req = https.get(
            "https://www.wikipedia.org/",
            { headers: { "User-Agent": USER_AGENT } },
            (res) => {
                res.resume();
                lastOnlineCheck = { at: Date.now(), online: true };
                resolve(true);
            }
        );

        req.setTimeout(ONLINE_CHECK_TIMEOUT_MS, () => {
            req.destroy();
            lastOnlineCheck = { at: Date.now(), online: false };
            resolve(false);
        });

        req.on("error", () => {
            lastOnlineCheck = { at: Date.now(), online: false };
            resolve(false);
        });
    });
}

/* ============================================================
   TEXT / JSON CACHE
============================================================ */

function setText(key, value, meta = {}) {
    if (!DATA_DIR) return false;

    const id = hashKey(normalizeKey(key));
    const file = path.join(DATA_DIR, `${id}.json`);

    try {
        fs.writeFileSync(file, JSON.stringify(value), "utf8");

        index.entries[id] = {
            key: normalizeKey(key),
            type: meta.type || "text",
            sourceUrl: meta.sourceUrl || null,
            title: meta.title || normalizeKey(key),
            snippet: meta.snippet || "",
            savedAt: new Date().toISOString(),
            file: path.basename(file)
        };

        saveIndex();
        return true;
    } catch (error) {
        return false;
    }
}

function getText(key) {
    if (!DATA_DIR) return null;

    const id = hashKey(normalizeKey(key));
    const meta = index.entries[id];
    const file = path.join(DATA_DIR, `${id}.json`);

    if (!meta || !fs.existsSync(file)) return null;

    try {
        const raw = fs.readFileSync(file, "utf8");
        return { value: JSON.parse(raw), meta };
    } catch (error) {
        return null;
    }
}

function hasText(key) {
    return !!getText(key);
}

/* ============================================================
   IMAGE CACHE
   Downloads a remote image once and keeps a local copy so it
   can be shown with zero internet from then on.
============================================================ */

function extensionFromUrl(url) {
    try {
        const clean = String(url).split("?")[0].split("#")[0];
        const ext = path.extname(clean).toLowerCase();
        if (/^\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(ext)) return ext;
    } catch (error) {
        // fall through
    }
    return ".jpg";
}

function downloadBinaryNative(url, redirectsLeft = 5, maxBytes = Infinity, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(Object.assign(new Error("Image request cancelled."), { name: "AbortError" })); return; }
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            reject(new Error(`Invalid image URL: ${url}`));
            return;
        }

        const client = parsed.protocol === "http:" ? http : https;

        const req = client.get(
            parsed,
            { headers: { "User-Agent": USER_AGENT } },
            (res) => {
                if (
                    res.statusCode &&
                    [301, 302, 303, 307, 308].includes(res.statusCode) &&
                    res.headers.location &&
                    redirectsLeft > 0
                ) {
                    res.resume();
                    const nextUrl = new URL(res.headers.location, parsed).toString();
                    downloadBinaryNative(nextUrl, redirectsLeft - 1, maxBytes, signal).then(resolve, reject);
                    return;
                }

                if (res.statusCode && res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`Image request failed (${res.statusCode})`));
                    return;
                }

                const declaredLength = Number(res.headers["content-length"] || 0);
                if (Number.isFinite(maxBytes) && declaredLength > maxBytes) {
                    res.resume();
                    reject(new Error("Image exceeds the presentation image size limit."));
                    return;
                }

                const chunks = [];
                let received = 0;
                let overLimit = false;
                res.on("data", (chunk) => {
                    received += chunk.length;
                    if (Number.isFinite(maxBytes) && received > maxBytes) {
                        overLimit = true;
                        res.destroy();
                        reject(new Error("Image exceeds the presentation image size limit."));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on("end", () => resolve(Buffer.concat(chunks)));
                res.on("error", error => { if (!overLimit) reject(error); });
            }
        );

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error("Image request timed out."));
        });
        const onAbort = () => req.destroy(Object.assign(new Error("Image request cancelled."), { name: "AbortError" }));
        signal?.addEventListener?.("abort", onAbort, { once: true });
        req.once("close", () => signal?.removeEventListener?.("abort", onAbort));
        req.on("error", reject);
    });
}

async function downloadBinaryOnce(url, redirectsLeft = 5, maxBytes = Infinity, signal) {
    if (!electronNetworkFetch) return downloadBinaryNative(url, redirectsLeft, maxBytes, signal);
    try {
        const response = await electronNetworkFetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8" }, timeoutMs: REQUEST_TIMEOUT_MS, signal });
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (Number.isFinite(maxBytes) && declaredLength > maxBytes) throw new Error("Image exceeds the presentation image size limit.");
        const reader = response.body?.getReader?.();
        if (!reader) {
            const buffer = Buffer.from(await response.arrayBuffer());
            if (Number.isFinite(maxBytes) && buffer.length > maxBytes) throw new Error("Image exceeds the presentation image size limit.");
            return buffer;
        }
        const chunks = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            received += chunk.length;
            if (Number.isFinite(maxBytes) && received > maxBytes) {
                await reader.cancel().catch(() => {});
                throw new Error("Image exceeds the presentation image size limit.");
            }
            chunks.push(chunk);
        }
        return Buffer.concat(chunks, received);
    } catch (desktopError) {
        if (signal?.aborted) throw desktopError;
        try { return await downloadBinaryNative(url, redirectsLeft, maxBytes, signal); }
        catch (nativeError) {
            throw new Error(`Desktop image fetch: ${desktopError?.message || desktopError}; direct image fetch: ${nativeError?.message || nativeError}`);
        }
    }
}

async function downloadBinary(url, redirectsLeft = 5, maxBytes = Infinity, signal) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try { return await downloadBinaryOnce(url, redirectsLeft, maxBytes, signal); }
        catch (error) {
            lastError = error;
            if (signal?.aborted || attempt >= 2 || !/\b429\b|too many requests|rate.?limit/i.test(String(error?.message || error))) break;
            await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
        }
    }
    throw lastError || new Error("Image download failed.");
}

/**
 * Caches an image from a remote URL. Returns a stable local
 * "file://" URL that keeps working offline. If the image was
 * already cached, no network call is made at all.
 */
async function cacheImage(url, options = {}) {
    if (!url || typeof url !== "string") return null;
    if (!IMAGES_DIR) return null;

    const id = hashKey(url);
    const existing = index.entries[`img_${id}`];
    const preferredExtension = String(options.extension || "").toLowerCase();
    const requestedExtension = /^\.(?:jpe?g|png|gif)$/.test(preferredExtension) ? preferredExtension : "";

    if (existing) {
        const file = path.join(IMAGES_DIR, existing.file);
        if (fs.existsSync(file) && (!requestedExtension || path.extname(file).toLowerCase() === requestedExtension)) {
            return {
                localPath: file,
                localUrl: `file://${file.replace(/\\/g, "/")}`,
                sourceUrl: url,
                fromCache: true
            };
        }
    }

    try {
        const maxBytes = Number(options.maxBytes);
        const buffer = await downloadBinary(url, 5, Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : Infinity, options.signal);
        const ext = requestedExtension || extensionFromUrl(url);
        const filename = `${id}${ext}`;
        const file = path.join(IMAGES_DIR, filename);

        fs.writeFileSync(file, buffer);

        index.entries[`img_${id}`] = {
            key: url,
            type: "image",
            sourceUrl: url,
            title: path.basename(url),
            savedAt: new Date().toISOString(),
            file: filename
        };

        saveIndex();

        return {
            localPath: file,
            localUrl: `file://${file.replace(/\\/g, "/")}`,
            sourceUrl: url,
            fromCache: false
        };
    } catch (error) {
        if (typeof options.onError === "function") {
            try { options.onError(error); } catch (_) { /* Diagnostics must never break caching. */ }
        }
        // No internet / image unreachable — if we have any older
        // cached copy under a slightly different key we can't find
        // it (keyed by exact URL), so we just report failure and
        // the caller keeps using the original remote URL.
        return null;
    }
}

/**
 * Walks an arbitrary result object and caches any image-looking
 * URLs it finds (fields literally named thumbnail/image/photo/
 * icon, or values that end in a known image extension). Returns
 * a shallow-cloned object with those fields rewritten to local
 * file:// paths where caching succeeded, plus a `_images` map of
 * remoteUrl -> localUrl for anything that isn't a plain field
 * (e.g. arrays of results).
 */
async function cacheImagesInResult(obj) {
    if (!obj || typeof obj !== "object") return obj;

    const IMAGE_FIELD_NAMES = /^(thumbnail|image|images|photo|photos|icon|cover|poster|url_original|thumb)$/i;
    const IMAGE_URL_RE = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;

    async function walk(node) {
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = await walk(node[i]);
            }
            return node;
        }

        if (node && typeof node === "object") {
            for (const key of Object.keys(node)) {
                const val = node[key];

                if (typeof val === "string" && /^https?:\/\//i.test(val)) {
                    if (IMAGE_FIELD_NAMES.test(key) || IMAGE_URL_RE.test(val)) {
                        const cached = await cacheImage(val);
                        if (cached) {
                            node[key] = cached.localUrl;
                            node[`${key}_remote`] = val;
                        }
                    }
                } else if (val && typeof val === "object") {
                    node[key] = await walk(val);
                }
            }
            return node;
        }

        return node;
    }

    try {
        const clone = JSON.parse(JSON.stringify(obj));
        return await walk(clone);
    } catch (error) {
        return obj;
    }
}

/* ============================================================
   GENERIC "CACHE-THROUGH" WRAPPER
   Wrap any async data-source function so that:
     - a successful live result gets cached (text + any images)
     - a failed/offline call transparently falls back to the
       last cached result for the same arguments
============================================================ */

function cacheThrough(sourceName, fn) {
    return async function wrapped(...args) {
        const cacheKey = `${sourceName}:${JSON.stringify(args)}`;

        // Strict local mode must never call the live provider, even to test
        // connectivity. Exact-key cached answers remain available offline.
        if (offlineOnly) {
            const cached = getText(cacheKey);
            if (cached) {
                return {
                    ...cached.value,
                    success: true,
                    offline: true,
                    fromCache: true,
                    cachedAt: cached.meta.savedAt
                };
            }
            return {
                success: false,
                offline: true,
                error: "JARVIS is running offline. No saved local result is available for this request."
            };
        }

        let liveResult;
        let liveError = null;

        try {
            liveResult = await fn(...args);
        } catch (error) {
            liveError = error;
        }

        const succeeded =
            !liveError &&
            liveResult &&
            liveResult.success !== false;

        if (succeeded) {
            const withLocalImages = await cacheImagesInResult(liveResult);

            setText(cacheKey, withLocalImages, {
                type: sourceName,
                sourceUrl: (liveResult && liveResult.url) || null,
                title: (liveResult && (liveResult.title || liveResult.name)) || cacheKey,
                snippet:
                    (liveResult &&
                        (liveResult.extract || liveResult.summary || "")
                    ).toString().slice(0, 300)
            });

            return withLocalImages;
        }

        // Live call failed (most likely offline) — try the cache.
        const cached = getText(cacheKey);

        if (cached) {
            return {
                ...cached.value,
                success: true,
                offline: true,
                fromCache: true,
                cachedAt: cached.meta.savedAt
            };
        }

        // Nothing cached either — return the original failure so
        // the rest of the app behaves exactly as before.
        if (liveError) {
            return {
                success: false,
                error: liveError.message || String(liveError),
                offline: true
            };
        }

        return liveResult;
    };
}

/**
 * Wraps every function on a services module (e.g. the exports of
 * wikipedia.js or dataSources.js) with cacheThrough(), so callers
 * don't need to change at all.
 */
function wrapModule(moduleExports, sourcePrefix) {
    const wrapped = {};
    for (const [name, fn] of Object.entries(moduleExports)) {
        wrapped[name] =
            typeof fn === "function"
                ? cacheThrough(`${sourcePrefix}.${name}`, fn)
                : fn;
    }
    return wrapped;
}

/* ============================================================
   BROWSE / SEARCH THE OFFLINE LIBRARY
============================================================ */

function searchLibrary(query, limit = 20) {
    const q = normalizeKey(query);

    const all = Object.entries(index.entries)
        .filter(([id]) => !id.startsWith("img_"))
        .map(([id, meta]) => ({ id, ...meta }));

    if (!q) {
        return all
            .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
            .slice(0, limit);
    }

    return all
        .filter(
            (entry) =>
                (entry.title && entry.title.toLowerCase().includes(q)) ||
                (entry.snippet && entry.snippet.toLowerCase().includes(q)) ||
                (entry.key && entry.key.toLowerCase().includes(q))
        )
        .slice(0, limit);
}

function stats() {
    const entries = Object.values(index.entries);
    const images = entries.filter((e) => e.type === "image");
    const text = entries.filter((e) => e.type !== "image");

    let bytes = 0;
    try {
        for (const dir of [DATA_DIR, IMAGES_DIR]) {
            for (const file of fs.readdirSync(dir)) {
                bytes += fs.statSync(path.join(dir, file)).size;
            }
        }
    } catch (error) {
        // ignore
    }

    return {
        success: true,
        totalEntries: entries.length,
        textEntries: text.length,
        imageEntries: images.length,
        approxSizeBytes: bytes,
        root: ROOT_DIR
    };
}

function clearCache() {
    try {
        for (const dir of [DATA_DIR, IMAGES_DIR]) {
            for (const file of fs.readdirSync(dir)) {
                fs.unlinkSync(path.join(dir, file));
            }
        }
        index = { entries: {} };
        saveIndex();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

/* ============================================================
   STRUCTURED LOCAL KNOWLEDGE STORE
   Uses the SAME jarvis_offline_cache/index.json + data directory
   as the existing offline knowledge cache. No second database.
============================================================ */

function saveKnowledge(record = {}) {
    if (!DATA_DIR || !record.topic || !record.content || !record.id) return false;

    const id = String(record.id);
    const file = path.join(DATA_DIR, `knowledge_${id}.json`);

    try {
        fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
        index.entries[`knowledge_${id}`] = {
            key: `knowledge:${normalizeKey(record.topic)}`,
            type: "structured-knowledge",
            topic: String(record.topic),
            category: String(record.category || "General knowledge"),
            source: String(record.source || "unknown"),
            sourceUrl: record.sourceUrl || null,
            title: String(record.topic),
            snippet: String(record.content).slice(0, 500),
            savedAt: record.timestamp || new Date().toISOString(),
            verified: !!record.verified,
            confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : null,
            file: path.basename(file)
        };
        return saveIndex();
    } catch (_) {
        return false;
    }
}

function readKnowledgeById(id) {
    if (!DATA_DIR || !id) return null;
    const key = `knowledge_${id}`;
    const meta = index.entries[key];
    if (!meta) return null;
    const file = path.join(DATA_DIR, meta.file || `${key}.json`);
    try {
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (_) {
        return null;
    }
}

function findKnowledge(topic = "", contentId = "", content = "", source = "") {
    const normalizedTopic = normalizeKey(topic);
    const targetHash = String(contentId || "");
    const targetContent = normalizeKey(content);
    const normalizedSource = normalizeKey(source);

    for (const [key, meta] of Object.entries(index.entries)) {
        if (!key.startsWith("knowledge_")) continue;
        if (targetHash && key === `knowledge_${targetHash}`) return readKnowledgeById(targetHash);

        if (normalizedTopic && normalizeKey(meta.topic || "") === normalizedTopic) {
            if (normalizedSource && normalizeKey(meta.source || "") !== normalizedSource) continue;
            const existing = readKnowledgeById(key.slice("knowledge_".length));
            if (!existing) continue;
            if (!targetContent || normalizeKey(existing.content) === targetContent) return existing;
        }
    }
    return null;
}

/**
 * Insert-or-update one structured knowledge record without allowing
 * repeated polling to create an unbounded set of records for the same
 * topic/source. Returns an explicit action so callers can emit truthful
 * telemetry.
 */
function upsertKnowledge(record = {}) {
    if (!DATA_DIR || !record.topic || !record.content) {
        return { success: false, action: "rejected", error: "topic and content are required." };
    }

    const normalizedTopic = normalizeKey(record.topic);
    const normalizedSource = normalizeKey(record.source || "");
    let existing = null;
    let existingId = null;

    for (const [key, meta] of Object.entries(index.entries)) {
        if (!key.startsWith("knowledge_")) continue;
        if (normalizeKey(meta.topic || "") !== normalizedTopic) continue;
        if (normalizedSource && normalizeKey(meta.source || "") !== normalizedSource) continue;
        const candidateId = key.slice("knowledge_".length);
        const candidate = readKnowledgeById(candidateId);
        if (candidate) {
            existing = candidate;
            existingId = candidateId;
            break;
        }
    }

    if (existing && normalizeKey(existing.content) === normalizeKey(record.content)) {
        return { success: true, action: "duplicate", record: existing };
    }

    const next = { ...record, id: existingId || String(record.id || hashKey(`${record.topic}:${record.content}`)) };
    const file = path.join(DATA_DIR, `knowledge_${next.id}.json`);

    try {
        fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
        index.entries[`knowledge_${next.id}`] = {
            key: `knowledge:${normalizeKey(next.topic)}`,
            type: "structured-knowledge",
            topic: String(next.topic),
            category: String(next.category || "General knowledge"),
            source: String(next.source || "unknown"),
            sourceUrl: next.sourceUrl || null,
            title: String(next.topic),
            snippet: String(next.content).slice(0, 500),
            savedAt: next.timestamp || new Date().toISOString(),
            verified: !!next.verified,
            confidence: Number.isFinite(Number(next.confidence)) ? Number(next.confidence) : null,
            file: path.basename(file)
        };

        if (!saveIndex()) {
            return { success: false, action: "error", error: "Failed to persist knowledge index." };
        }

        return {
            success: true,
            action: existing ? "updated" : "saved",
            record: next,
            previous: existing || null
        };
    } catch (error) {
        return { success: false, action: "error", error: error.message || String(error) };
    }
}

function searchKnowledge(query = "", limit = 20) {
    const q = normalizeKey(query);
    const rows = [];

    for (const [key, meta] of Object.entries(index.entries)) {
        if (!key.startsWith("knowledge_")) continue;
        if (q && !(
            normalizeKey(meta.topic).includes(q) ||
            normalizeKey(meta.category).includes(q) ||
            normalizeKey(meta.source).includes(q) ||
            normalizeKey(meta.snippet).includes(q)
        )) continue;

        const record = readKnowledgeById(key.slice("knowledge_".length));
        if (record) rows.push(record);
    }

    return rows
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, Math.max(1, Number(limit) || 20));
}

function recentKnowledge(limit = 20) {
    return searchKnowledge("", limit);
}

function knowledgeStats() {
    const rows = [];
    for (const [key, meta] of Object.entries(index.entries)) {
        if (key.startsWith("knowledge_")) rows.push(meta);
    }
    const sources = new Set(rows.map(r => r.source).filter(Boolean));
    const topics = new Set(rows.map(r => r.topic).filter(Boolean));
    return {
        success: true,
        knowledgeItems: rows.length,
        sourcesUsed: sources.size,
        topicsLearned: topics.size,
        verifiedItems: rows.filter(r => r.verified).length,
        storage: "jarvis_offline_cache"
    };
}

function findRelevantKnowledge(query = "", limit = 3) {
    const q = normalizeKey(query);
    if (!q) return [];

    const stop = new Set([
        "the","a","an","is","are","was","were","to","of","and","in","on","for",
        "kya","hai","hain","ka","ki","ke","ko","se","ye","yeh","wo","woh","mein",
        "me","aur","batao","bata","where","what","who","when","how","tell"
    ]);
    const tokens = q.split(/\s+/).filter(x => x.length > 2 && !stop.has(x));

    return recentKnowledge(1000)
        .map(record => {
            const topicTokens = normalizeKey(record.topic).split(/\s+/).filter(Boolean);
            const contentTokens = normalizeKey(record.content).split(/\s+/).filter(Boolean).slice(0, 400);
            const topicSet = new Set(topicTokens);
            const contentSet = new Set(contentTokens);
            let score = 0;
            for (const token of tokens) {
                if (topicSet.has(token)) score += 4;
                else if (contentSet.has(token)) score += 1;
            }
            if (q.includes(normalizeKey(record.topic))) score += 8;
            return { record, score };
        })
        .filter(x => x.score >= 3)
        .sort((a,b) => b.score - a.score)
        .slice(0, Math.max(1, Number(limit) || 3))
        .map(x => x.record);
}

module.exports = {
    setNetworkFetch,
    init,
    setOfflineOnly(enabled = true) { offlineOnly = Boolean(enabled); return offlineOnly; },
    isOfflineOnly() { return offlineOnly; },
    isOnline,
    setText,
    getText,
    hasText,
    cacheImage,
    cacheImagesInResult,
    cacheThrough,
    wrapModule,
    searchLibrary,
    stats,
    clearCache,
    saveKnowledge,
    upsertKnowledge,
    findKnowledge,
    searchKnowledge,
    recentKnowledge,
    knowledgeStats,
    findRelevantKnowledge
};
