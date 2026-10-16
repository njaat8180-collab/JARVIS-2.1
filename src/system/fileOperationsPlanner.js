"use strict";

const fs = require("fs");
const path = require("path");

function normalize(value) { return path.resolve(String(value || "")); }
function inside(target, root) { const rel = path.relative(root, target); return rel === "" || (rel && !rel.startsWith("..") && !path.isAbsolute(rel)); }

function createFileOperationsPlanner({ metadataPath, allowedRoots = [] } = {}) {
    const roots = allowedRoots.map(normalize).filter(Boolean);
    const allowed = target => roots.some(root => inside(target, root));

    async function downloadsCleanup({ folder, preserveNames = ["minecraft launcher", "sklauncher"], approved = false } = {}) {
        const root = normalize(folder);
        if (!allowed(root)) return { success: false, error: "Cleanup is limited to an explicitly approved user folder." };
        const entries = await fs.promises.readdir(root, { withFileTypes: true });
        const preserved = [];
        const candidates = [];
        for (const entry of entries) {
            const full = path.join(root, entry.name);
            const keep = preserveNames.some(name => entry.name.toLowerCase().includes(String(name).toLowerCase()));
            (keep ? preserved : candidates).push({ path: full, name: entry.name, kind: entry.isDirectory() ? "folder" : "file" });
        }
        if (!approved) return { success: false, code: "APPROVAL_REQUIRED", approvalRequired: true, mode: "review-before-delete", folder: root, candidateCount: candidates.length, candidates, preserved };
        return { success: false, code: "SAFE_DELETE_NOT_EXECUTED", error: "Permanent bulk deletion is disabled. Move reviewed items to the Recycle Bin through an explicit user-approved action instead.", folder: root, candidateCount: candidates.length, candidates, preserved };
    }

    async function backupPlan({ source, destination } = {}) {
        const from = normalize(source); const to = normalize(destination);
        if (!allowed(from) || !allowed(to)) return { success: false, error: "Backup is limited to explicitly approved user folders or drives." };
        return { success: true, status: "PLAN_ONLY", source: from, destination: to, copyOnly: true, rollback: true, approvalRequired: true, message: "Backup plan prepared. No files were copied." };
    }

    async function labelPhoto({ photoPath, label } = {}) {
        const file = normalize(photoPath);
        if (!allowed(file) || !String(label || "").trim()) return { success: false, error: "A local approved photo and a non-empty label are required." };
        let records = {};
        try { records = JSON.parse(await fs.promises.readFile(metadataPath, "utf8")); } catch (_) {}
        records[file] = { label: String(label).trim().slice(0, 120), updatedAt: new Date().toISOString() };
        await fs.promises.mkdir(path.dirname(metadataPath), { recursive: true });
        await fs.promises.writeFile(metadataPath, JSON.stringify(records, null, 2), "utf8");
        return { success: true, photo: file, label: records[file].label, localOnly: true };
    }

    return Object.freeze({ downloadsCleanup, backupPlan, labelPhoto });
}

module.exports = { createFileOperationsPlanner };
