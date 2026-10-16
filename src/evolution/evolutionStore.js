"use strict";

/**
 * ============================================================
 * JARVIS EVOLUTION RECORD STORE
 * ============================================================
 *
 * Phase 4 of the Persistent Self-Improvement / Background
 * Evolution System (see PHASE1_ARCHITECTURE_AUDIT.md and the
 * Phase 2/3 modules this deliberately copies conventions from:
 * src/evolution/goalRegistry.js and src/evolution/checkpoint.js).
 *
 * This is NOT a new storage engine. It is a tiny factory that
 * produces one plain-JSON, atomic-write, corruption-recoverable
 * "list of records" file — the exact same read-whole-file /
 * mutate-in-memory / write-whole-file-back pattern Phase 2 and
 * Phase 3 already use — so EvolutionEngine.js can create its
 * three Phase 4 files (proposals.json, evolutionHistory.json,
 * failures.json) without duplicating that logic three times or
 * introducing electron-store/SQLite/any other mechanism.
 *
 * Shape on disk: { version, createdAt, updatedAt, records: [...] }
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("../utils/atomicJson");

const SCHEMA_VERSION = 1;

function nowIso() {
    return new Date().toISOString();
}

/**
 * @param {object} config
 * @param {string} config.label - short name used only in error/warning text.
 * @param {string} config.idField - property name that uniquely identifies a record (e.g. "proposalId").
 */
function createRecordStore({ label, idField }) {
    let FILE_PATH = null;
    let state = null; // { version, createdAt, updatedAt, records: [...] }

    function defaultState() {
        const timestamp = nowIso();
        return { version: SCHEMA_VERSION, createdAt: timestamp, updatedAt: timestamp, records: [] };
    }

    function isValidShape(obj) {
        return obj && typeof obj === "object" && Array.isArray(obj.records);
    }

    function backupCorruptFile() {
        try {
            if (fs.existsSync(FILE_PATH)) {
                const backupPath = `${FILE_PATH}.corrupt-${Date.now()}.bak`;
                fs.copyFileSync(FILE_PATH, backupPath);
                return backupPath;
            }
        } catch (error) {
            // Never let a backup failure crash the store — the caller still
            // must not lose the ability to keep running.
        }
        return null;
    }

    /**
     * Atomic-ish write: temp file in the same directory, then rename over
     * the real file — identical strategy to goalRegistry.js/checkpoint.js.
     */
    function persist() {
        if (!FILE_PATH || !state) return false;
        try {
            state.updatedAt = nowIso();
            writeJsonAtomic(FILE_PATH, state);
            return true;
        } catch (error) {
            return false;
        }
    }

    function init(storagePath) {
        if (!storagePath) {
            throw new TypeError(`${label}.init() requires a storagePath.`);
        }

        FILE_PATH = storagePath;

        try {
            fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
        } catch (error) {
            // Non-fatal; writeFileSync below surfaces any real FS problem.
        }

        if (!fs.existsSync(FILE_PATH)) {
            state = defaultState();
            persist();
            return { success: true, seeded: true, file: FILE_PATH, records: state.records.length };
        }

        try {
            const raw = fs.readFileSync(FILE_PATH, "utf8");
            const parsed = JSON.parse(raw);
            if (!isValidShape(parsed)) {
                throw new Error(`${label} file exists but does not match the expected shape.`);
            }
            state = parsed;
            return { success: true, seeded: false, file: FILE_PATH, records: state.records.length };
        } catch (error) {
            const corruptBackup = backupCorruptFile();
            state = defaultState();
            persist();
            return {
                success: true,
                seeded: true,
                recovered: true,
                corruptBackup,
                file: FILE_PATH,
                records: state.records.length,
                warning: `Existing ${label} file was invalid/corrupt (${error.message}); ` +
                    (corruptBackup
                        ? `it was preserved at ${corruptBackup} and a fresh file was seeded.`
                        : "it could not be backed up, so a fresh file was seeded.")
            };
        }
    }

    function ensureLoaded() {
        if (!state) throw new Error(`${label}.init(storagePath) must be called before use.`);
    }

    function getAll() {
        ensureLoaded();
        return state.records.slice();
    }

    function getById(id) {
        ensureLoaded();
        return state.records.find((r) => r[idField] === id) || null;
    }

    /** Appends a new record and persists. Refuses a duplicate id. */
    function add(record) {
        ensureLoaded();
        if (record && record[idField] && getById(record[idField])) {
            return { success: false, error: `Duplicate ${idField}: ${record[idField]}` };
        }
        state.records.push(record);
        const persisted = persist();
        return { success: persisted, record };
    }

    /** Partially updates an existing record (matched by idField) and persists. */
    function updateById(id, updates = {}) {
        ensureLoaded();
        const record = getById(id);
        if (!record) return { success: false, error: `Unknown ${idField}: ${id}` };
        Object.assign(record, updates);
        const persisted = persist();
        return { success: persisted, record };
    }

    return { init, getAll, getById, add, updateById };
}

module.exports = { createRecordStore };
