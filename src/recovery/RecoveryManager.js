"use strict";

const fs = require("node:fs");
const path = require("node:path");

class RecoveryManager {
    constructor(options = {}) {
        this.maxBackupBytes = Number.isFinite(options.maxBackupBytes) ? options.maxBackupBytes : 5 * 1024 * 1024;
        this.maxBackups = Number.isFinite(options.maxBackups) ? options.maxBackups : 3;
    }

    readJson(filePath, fallback) {
        try {
            const raw = fs.readFileSync(filePath, "utf8");
            if (Buffer.byteLength(raw, "utf8") > this.maxBackupBytes) return { ok: false, recovered: false, value: fallback, error: "state_too_large" };
            return { ok: true, recovered: false, value: JSON.parse(raw), error: null };
        } catch (error) {
            if (error && error.code === "ENOENT") return { ok: true, recovered: false, value: fallback, error: null };
            return { ok: false, recovered: true, value: fallback, error: "invalid_json" };
        }
    }

    backupCorruptFile(filePath) {
        if (!fs.existsSync(filePath)) return { success: false, reason: "missing" };
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backup = `${filePath}.corrupt-${stamp}`;
        fs.copyFileSync(filePath, backup);
        this.pruneBackups(filePath);
        return { success: true, backup };
    }

    pruneBackups(filePath) {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath) + ".corrupt-";
        const matches = fs.readdirSync(dir).filter(name => name.startsWith(base)).sort().reverse();
        for (const name of matches.slice(this.maxBackups)) {
            try { fs.unlinkSync(path.join(dir, name)); } catch (_) {}
        }
    }

    repairJson(filePath, fallback) {
        const result = this.readJson(filePath, fallback);
        if (!result.recovered) return result;
        let backup = null;
        try { backup = this.backupCorruptFile(filePath); } catch (_) {}
        return { ...result, backup };
    }
}

module.exports = { RecoveryManager };
