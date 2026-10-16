"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

function createPCDoctor({ userDataPath, homePath }) {
    const cacheRoot = path.join(userDataPath, "pc-doctor-safe-cache");
    let lastReport = null;

    const issue = (id, severity, title, detail, fix) => ({ id, severity, title, detail, fix });

    async function scan() {
        const total = os.totalmem();
        const free = os.freemem();
        const memoryPercent = total ? Math.round(((total - free) / total) * 100) : null;
        const report = {
            success: true,
            offline: true,
            generatedAt: new Date().toISOString(),
            platform: process.platform,
            checks: [],
            issues: [],
            safeFixes: [],
            summary: "System looks healthy."
        };
        report.checks.push({ id: "runtime", label: "JARVIS runtime", state: "pass", detail: "Local diagnostic engine is running." });
        report.checks.push({ id: "memory", label: "Memory pressure", state: memoryPercent !== null && memoryPercent >= 90 ? "warn" : "pass", detail: memoryPercent === null ? "Memory telemetry unavailable." : `${memoryPercent}% memory in use.` });
        if (memoryPercent !== null && memoryPercent >= 90) {
            report.issues.push(issue("memory-pressure", "medium", "High memory usage", `The computer is using about ${memoryPercent}% of available memory.`, "Close unused apps, then run the scan again."));
        }
        try {
            const stat = await fs.promises.statfs(homePath);
            const totalBytes = stat.blocks * stat.bsize;
            const freeBytes = stat.bfree * stat.bsize;
            const usedPercent = totalBytes ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : null;
            report.checks.push({ id: "storage", label: "Storage", state: usedPercent !== null && usedPercent >= 92 ? "warn" : "pass", detail: usedPercent === null ? "Storage telemetry unavailable." : `${usedPercent}% used; ${Math.round(freeBytes / 1024 ** 3)} GB free.` });
            if (usedPercent !== null && usedPercent >= 92) report.issues.push(issue("storage-pressure", "medium", "Low free storage", "The system drive is nearly full.", "Review large files and remove only items you explicitly approve."));
        } catch (_) {
            report.checks.push({ id: "storage", label: "Storage", state: "warn", detail: "Storage telemetry unavailable." });
        }
        let cacheBytes = 0;
        try {
            const entries = await fs.promises.readdir(cacheRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                try { cacheBytes += (await fs.promises.stat(path.join(cacheRoot, entry.name))).size; } catch (_) { /* ignore unreadable cache item */ }
            }
        } catch (_) { /* cache may not exist */ }
        report.checks.push({ id: "jarvis-cache", label: "JARVIS temporary cache", state: cacheBytes > 50 * 1024 * 1024 ? "warn" : "pass", detail: `${Math.round(cacheBytes / 1024 / 1024)} MB of app-owned temporary data.` });
        if (cacheBytes > 50 * 1024 * 1024) {
            report.issues.push(issue("jarvis-cache", "low", "JARVIS temporary cache is large", "Only app-owned temporary data is included in this finding.", "Clear the JARVIS temporary cache after approval."));
            report.safeFixes.push({ id: "clear-jarvis-cache", label: "Clear JARVIS temporary cache", risk: "low", requiresApproval: true, scope: cacheRoot });
        }
        if (report.issues.length) report.summary = `${report.issues.length} issue(s) found. Safe fixes are listed separately.`;
        lastReport = report;
        return report;
    }

    async function apply(fixIds, approved) {
        if (approved !== true) return { success: false, requiresApproval: true, error: "Explicit approval is required before applying a PC Doctor fix." };
        if (!Array.isArray(fixIds) || !lastReport) return { success: false, error: "Run an offline PC Doctor scan first." };
        const allowed = new Set(lastReport.safeFixes.map(fix => fix.id));
        const results = [];
        for (const id of fixIds.slice(0, 10)) {
            if (!allowed.has(id)) { results.push({ id, success: false, error: "Fix is not part of the latest verified report." }); continue; }
            if (id === "clear-jarvis-cache") {
                try {
                    await fs.promises.mkdir(cacheRoot, { recursive: true });
                    for (const name of await fs.promises.readdir(cacheRoot)) {
                        const target = path.join(cacheRoot, name);
                        const stat = await fs.promises.lstat(target);
                        if (stat.isFile()) await fs.promises.unlink(target);
                    }
                    results.push({ id, success: true, detail: "JARVIS-owned temporary cache cleared." });
                } catch (error) { results.push({ id, success: false, error: error.message }); }
            }
        }
        return { success: results.every(item => item.success), results, appliedAt: new Date().toISOString() };
    }

    return Object.freeze({ scan, apply, getLastReport: () => lastReport });
}

module.exports = { createPCDoctor };
