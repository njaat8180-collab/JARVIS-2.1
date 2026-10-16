"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT TASK STORE (Phase 6)
 * ============================================================
 *
 * Persistent, deterministic storage for AssistantOrchestrator
 * tasks. Deliberately follows the exact same conventions as
 * Phase 2/3's goalRegistry.js / checkpoint.js:
 *   - a plain singleton module (init/persist/read/write functions),
 *     NOT a class, NOT electron-store, NOT a new database engine
 *   - one JSON file on disk
 *   - atomic-ish write (temp file + rename)
 *   - a corrupt/unreadable file is preserved as a timestamped
 *     backup, never silently deleted
 *
 * Storage: src/database/assistant/tasks.json (default; callers pass
 * the actual path via init(), exactly like goalRegistry.init()).
 *
 * This module owns ONLY task records. It does not know anything
 * about classification, planning, execution, or safety — those
 * live in classifier.js / taskPlanner.js / taskExecutor.js /
 * safetyGate.js so this file stays a plain persistence layer.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("../utils/atomicJson");

const SCHEMA_VERSION = 1;

/** Valid lifecycle states for a task (Phase 6 project brief, STEP 7). */
const STATUSES = [
    "pending",
    "planning",
    "waiting_approval",
    "running",
    "completed",
    "failed",
    "paused",
    "cancelled"
];

let FILE_PATH = null;
let store = null; // { version, createdAt, updatedAt, tasks: [...] }
let taskCounter = 0;

function nowIso() {
    return new Date().toISOString();
}

function seedCounterFromId(id) {
    const match = typeof id === "string" && id.match(/-(\d+)$/);
    if (match) {
        const n = parseInt(match[1], 10);
        if (!Number.isNaN(n) && n > taskCounter) {
            taskCounter = n;
        }
    }
}

function generateTaskId() {
    taskCounter += 1;
    return `TASK-${String(taskCounter).padStart(6, "0")}`;
}

function defaultStore() {
    const timestamp = nowIso();
    return {
        version: SCHEMA_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
        tasks: []
    };
}

function isValidStoreShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        Array.isArray(obj.tasks) &&
        obj.tasks.every((t) => t && typeof t === "object" && typeof t.taskId === "string")
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
        // Never let a failed backup crash startup.
    }
    return null;
}

function persist() {
    if (!FILE_PATH || !store) return false;

    try {
        store.updatedAt = nowIso();
        writeJsonAtomic(FILE_PATH, store);
        return true;
    } catch (error) {
        console.warn(`[TaskStore] Failed to persist ${FILE_PATH}: ${error?.message || error}`);
        return false;
    }
}

/* ============================================================
   INIT
============================================================ */

function init(storagePath) {
    if (!storagePath) {
        throw new TypeError("taskStore.init() requires a storagePath.");
    }

    FILE_PATH = storagePath;

    try {
        fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    } catch (error) {
        // Non-fatal; writeFileSync below surfaces any real problem.
    }

    if (!fs.existsSync(FILE_PATH)) {
        store = defaultStore();
        persist();
        return { success: true, seeded: true, file: FILE_PATH, tasks: 0 };
    }

    try {
        const raw = fs.readFileSync(FILE_PATH, "utf8");
        const parsed = JSON.parse(raw);

        if (!isValidStoreShape(parsed)) {
            throw new Error("tasks.json exists but does not match the expected shape.");
        }

        store = {
            version: parsed.version || SCHEMA_VERSION,
            createdAt: parsed.createdAt || nowIso(),
            updatedAt: parsed.updatedAt || nowIso(),
            tasks: parsed.tasks
        };

        taskCounter = 0;
        store.tasks.forEach((t) => seedCounterFromId(t.taskId));

        return { success: true, seeded: false, file: FILE_PATH, tasks: store.tasks.length };
    } catch (error) {
        const corruptBackup = backupCorruptFile();
        store = defaultStore();
        taskCounter = 0;
        persist();

        return {
            success: true,
            seeded: true,
            recovered: true,
            corruptBackup,
            file: FILE_PATH,
            tasks: 0,
            warning:
                `Existing tasks.json was invalid/corrupt (${error.message}); ` +
                (corruptBackup
                    ? `it was preserved at ${corruptBackup} and a fresh store was seeded.`
                    : "it could not be backed up, so a fresh store was seeded.")
        };
    }
}

function ensureLoaded() {
    if (!store) {
        throw new Error("taskStore.init(storagePath) must be called before use.");
    }
}

/* ============================================================
   READ API
============================================================ */

function getAll() {
    ensureLoaded();
    return store.tasks.slice();
}

function getById(taskId) {
    ensureLoaded();
    return store.tasks.find((t) => t.taskId === taskId) || null;
}

/* ============================================================
   WRITE API
============================================================ */

/**
 * Creates and persists a new task. `fields` should NOT include
 * taskId/createdAt/updatedAt — those are always assigned here so
 * IDs can never collide or be forged by a caller.
 */
function createTask(fields = {}) {
    ensureLoaded();

    const timestamp = nowIso();
    const task = {
        taskId: generateTaskId(),
        userRequest: fields.userRequest || "",
        category: fields.category || "unsupported",
        status: STATUSES.includes(fields.status) ? fields.status : "pending",
        currentStep: 0,
        totalSteps: 0,
        steps: [],
        result: null,
        error: null,
        requiresApproval: !!fields.requiresApproval,
        approved: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        metadata: fields.metadata || {}
    };

    store.tasks.push(task);
    persist();
    return task;
}

/**
 * Merges `updates` onto the existing task and persists. Refuses to
 * write an unknown status rather than silently accepting garbage.
 */
function updateTask(taskId, updates = {}) {
    ensureLoaded();

    const task = getById(taskId);
    if (!task) {
        return { success: false, error: `Unknown taskId: ${taskId}` };
    }

    if (updates.status !== undefined && !STATUSES.includes(updates.status)) {
        return { success: false, error: `Invalid status: ${updates.status}` };
    }

    Object.assign(task, updates, { updatedAt: nowIso() });
    persist();
    return { success: true, task };
}

function deleteTask(taskId) {
    ensureLoaded();
    const before = store.tasks.length;
    store.tasks = store.tasks.filter((t) => t.taskId !== taskId);
    const removed = store.tasks.length !== before;
    if (removed) persist();
    return removed;
}

/** Test-only: fully resets in-memory state (mirrors EvolutionEngine's resetInstanceForTests pattern). */
function resetForTests() {
    FILE_PATH = null;
    store = null;
    taskCounter = 0;
}

module.exports = {
    init,
    getAll,
    getById,
    createTask,
    updateTask,
    deleteTask,
    resetForTests,
    STATUSES
};
