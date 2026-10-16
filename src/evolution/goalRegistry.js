"use strict";

/**
 * ============================================================
 * JARVIS FINAL GOAL REGISTRY
 * ============================================================
 *
 * Phase 2 of the Persistent Self-Improvement / Background
 * Evolution System (see PHASE1_ARCHITECTURE_AUDIT.md).
 *
 * This module owns the permanent list of 39 "Final JARVIS"
 * feature goals and their live progress state. It is a plain
 * singleton module (init/persist/read functions), the same
 * shape as src/services/mistakeLearning.js and src/services/
 * offlineCache.js — NOT a class, NOT electron-store, NOT a
 * database. Storage is a single JSON file, written the same
 * "read whole file / mutate in memory / write whole file back"
 * way src/ai/memory.js and mistakeLearning.js already use, so
 * it fits the existing project convention exactly.
 *
 * Storage: src/database/evolution/goalRegistry.json
 *
 * Guarantees this module must uphold (per the project brief):
 *   - The 39 permanent goals are seeded ONLY the first time the
 *     file does not exist.
 *   - Reloading an existing, valid file NEVER re-seeds and NEVER
 *     duplicates goals.
 *   - Existing goal state (status, completionPercentage, etc.)
 *     is preserved across restarts — a restart never resets
 *     progress back to zero.
 *   - goalId/featureId values are stable across restarts (they
 *     are derived once at first-seed time and then read back
 *     from disk on every subsequent load, never regenerated).
 *   - If the file is missing it is (re)created from the
 *     blueprint. If the file exists but is corrupt/unreadable,
 *     the corrupt file is preserved as a timestamped backup
 *     (never deleted/silently overwritten) and a fresh registry
 *     is seeded — this matches the "preserve last valid
 *     checkpoint, do not silently reset everything" rule.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("../utils/atomicJson");

const SCHEMA_VERSION = 1;

/** Allowed lifecycle states for a goal (per project brief). */
const STATUSES = [
    "NOT_STARTED",
    "OBSERVING",
    "RESEARCHING",
    "ANALYZING",
    "LEARNING",
    "PLANNING",
    "PROPOSAL_READY",
    "WAITING_APPROVAL",
    "TESTING",
    "PARTIAL",
    "COMPLETED",
    "BLOCKED",
    "FAILED",
    "PAUSED"
];

/**
 * The 39 permanent Final-JARVIS goals from the project brief.
 * This list is the single source of truth for what goals exist.
 * Order here also defines default priority (lower index = higher
 * default priority) unless a goal's saved state overrides it.
 *
 * IMPORTANT: featureId values are permanent identifiers. Do not
 * rename or reorder existing entries in a way that changes an
 * existing featureId — doing so would look like "deleting" a
 * goal that already has saved progress. Only append new entries
 * if the blueprint ever legitimately grows.
 */
const FINAL_GOALS_BLUEPRINT = [
    { featureId: "core-brain", name: "Core Brain", category: "Core Intelligence", description: "The central reasoning/decision pipeline (Intent -> Brain -> Reasoning -> Decision -> Planning) that all other capabilities sit on top of." },
    { featureId: "context-engine", name: "Context Engine", category: "Core Intelligence", description: "Tracks conversational context, references, and pending intents across turns so JARVIS understands follow-up messages correctly." },
    { featureId: "memory-system", name: "Memory System", category: "Core Intelligence", description: "Long-term, disk-persisted recall of facts, preferences, and history (builds on the existing MemoryEngine)." },
    { featureId: "goal-system", name: "Goal System", category: "Core Intelligence", description: "Tracks user-set and JARVIS-internal goals, including this Final Goal Registry itself." },
    { featureId: "autonomous-agent-loop", name: "Autonomous Agent Loop", category: "Core Intelligence", description: "The observe -> select -> act -> evaluate loop that lets JARVIS carry out multi-step tasks without a prompt per step." },
    { featureId: "internet-intelligence", name: "Internet Intelligence", category: "Learning & Improvement", description: "Ability to look up public information (documentation, APIs, articles) to answer questions and inform improvement research." },
    { featureId: "autonomous-learning", name: "Autonomous Learning", category: "Learning & Improvement", description: "Collecting and structuring knowledge from research so it can be reused for future decisions, without human re-explanation." },
    { featureId: "self-improvement", name: "Self-Improvement", category: "Learning & Improvement", description: "The background evolution system itself: researching weaknesses, proposing improvements, and tracking real, evidence-backed progress." },
    { featureId: "experiment-sandbox", name: "Experiment/Sandbox", category: "Safety & Control", description: "An isolated place to run safe validations (static analysis, unit tests) without touching production source code." },
    { featureId: "snapshot-rollback", name: "Snapshot/Rollback", category: "Safety & Control", description: "Backing up affected files before an approved change is applied, and restoring them if the change fails." },
    { featureId: "coding-intelligence", name: "Coding Intelligence", category: "Core Intelligence", description: "Understanding and reasoning about JARVIS's own source code well enough to propose concrete implementation changes." },
    { featureId: "computer-control", name: "Computer Control", category: "Capabilities", description: "Controlling local OS-level actions (apps, files, notifications) on the user's behalf, within permission boundaries." },
    { featureId: "browser-agent", name: "Browser Agent", category: "Capabilities", description: "Automated, resilient in-app browsing (navigation, search, recovery from failures) built on the existing BrowserEngine." },
    { featureId: "vision", name: "Vision", category: "Interaction", description: "Understanding images/screen content to answer questions or take action based on what is visually present." },
    { featureId: "advanced-voice", name: "Advanced Voice", category: "Interaction", description: "Natural, low-latency speech input/output, building on the existing STT/TTS pipeline." },
    { featureId: "natural-conversation", name: "Natural Conversation", category: "Interaction", description: "Fluent, context-aware dialogue that doesn't feel like rigid command matching." },
    { featureId: "task-automation", name: "Task Automation", category: "Capabilities", description: "Chaining existing capabilities together to complete multi-step user-defined tasks." },
    { featureId: "personal-productivity", name: "Personal Productivity", category: "Capabilities", description: "Reminders, notes, scheduling-style helpers that support the user's day-to-day work." },
    { featureId: "mobile-control", name: "Mobile Control", category: "Capabilities", description: "Extending JARVIS's control/automation surface to mobile devices where applicable." },
    { featureId: "consciousness-internal-state", name: "Consciousness-like Internal State", category: "Interaction", description: "The existing ConsciousnessLayer's ongoing internal state (mood/goal/context) that colors responses over time." },
    { featureId: "reflection-engine", name: "Reflection Engine", category: "Interaction", description: "Periodically reviewing recent interactions to notice patterns worth adjusting behavior for." },
    { featureId: "personality-engine", name: "Personality Engine", category: "Interaction", description: "Consistent, configurable tone/personality applied across responses (builds on renderer/js/personalityStyle.js)." },
    { featureId: "emotion-aware-interaction", name: "Emotion-aware Interaction", category: "Interaction", description: "Recognizing user tone/sentiment and adapting responses appropriately, without diagnosing the user." },
    { featureId: "security-permission-engine", name: "Security & Permission Engine", category: "Safety & Control", description: "Gatekeeping what JARVIS is allowed to do (e.g. production changes, sensitive data access) and requiring explicit approval." },
    { featureId: "privacy-engine", name: "Privacy Engine", category: "Safety & Control", description: "Distinguishing public research data from private JARVIS/user data and preventing accidental exposure of the latter." },
    { featureId: "tool-skill-system", name: "Tool/Skill System", category: "Capabilities", description: "A registry of discrete, invocable skills/tools JARVIS can call on to fulfil a request." },
    { featureId: "multi-agent-system", name: "Multi-Agent System", category: "Capabilities", description: "Coordinating multiple specialised internal agents (e.g. research, browser, coding) on a single larger task." },
    { featureId: "research-agent", name: "Research Agent", category: "Learning & Improvement", description: "A focused agent whose job is gathering and summarising information for a specific goal, reusing Internet Intelligence." },
    { featureId: "knowledge-graph", name: "Knowledge Graph", category: "Learning & Improvement", description: "Structured, queryable relationships between collected knowledge items, goals, and JARVIS features." },
    { featureId: "health-diagnostics", name: "Health & Diagnostics", category: "Operations", description: "Runtime health reporting for JARVIS's own modules (builds on renderer/js/health.js and diagnosticsUI.js)." },
    { featureId: "self-healing", name: "Self-Healing", category: "Operations", description: "Automatically recovering from detected failures where it is safe to do so, without silent data loss." },
    { featureId: "performance-optimization", name: "Performance Optimization", category: "Operations", description: "Identifying and addressing latency/resource bottlenecks across JARVIS's pipelines." },
    { featureId: "audit-observability", name: "Audit & Observability", category: "Operations", description: "A durable, reviewable log of what JARVIS did, researched, and changed, and why." },
    { featureId: "controlled-update-system", name: "Controlled Update System", category: "Safety & Control", description: "Applying approved production changes safely, with snapshotting and rollback, never silently." },
    { featureId: "evaluation-benchmarking", name: "Evaluation/Benchmarking", category: "Learning & Improvement", description: "Measuring whether a proposed or applied change actually improved the targeted capability." },
    { featureId: "failure-learning", name: "Failure Learning", category: "Learning & Improvement", description: "Recording failed approaches with the reason they failed so they are not blindly retried." },
    { featureId: "autonomous-goal-management", name: "Autonomous Goal Management", category: "Core Intelligence", description: "Selecting which goal to work on next based on priority, dependencies, and current status — this registry's consumer." },
    { featureId: "emergency-stop", name: "Emergency Stop", category: "Safety & Control", description: "An always-available control to immediately halt background evolution activity while preserving state." },
    { featureId: "autonomy-control", name: "Autonomy Control", category: "Safety & Control", description: "The overall permission boundary distinguishing what JARVIS may do autonomously versus what requires explicit human approval." }
];

let FILE_PATH = null;
let registry = null; // { version, createdAt, updatedAt, goals: [...] }

/* ============================================================
   HELPERS
============================================================ */

function nowIso() {
    return new Date().toISOString();
}

function buildSeedGoal(blueprint, index) {
    const timestamp = nowIso();
    return {
        goalId: `goal-${String(index + 1).padStart(2, "0")}-${blueprint.featureId}`,
        featureId: blueprint.featureId,
        name: blueprint.name,
        category: blueprint.category,
        description: blueprint.description,
        priority: index + 1,
        status: "NOT_STARTED",
        completionPercentage: 0,
        dependencies: [],
        knownProblems: [],
        researchStatus: "NOT_STARTED",
        knowledgeStatus: "NOT_STARTED",
        analysisStatus: "NOT_STARTED",
        proposalStatus: "NOT_STARTED",
        implementationStatus: "NOT_STARTED",
        lastActivity: null,
        nextAction: "Observe current capability and identify the first research target.",
        lastCheckpoint: null,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function defaultRegistry() {
    const timestamp = nowIso();
    return {
        version: SCHEMA_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
        goals: FINAL_GOALS_BLUEPRINT.map(buildSeedGoal)
    };
}

function isValidRegistryShape(obj) {
    return (
        obj &&
        typeof obj === "object" &&
        Array.isArray(obj.goals) &&
        obj.goals.every(
            (g) => g && typeof g === "object" && typeof g.goalId === "string" && typeof g.featureId === "string"
        )
    );
}

/**
 * Reconciles a loaded registry against the current blueprint:
 *   - Every existing goal (matched by featureId) is preserved
 *     EXACTLY as-is, including its progress/status — never reset.
 *   - Any blueprint goal missing from the saved file (e.g. the
 *     blueprint legitimately grew in a later version) is appended
 *     as a fresh NOT_STARTED goal.
 *   - No goal is ever duplicated: matching is by featureId.
 */
function mergeWithBlueprint(existing) {
    const existingByFeatureId = new Map(existing.goals.map((g) => [g.featureId, g]));
    let addedAny = false;

    const merged = FINAL_GOALS_BLUEPRINT.map((blueprint, index) => {
        if (existingByFeatureId.has(blueprint.featureId)) {
            return existingByFeatureId.get(blueprint.featureId);
        }
        addedAny = true;
        return buildSeedGoal(blueprint, index);
    });

    return {
        result: {
            version: existing.version || SCHEMA_VERSION,
            createdAt: existing.createdAt || nowIso(),
            updatedAt: existing.updatedAt || nowIso(),
            goals: merged
        },
        addedAny
    };
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
        // not crash JARVIS startup over a corrupt evolution file.
    }
    return null;
}

/**
 * Atomic-ish write: write to a temp file in the same directory,
 * then rename over the real file. A crash mid-write leaves either
 * the old valid file or the new valid temp file, never a half
 * written goalRegistry.json.
 */
function persist() {
    if (!FILE_PATH || !registry) return false;

    try {
        registry.updatedAt = nowIso();
        writeJsonAtomic(FILE_PATH, registry);
        return true;
    } catch (error) {
        return false;
    }
}

/* ============================================================
   INIT
============================================================ */

/**
 * Loads (or seeds) the registry at the given absolute file path.
 * Safe to call multiple times; each call fully re-points this
 * module at storagePath and reloads from disk, mirroring the
 * init(baseDir) pattern used by src/services/mistakeLearning.js.
 */
function init(storagePath) {
    if (!storagePath) {
        throw new TypeError("goalRegistry.init() requires a storagePath.");
    }

    FILE_PATH = storagePath;

    try {
        fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    } catch (error) {
        // Non-fatal here; the writeFileSync below will surface any
        // real filesystem problem.
    }

    if (!fs.existsSync(FILE_PATH)) {
        registry = defaultRegistry();
        persist();
        return {
            success: true,
            seeded: true,
            file: FILE_PATH,
            goals: registry.goals.length
        };
    }

    try {
        const raw = fs.readFileSync(FILE_PATH, "utf8");
        const parsed = JSON.parse(raw);

        if (!isValidRegistryShape(parsed)) {
            throw new Error("goalRegistry.json exists but does not match the expected shape.");
        }

        const { result, addedAny } = mergeWithBlueprint(parsed);
        registry = result;
        if (addedAny) persist();

        return {
            success: true,
            seeded: false,
            file: FILE_PATH,
            goals: registry.goals.length,
            blueprintGoalsAdded: addedAny
        };
    } catch (error) {
        const corruptBackup = backupCorruptFile();
        registry = defaultRegistry();
        persist();

        return {
            success: true,
            seeded: true,
            recovered: true,
            corruptBackup,
            file: FILE_PATH,
            goals: registry.goals.length,
            warning: `Existing goalRegistry.json was invalid/corrupt (${error.message}); ` +
                (corruptBackup
                    ? `it was preserved at ${corruptBackup} and a fresh registry was seeded.`
                    : "it could not be backed up, so a fresh registry was seeded.")
        };
    }
}

/* ============================================================
   READ API
============================================================ */

function ensureLoaded() {
    if (!registry) {
        throw new Error("goalRegistry.init(storagePath) must be called before use.");
    }
}

function getAll() {
    ensureLoaded();
    return registry.goals.slice();
}

function getById(goalId) {
    ensureLoaded();
    return registry.goals.find((g) => g.goalId === goalId) || null;
}

function getByFeatureId(featureId) {
    ensureLoaded();
    return registry.goals.find((g) => g.featureId === featureId) || null;
}

function getOverallProgress() {
    ensureLoaded();
    if (!registry.goals.length) return 0;
    const total = registry.goals.reduce((sum, g) => sum + (Number(g.completionPercentage) || 0), 0);
    return Math.round(total / registry.goals.length);
}

function getSummary() {
    ensureLoaded();
    const byStatus = {};
    for (const goal of registry.goals) {
        byStatus[goal.status] = (byStatus[goal.status] || 0) + 1;
    }
    return {
        overallProgress: getOverallProgress(),
        totalGoals: registry.goals.length,
        byStatus,
        lastUpdated: registry.updatedAt
    };
}

/* ============================================================
   WRITE API
============================================================ */

const UPDATABLE_FIELDS = [
    "status",
    "completionPercentage",
    "dependencies",
    "knownProblems",
    "researchStatus",
    "knowledgeStatus",
    "analysisStatus",
    "proposalStatus",
    "implementationStatus",
    "lastActivity",
    "nextAction",
    "lastCheckpoint",
    "priority"
];

/**
 * Applies a partial update to one goal and persists it. Only
 * whitelisted fields can be changed this way — goalId, featureId,
 * name, category, description, and createdAt are immutable once
 * seeded.
 */
function updateGoal(goalId, updates = {}) {
    ensureLoaded();

    const goal = getById(goalId);
    if (!goal) {
        return { success: false, error: `Unknown goalId: ${goalId}` };
    }

    if (updates.status !== undefined && !STATUSES.includes(updates.status)) {
        return { success: false, error: `Invalid status: ${updates.status}` };
    }

    for (const field of UPDATABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
            goal[field] = updates[field];
        }
    }

    goal.updatedAt = nowIso();
    const persisted = persist();

    return { success: persisted, goal };
}

module.exports = {
    init,
    getAll,
    getById,
    getByFeatureId,
    getOverallProgress,
    getSummary,
    updateGoal,
    STATUSES,
    FINAL_GOALS_BLUEPRINT
};
