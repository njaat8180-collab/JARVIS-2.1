"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MANIFEST = "index.json";

function normalizeTopic(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/\b(?:create|make|build|generate|a|an|the|ppt|pptx|presentation|on|about|of|for|please|jarvis)\b/gi, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 180);
}

function targetId(target) {
    if (target?.kind === "cover") return "cover";
    const cue = normalizeTopic(target?.visualCue || target?.query || "");
    const fingerprint = cue ? crypto.createHash("sha1").update(cue).digest("hex").slice(0, 10) : "default";
    return `slide-${Math.max(0, Number(target?.index) || 0)}-${fingerprint}`;
}

function searchWords(value) {
    return new Set(normalizeTopic(value).split(" ").filter(word => word.length >= 3));
}

function cachedImageMatchesTarget(entry, target) {
    const topicTerms = new Set((Array.isArray(target?.topicTokens) ? target.topicTokens : []).map(value => String(value).toLowerCase()));
    const cueTerms = searchWords(target?.visualCue || target?.query);
    const sceneTerms = [...cueTerms].filter(word => !topicTerms.has(word) && !new Set(["image", "photo", "picture", "screenshot", "official", "real", "authentic", "visual"]).has(word));
    if (!sceneTerms.length) return true;
    const imageTerms = searchWords([entry?.imageTitle, entry?.imageSourceUrl].join(" "));
    return sceneTerms.some(word => imageTerms.has(word));
}

function readManifest(cacheDir) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(cacheDir, MANIFEST), "utf8"));
        if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") return parsed;
    } catch (_) { /* Empty or older cache: start a fresh index. */ }
    return { version: 1, entries: {} };
}

function validLocalImage(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size < 3000 || stat.size > 12 * 1024 * 1024) return false;
        const fd = fs.openSync(filePath, "r");
        const head = Buffer.alloc(8);
        try { fs.readSync(fd, head, 0, head.length, 0); }
        finally { fs.closeSync(fd); }
        const ext = path.extname(filePath).toLowerCase();
        return ((ext === ".jpg" || ext === ".jpeg") && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
            (ext === ".png" && head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
            (ext === ".gif" && head.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/));
    } catch (_) { return false; }
}

function getCachedPresentationImages(cacheDir, topic, targets) {
    const topicKey = normalizeTopic(topic);
    if (!topicKey) return [];
    const manifest = readManifest(cacheDir);
    const root = path.resolve(cacheDir);
    const usedFiles = new Set();
    return (Array.isArray(targets) ? targets : []).map(target => {
        let entry = manifest.entries[`${topicKey}|${targetId(target)}`];
        // Reuse a previously saved visual for a closely related topic/slide
        // when an exact topic entry is not available. Older cache manifests
        // are supported by deriving search terms from the saved topic/title.
        if (!entry) {
            const topicTerms = searchWords(topic);
            const targetTerms = searchWords(target?.query);
            let best = null;
            for (const [key, candidate] of Object.entries(manifest.entries)) {
                const [savedTopic] = key.split("|");
                const searchable = searchWords([savedTopic, candidate.searchTerms, candidate.imageTitle].join(" "));
                const topicMatches = [...topicTerms].filter(word => searchable.has(word)).length;
                const targetMatches = [...targetTerms].filter(word => searchable.has(word)).length;
                if (topicTerms.size && topicMatches === 0) continue;
                if (targetTerms.size >= 2 && targetMatches < 2) continue;
                const score = topicMatches * 4 + targetMatches;
                if (!best || score > best.score) best = { entry: candidate, score };
            }
            entry = best?.entry || null;
        }
        if (!entry?.file || !cachedImageMatchesTarget(entry, target)) return null;
        const filePath = path.resolve(root, entry.file);
        const relative = path.relative(root, filePath);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || usedFiles.has(filePath) || !validLocalImage(filePath)) return null;
        usedFiles.add(filePath);
        return {
            target,
            imagePath: filePath,
            imageTitle: String(entry.imageTitle || topic).slice(0, 240),
            imageCredit: String(entry.imageCredit || "").slice(0, 500),
            imageAttribution: String(entry.imageAttribution || "").slice(0, 240),
            imageSourceUrl: String(entry.imageSourceUrl || "").slice(0, 500),
            fromImageCache: true
        };
    }).filter(Boolean);
}

function cachePresentationImage(cacheDir, topic, visual) {
    if (!visual?.target || !visual.imagePath || !validLocalImage(visual.imagePath)) return null;
    const topicKey = normalizeTopic(topic);
    if (!topicKey) return null;
    const ext = path.extname(visual.imagePath).toLowerCase();
    const imageExt = ext === ".png" || ext === ".gif" ? ext : ".jpg";
    const id = crypto.createHash("sha1").update(`${topicKey}|${targetId(visual.target)}|${visual.imagePath}`).digest("hex");
    const imageDir = path.join(cacheDir, "images");
    const destination = path.join(imageDir, `${id}${imageExt}`);
    try {
        fs.mkdirSync(imageDir, { recursive: true });
        if (!fs.existsSync(destination)) fs.copyFileSync(visual.imagePath, destination);
        const manifest = readManifest(cacheDir);
        manifest.entries[`${topicKey}|${targetId(visual.target)}`] = {
            file: path.relative(path.resolve(cacheDir), destination),
            imageTitle: String(visual.imageTitle || topic).slice(0, 240),
            searchTerms: normalizeTopic([topic, visual.target.query, visual.imageTitle].filter(Boolean).join(" ")).slice(0, 360),
            imageCredit: String(visual.imageCredit || "").slice(0, 500),
            imageAttribution: String(visual.imageAttribution || "").slice(0, 240),
            imageSourceUrl: String(visual.imageSourceUrl || "").slice(0, 500),
            savedAt: new Date().toISOString()
        };
        const manifestPath = path.join(cacheDir, MANIFEST);
        const temporaryPath = `${manifestPath}.tmp`;
        fs.writeFileSync(temporaryPath, JSON.stringify(manifest, null, 2), "utf8");
        fs.renameSync(temporaryPath, manifestPath);
        return { ...visual, imagePath: destination };
    } catch (error) {
        console.warn("[PRESENTATION] Could not persist a reusable image:", error?.message || error);
        return null;
    }
}

module.exports = { normalizeTopic, getCachedPresentationImages, cachePresentationImage };
