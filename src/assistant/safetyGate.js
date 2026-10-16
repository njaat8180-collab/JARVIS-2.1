"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT SAFETY GATE (Phase 6)
 * ============================================================
 *
 * The single place that decides whether a task requires explicit
 * user approval before TaskExecutor is allowed to run it.
 *
 * Hard rule (project brief, STEP 9): approval must NEVER be
 * inferred from research success or normal task creation — it can
 * only be granted through approveTask()/AssistantOrchestrator's
 * explicit approve() call, which sets `approved: true` on the task
 * record itself. This module never sets that flag; it only reads
 * it (isApproved) and decides whether it is REQUIRED (requires).
 * ============================================================
 */

const { DESTRUCTIVE_ACTIONS } = require("./classifier");
const { DESTRUCTIVE_SYSTEM_ACTIONS } = require("./systemActionAdapter");
const { DESTRUCTIVE_BROWSER_ACTIONS } = require("./browserActionAdapter");

/** Categories that are always treated as potentially dangerous. */
const ALWAYS_GATED_CATEGORIES = new Set(["system_command"]);
const EXTERNAL_SIDE_EFFECT_PATTERNS = [
    /\b(?:send|email|message|text)\b.{0,80}\b(?:to|via|through)\b/i,
    /\b(?:post|publish|submit|upload|share)\b/i,
    /\b(?:buy|purchase|checkout|place an order|pay|transfer money)\b/i
];

function approvalReason(classification, rawText) {
    if (!classification) return "This action needs your approval.";
    if (ALWAYS_GATED_CATEGORIES.has(classification.category) || classification.destructiveAction) {
        return "This can change system state or close work. Review the action before JARVIS runs it.";
    }
    const text = String(rawText || "");
    if (EXTERNAL_SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(text))) {
        return "This may send, publish, upload, purchase, or transfer something outside JARVIS. Confirm the target and details first.";
    }
    if (DESTRUCTIVE_ACTIONS.some((word) => text.toLowerCase().includes(word))) {
        return "This action may delete, overwrite, or disrupt data. Review it before JARVIS runs it.";
    }
    return "This action needs your approval.";
}

/** Canonical step-action suffixes (after the "system_"/"browser_" prefix
 * taskPlanner uses) that are destructive regardless of how the action
 * string reads as plain English — this is what lets isDestructiveStep
 * catch Phase 7's fine-grained step names like "system_lock" or
 * "browser_clearHistory", which don't literally contain a DESTRUCTIVE_ACTIONS
 * phrase as a substring. */
const DESTRUCTIVE_STEP_SUFFIXES = new Set([...DESTRUCTIVE_SYSTEM_ACTIONS, ...DESTRUCTIVE_BROWSER_ACTIONS]);

/**
 * @param {{category:string, destructiveAction?:string|null}} classification
 * @param {string} rawText
 * @returns {boolean} true if this request must enter waiting_approval.
 */
function requiresApproval(classification, rawText) {
    if (!classification) return false;

    if (ALWAYS_GATED_CATEGORIES.has(classification.category)) return true;
    if (classification.destructiveAction) return true;

    const text = String(rawText || "").toLowerCase();
    return DESTRUCTIVE_ACTIONS.some((word) => text.includes(word)) || EXTERNAL_SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * @param {object} task - a taskStore record.
 * @returns {boolean} true if the task is cleared to run right now.
 */
function isApproved(task) {
    if (!task) return false;
    if (!task.requiresApproval) return true;
    return task.approved === true;
}

/**
 * Decides if a given step is itself destructive (used by
 * TaskExecutor as a last defense-in-depth check even for tasks that
 * were misclassified, so a destructive step can never silently run
 * inside an otherwise-safe task).
 */
function isDestructiveStep(step) {
    if (!step || typeof step !== "object") return false;
    const action = String(step.action || "");
    const lower = action.toLowerCase();

    if (DESTRUCTIVE_ACTIONS.some((word) => lower.includes(word))) return true;

    // Match Phase 7's "system_<canonicalAction>" / "browser_<canonicalAction>"
    // step-naming convention against the adapters' own destructive-action sets.
    const suffix = action.includes("_") ? action.slice(action.indexOf("_") + 1) : action;
    return DESTRUCTIVE_STEP_SUFFIXES.has(suffix);
}

module.exports = {
    requiresApproval,
    approvalReason,
    isApproved,
    isDestructiveStep,
    ALWAYS_GATED_CATEGORIES
};
