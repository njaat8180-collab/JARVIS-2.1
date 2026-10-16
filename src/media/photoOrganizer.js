"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);

function normalizePath(value) { return path.resolve(String(value || "")); }
function isInside(target, root) {
    const relative = path.relative(root, target);
    return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function listImages(root, maxFiles = 5000, excludedRoots = []) {
    const results = [];
    async function visit(directory) {
        if (results.length >= maxFiles) return;
        let entries;
        try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); } catch (_) { return; }
        for (const entry of entries) {
            if (results.length >= maxFiles) break;
            const full = path.join(directory, entry.name);
            if (excludedRoots.some(excluded => isInside(full, excluded))) continue;
            if (entry.isDirectory()) { await visit(full); continue; }
            if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) results.push(full);
        }
    }
    await visit(root);
    return results;
}

async function imageHash(filePath) {
    const { data } = await sharp(filePath, { failOn: "none" }).resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let total = 0;
    for (const value of data) total += value;
    const average = total / Math.max(1, data.length);
    return Array.from(data, value => value >= average ? "1" : "0").join("");
}

async function imageSignature(filePath) {
    const { data, info } = await sharp(filePath, { failOn: "none" })
        .resize(32, 32, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const luminance = [];
    const colors = [0, 0, 0];
    for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        colors[0] += r; colors[1] += g; colors[2] += b;
        luminance.push((0.299 * r) + (0.587 * g) + (0.114 * b));
    }
    const average = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
    const averageHash = luminance.map(value => value >= average ? "1" : "0").join("");
    let differenceHash = "";
    for (let row = 0; row < 32; row++) {
        for (let column = 0; column < 31; column++) {
            differenceHash += luminance[(row * 32) + column] <= luminance[(row * 32) + column + 1] ? "1" : "0";
        }
    }
    const pixels = Math.max(1, luminance.length);
    return { averageHash, differenceHash, color: colors.map(value => value / pixels) };
}

function similarity(left, right) {
    let same = 0;
    for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] === right[i]) same++;
    return same / Math.max(left.length, right.length, 1);
}

function signatureSimilarity(left, right) {
    const averageScore = similarity(left.averageHash, right.averageHash);
    const differenceScore = similarity(left.differenceHash, right.differenceHash);
    const colorDistance = Math.sqrt(left.color.reduce((sum, value, index) => sum + Math.pow(value - right.color[index], 2), 0));
    const colorScore = Math.max(0, 1 - (colorDistance / 441.67295593));
    return (averageScore * 0.45) + (differenceScore * 0.35) + (colorScore * 0.20);
}

function createPhotoOrganizer({ allowedRoots = [] } = {}) {
    const roots = allowedRoots.map(normalizePath).filter(Boolean);
    function allowed(target) { return roots.some(root => isInside(target, root)); }

    async function preview({ referencePath, searchRoot, destinationFolder = "", threshold = 0.86, maxFiles = 5000 } = {}) {
        const reference = normalizePath(referencePath);
        const root = normalizePath(searchRoot || path.dirname(reference));
        if (!allowed(reference) || !allowed(root)) return { success: false, error: "Photo matching is limited to an approved Pictures or user-selected folder." };
        if (!isInside(reference, root)) return { success: false, error: "The reference photo must be inside the selected search folder." };
        const referenceHash = await imageSignature(reference);
        const destination = destinationFolder ? normalizePath(destinationFolder) : "";
        if (destination && !allowed(destination)) return { success: false, error: "The destination must be inside an approved user folder." };
        const candidates = await listImages(root, Math.min(10000, Math.max(1, Number(maxFiles) || 5000)), destination ? [destination] : []);
        const matches = [];
        for (const file of candidates) {
            try {
                const score = signatureSimilarity(referenceHash, await imageSignature(file));
                if (score >= Math.min(0.99, Math.max(0.5, Number(threshold) || 0.86))) matches.push({ path: file, score: Number(score.toFixed(3)), confidence: score >= 0.94 ? "high" : score >= 0.88 ? "medium" : "review" });
            } catch (_) { /* skip unreadable images */ }
        }
        matches.sort((a, b) => b.score - a.score);
        return { success: true, reference, searchRoot: root, count: matches.length, matches, threshold: Number(threshold) || 0.86, method: "local-multi-signal-perceptual-similarity", identityInference: false, originalsPreserved: true };
    }

    async function organize({ referencePath, searchRoot, destinationFolder, threshold, maxFiles, approved = false } = {}) {
        const previewResult = await preview({ referencePath, searchRoot, destinationFolder, threshold, maxFiles });
        if (!previewResult.success) return previewResult;
        const destination = normalizePath(destinationFolder);
        if (!allowed(destination)) return { success: false, error: "The destination must be inside an approved user folder." };
        if (!approved) return { success: false, code: "APPROVAL_REQUIRED", approvalRequired: true, preview: previewResult };
        await fs.promises.mkdir(destination, { recursive: true });
        const copied = [];
        const skipped = [];
        for (const item of previewResult.matches) {
            const target = path.join(destination, path.basename(item.path));
            if (normalizePath(item.path) === target) continue;
            try { await fs.promises.copyFile(item.path, target, fs.constants.COPYFILE_EXCL); copied.push({ source: item.path, destination: target, score: item.score }); } catch (_) { skipped.push({ source: item.path, reason: "destination already exists or file became unavailable" }); }
        }
        return { success: true, copiedCount: copied.length, skippedCount: skipped.length, copied, skipped, originalsPreserved: true, destination };
    }

    return Object.freeze({ preview, organize });
}

module.exports = { createPhotoOrganizer, similarity, signatureSimilarity };
