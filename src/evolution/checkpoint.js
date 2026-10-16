"use strict";

/**
 * ============================================================
 * JARVIS EVOLUTION CHECKPOINT
 * ============================================================
 *
 * Phase 3 of the Persistent Self-Improvement / Background
 * Evolution System (see PHASE1_ARCHITECTURE_AUDIT.md and
 * src/evolution/goalRegistry.js from Phase 2).
 *
 * This module owns ONE resumable checkpoint describing where the
 * (future) Background Evolution Engine currently stands:
 *
 *   currentGoal   -> a goalId from the Phase 2 Final Goal Registry,
 *                    or null if nothing is currently selected
 *   currentPhase  -> reuses goalRegistry.STATUSES (RESEARCHING,
 *                    ANALYZING, ...) instead of inventing a second,
 *                    parallel phase enum
 *   progress      -> 0-100
 *   nextAction    -> free-text description of what to do next
 *   status        -> engine-level run state (IDLE/ACTIVE/PAUSED/
 *                    STOPPED) — deliberately separate from
 *                    currentPhase, which describes goal progress,
 *                    not whether the engine itself is running
 *
 * Same shape as goalRegistry.js: a plain singleton module
 * (init/persist/read/write functions), one JSON file on disk, no
 * electron-store, no database, atomic-ish write via temp file +
 * rename, and the same corrupt-file-backup convention.
 *
 * Storage: src/database/evolution/checkpoint.json
 *
 * Guarantees this module must uphold (per the project brief):
 *   - First run creates one valid, minimal checkpoint.
 *   - Reloading an existing, valid checkpoint file restores it
 *     EXACTLY — it is never reset just because JARVIS restarted.
 *   - Updates are validated (progress range, known engine status,
 *     known phase, and — when the Final Goal Registry has been
 *     initialized — a known goalId) before anything is written.
 *   - A corrupt/unreadable file is preserved as a timestamped
 *     backup (never silently deleted) and a fresh checkpoint is
 *     seeded in its place, matching goalRegistry.js's behavior.
 *   - Saving is atomic-ish (write to a temp file, then rename)
 *     so a crash mid-write cannot leave a half-written, unreadable
 *     checkpoint.json as the active file.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("../utils/atomicJson");

const goalRegistry = require("./goalRegistry");

const SCHEMA_VERSION = 1;

/**
 * Engine-level run state. Distinct from currentPhase (which
 * reuses goalRegistry.STATUSES to describe progress on the
 * currently selected goal).
 */
const ENGINE_STATUSES = ["IDLE", "ACTIVE", "PAUSED", "STOPPED"];

let FILE_PATH = null;
let checkpoint = null; // the single active checkpoint object
let checkpointCounter = 0; // seeds/continues the human-readable checkpointId sequence

/* ============================================================
   HELPERS
============================================================ */

function nowIso() {
    return new Date().toISOString();
}

function seedCounterFromId(id) {
    const match = typeof id === "string" && id.match(/-(\d+)$/);
    if (match) {
        const n = parseInt(match[1], 10);
        if (!Number.isNaN(n) && n > checkpointCounter) {
            checkpointCounter = n;
        }
    }
}

/**
 * Human-readable, monotonically increasing checkpoint id, e.g.
 * "EV-2026-09-14-00123" (matches the format used in the project
 * brief's worked example). The counter is seeded from whatever ID
 * was already on disk when this module was init()'d, so ids keep
 * increasing across restarts within the same day rather than
 * resetting to 1.
 */
function generateCheckpointId() {
    checkpointCounter += 1;
    const datePart = new Date().toISOString().slice(0, 10);
    const seq = String(checkpointCounter).padStart(5, "0");
    return `EV-${datePart}-${seq}`;
}

function defaultCheckpoint() {
    const timestamp = nowIso();
    return {
        version: SCHEMA_VERSION,
        checkpointId: generateCheckpointId(),
        currentGoal: null,
        currentPhase: "NOT_STARTED",
        progress: 0,
        nextAction: "Select the first goal to work on.",
        status: "IDLE",
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function isValidCheckpointShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.version === "number" &&
        typeof obj.checkpointId === "string" &&
        (obj.currentGoal === null || typeof obj.currentGoal === "string") &&
        typeof obj.currentPhase === "string" &&
        typeof obj.progress === "number" &&
        typeof obj.nextAction === "string" &&
        typeof obj.status === "string" &&
        typeof obj.createdAt === "string" &&
        typeof obj.updatedAt === "string"
    );
}

function backupCorruptFile() {
    try {
        if (fs.existsSync(FILE_PATH)) {
            const backupPath = `${FILE_PATH}.corrupt-${Date.now()}.bak`;
            fs.copyFileSync(FILE_PATH, backupPath);
            return backupPath;
        }
    } catch (error) {
        // If we can't even back it up, fall through — we still must
        // not crash JARVIS startup over a corrupt checkpoint file.
    }
    return null;
}

/**
 * Atomic-ish write: write to a temp file in the same directory,
 * then rename over the real file. A crash mid-write leaves either
 * the previous valid file or the new valid temp file, never a
 * half-written checkpoint.json.
 */
function persist() {
    if (!FILE_PATH || !checkpoint) return false;

    try {
        checkpoint.updatedAt = nowIso();
        writeJsonAtomic(FILE_PATH, checkpoint);
        return true;
    } catch (error) {
        return false;
    }
}

/* ============================================================
   INIT
============================================================ */

/**
 * Loads (or seeds) the checkpoint at the given absolute file
 * path. Safe to call multiple times; each call fully re-points
 * this module at storagePath and reloads from disk — the same
 * init(storagePath) pattern goalRegistry.js uses.
 */
function init(storagePath) {
    if (!storagePath) {
        throw new TypeError("checkpoint.init() requires a storagePath.");
    }

    FILE_PATH = storagePath;
    checkpointCounter = 0;

    try {
        fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    } catch (error) {
        // Non-fatal here; the writeFileSync below will surface any
        // real filesystem problem.
    }

    if (!fs.existsSync(FILE_PATH)) {
        checkpoint = defaultCheckpoint();
        persist();
        return {
            success: true,
            created: true,
            file: FILE_PATH,
            checkpoint: { ...checkpoint }
        };
    }

    try {
        const raw = fs.readFileSync(FILE_PATH, "utf8");
        const parsed = JSON.parse(raw);

        if (!isValidCheckpointShape(parsed)) {
            throw new Error("checkpoint.json exists but does not match the expected shape.");
        }

        // Restore EXACTLY as-is — never reset just because JARVIS restarted.
        checkpoint = parsed;
        seedCounterFromId(checkpoint.checkpointId);

        return {
            success: true,
            created: false,
            file: FILE_PATH,
            checkpoint: { ...checkpoint }
        };
    } catch (error) {
        const corruptBackup = backupCorruptFile();
        checkpoint = defaultCheckpoint();
        persist();

        return {
            success: true,
            created: true,
            recovered: true,
            corruptBackup,
            file: FILE_PATH,
            checkpoint: { ...checkpoint },
            warning: `Existing checkpoint.json was invalid/corrupt (${error.message}); ` +
                (corruptBackup
                    ? `it was preserved at ${corruptBackup} and a fresh checkpoint was seeded.`
                    : "it could not be backed up, so a fresh checkpoint was seeded.")
        };
    }
}

/* ============================================================
   READ API
============================================================ */

function ensureLoaded() {
    if (!checkpoint) {
        throw new Error("checkpoint.init(storagePath) must be called before use.");
    }
}

function getCheckpoint() {
    ensureLoaded();
    return { ...checkpoint };
}

/* ============================================================
   VALIDATION
============================================================ */

/**
 * Returns an error message string if `updates` is invalid, or
 * null if it is acceptable to apply. Validates:
 *   - progress: number in [0, 100]
 *   - status: one of ENGINE_STATUSES
 *   - currentPhase: one of goalRegistry.STATUSES (reused, not
 *     duplicated)
 *   - currentGoal: null, or a string goalId that exists in the
 *     Final Goal Registry (Phase 2 compatibility). If the goal
 *     registry has not been initialized in this process, that
 *     specific check is skipped rather than throwing, so this
 *     module stays independently usable/testable.
 */
function validateUpdates(updates) {
    if (Object.prototype.hasOwnProperty.call(updates, "progress")) {
        const { progress } = updates;
        if (typeof progress !== "number" || Number.isNaN(progress) || progress < 0 || progress > 100) {
            return `Invalid progress value: ${progress}. Must be a number between 0 and 100.`;
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "status")) {
        if (!ENGINE_STATUSES.includes(updates.status)) {
            return `Invalid engine status: ${updates.status}. Must be one of ${ENGINE_STATUSES.join(", ")}.`;
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "currentPhase")) {
        if (!goalRegistry.STATUSES.includes(updates.currentPhase)) {
            return `Invalid phase: ${updates.currentPhase}. Must be one of the known goal statuses.`;
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "currentGoal") && updates.currentGoal !== null) {
        if (typeof updates.currentGoal !== "string") {
            return "currentGoal must be a string goalId or null.";
        }

        let goalExists = true;
        try {
            goalExists = Boolean(goalRegistry.getById(updates.currentGoal));
        } catch (error) {
            // Goal registry not initialized in this process yet — we
            // can't validate against it, so don't block the update.
            goalExists = true;
        }

        if (!goalExists) {
            return `Unknown goalId: ${updates.currentGoal}. currentGoal must match an existing Final Goal Registry entry.`;
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "nextAction") && typeof updates.nextAction !== "string") {
        return "nextAction must be a string.";
    }

    return null;
}

/* ============================================================
   WRITE API
============================================================ */

const UPDATABLE_FIELDS = ["currentGoal", "currentPhase", "progress", "nextAction", "status"];

/**
 * Applies a partial update to the checkpoint and persists it.
 * Validates first; on validation failure nothing is changed and
 * nothing is written to disk. On success, a new checkpointId is
 * stamped (each successful update is its own checkpoint) and the
 * whole thing is atomically saved.
 */
function updateCheckpoint(updates = {}) {
    ensureLoaded();

    const validationError = validateUpdates(updates);
    if (validationError) {
        return { success: false, error: validationError };
    }

    for (const field of UPDATABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
            checkpoint[field] = updates[field];
        }
    }

    checkpoint.checkpointId = generateCheckpointId();
    const persisted = persist();

    return { success: persisted, checkpoint: { ...checkpoint } };
}

/**
 * Explicitly discards the current checkpoint and starts a fresh
 * one. This is a deliberate, user/operator-triggered action (e.g.
 * "start evolution over") — it is NEVER called automatically on
 * startup or on load. Startup/load always preserves existing
 * state; only this function resets it.
 */
function resetCheckpoint() {
    ensureLoaded();
    checkpoint = defaultCheckpoint();
    const persisted = persist();
    return { success: persisted, checkpoint: { ...checkpoint } };
}

module.exports = {
    init,
    getCheckpoint,
    updateCheckpoint,
    resetCheckpoint,
    ENGINE_STATUSES
};
