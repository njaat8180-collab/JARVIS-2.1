"use strict";

/**
 * Small, dependency-free JSON persistence helper for the main process.
 *
 * The normal path is write-to-sibling-temp then rename, which prevents a
 * process crash from leaving a truncated JSON document. Windows can reject
 * replacing an existing file with rename() (EPERM/EEXIST/EBUSY), especially
 * when a scanner briefly has the target open. In that case we fall back to a
 * complete copy of the finished temp file and always remove the temp file.
 * The fallback is not atomic, but it is preferable to silently losing user
 * memory or task state; callers still receive false/throw on a real failure.
 */

const fs = require("fs");
const path = require("path");

const REPLACE_RETRYABLE = new Set(["EPERM", "EEXIST", "EBUSY", "ENOTEMPTY"]);

function sleep(ms) {
    if (!ms) return;
    const end = Date.now() + ms;
    while (Date.now() < end) { /* short bounded filesystem retry */ }
}

function replaceFile(tempPath, targetPath, { retries = 2, retryDelayMs = 12 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            fs.renameSync(tempPath, targetPath);
            return { atomic: true, fallback: false };
        } catch (error) {
            lastError = error;
            if (!REPLACE_RETRYABLE.has(error?.code) || attempt >= retries) break;
            sleep(retryDelayMs * (attempt + 1));
        }
    }

    // Only copy a fully-written temp file. Never delete the old target first:
    // copyFileSync replaces it in one filesystem operation where supported,
    // and leaves the old file intact if the copy cannot start.
    try {
        fs.copyFileSync(tempPath, targetPath);
        fs.unlinkSync(tempPath);
        return { atomic: false, fallback: true, originalError: lastError };
    } catch (fallbackError) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) { /* best effort */ }
        fallbackError.cause = lastError;
        throw fallbackError;
    }
}

function writeJsonAtomic(filePath, value, options = {}) {
    const targetPath = path.resolve(filePath);
    const parent = path.dirname(targetPath);
    fs.mkdirSync(parent, { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    try {
        fs.writeFileSync(tempPath, payload, { encoding: "utf8", mode: options.mode ?? 0o600 });
        return replaceFile(tempPath, targetPath, options);
    } catch (error) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) { /* best effort */ }
        throw error;
    }
}

module.exports = { writeJsonAtomic, replaceFile };
