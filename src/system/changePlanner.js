"use strict";

// Produces a reviewable change plan. It does not install packages or delete
// files; executors must be explicitly approved and must use an adapter for the
// requested capability.
function createChangePlan({ from, to, request = "" } = {}) {
    const source = String(from || "").trim().toLowerCase();
    const target = String(to || "").trim().toLowerCase();
    if (!source || !target || source === target) return { success: false, code: "INVALID_CHANGE", error: "A different source and target are required." };
    return {
        success: true,
        status: "PLAN_ONLY",
        request: String(request).slice(0, 240),
        from: source,
        to: target,
        phases: ["compatibility-check", "official-source-check", "install-with-approval", "smoke-test", "switch-with-rollback", "separate-cleanup-approval"],
        destructive: true,
        approvalRequired: true,
        cleanupApprovalRequired: true,
        rollbackRequired: true,
        message: `Prepared a safe change plan from ${source} to ${target}. Nothing was installed, switched, or deleted.`
    };
}

module.exports = { createChangePlan };
