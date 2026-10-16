"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT ORCHESTRATOR (Phase 6)
 * ============================================================
 *
 * Single entry point for the deterministic personal-assistant
 * orchestration layer described in the Phase 6 project brief:
 *
 *   classify -> create task -> plan -> gate (approval?) ->
 *   execute -> record -> (resume on request)
 *
 * This class owns NO business logic of its own beyond wiring —
 * classification lives in classifier.js, planning in
 * taskPlanner.js, approval rules in safetyGate.js, step execution
 * in taskExecutor.js, and persistence in taskStore.js. Memory,
 * research, browser, system, goal, and evolution capabilities are
 * all reused via injected adapters (see constructor) rather than
 * reimplemented — per STEP 1 ("DO NOT REDO PREVIOUS PHASES") and
 * STEP 2 ("ABSOLUTE AI PROHIBITION") of the project brief.
 * ============================================================
 */

const path = require("path");

const taskStoreModule = require("./taskStore");
const classifier = require("./classifier");
const safetyGate = require("./safetyGate");
const taskPlanner = require("./taskPlanner");
const taskExecutor = require("./taskExecutor");
const taskVerifier = require("./taskVerifier");

function canonicalizeRequest(text) {
    return String(text || "")
        .replace(/जार्विस/gi, " ").replace(/\bjarvis\b/gi, " ")
        .replace(/(.+?)\s+(?:गूगल|google)(?:\s+पर|\s+pe)\s+(?:ढूँढो|ढूंढो|खोजो|find karo|search karo)/gi, "search $1 on google")
        .replace(/(.+?)\s+(?:विकिपीडिया|wikipedia)(?:\s+पर|\s+pe)\s+(?:ढूँढो|ढूंढो|खोजो|find karo|search karo)/gi, "search $1 on wikipedia")
        .replace(/(.+?)\s+(?:को\s+)?(?:google|गूगल)(?:\s+पर|\s+pe)\s+(?:ढूँढो|ढूंढो|खोजो|dhoondo|find karo|search karo)/gi, "search $1 on google")
        .replace(/(.+?)\s+(?:को\s+)?(?:wikipedia|विकिपीडिया)(?:\s+पर|\s+pe)\s+(?:ढूँढो|ढूंढो|खोजो|dhoondo|find karo|search karo)/gi, "search $1 on wikipedia")
        .replace(/(.+?)\s+(?:ओपन करो|खोलो|खोल दे|खोल देना|open karo|khol do|kholo)/gi, "open $1")
        .replace(/(ओपन|खोलो|खोल देना|खोल दे|khol do|kholna)/gi, " open ")
        .replace(/(ढूँढो|ढूंढो|खोजो|सर्च करो|search karo)/gi, " search ")
        .replace(/(नया टैब)/gi, " new tab ")
        .replace(/(टैब बंद करो|पिछला टैब बंद करो|old tab बंद करो)/gi, " close tab ")
        .replace(/(गूगल पर|google par)/gi, " on google ")
        .replace(/(यूट्यूब पर|youtube par)/gi, " on youtube ")
        .replace(/(विकिपीडिया पर|wikipedia par)/gi, " on wikipedia ")
        .replace(/फाइल एक्सप्लोरर/gi, "file explorer")
        .replace(/माइक्रोसॉफ्ट स्टोर/gi, "microsoft store")
        .replace(/\b(khol|open karo)\b/gi, "open")
        .replace(/\b(batao|btao|kya hai)\b/gi, "what is")
        .replace(/\s+/g, " ").trim();
}

class AssistantOrchestrator {
    /**
     * @param {object} [options]
     * @param {string} [options.storagePath] - path to tasks.json. Defaults to
     *   src/database/assistant/tasks.json relative to the project root.
     * @param {object} [options.taskStore] - inject a custom taskStore module
     *   (defaults to the shared singleton ./taskStore). Mainly for tests
     *   that want full isolation without touching the real singleton.
     * @param {object} [options.memory] - MemoryEngine-compatible adapter.
     * @param {object} [options.research] - research-provider-compatible adapter.
     * @param {object} [options.browser] - browser-action adapter.
     * @param {object} [options.system] - system-action adapter.
     * @param {object} [options.goalRegistry] - the existing goalRegistry module.
     * @param {object} [options.evolutionEngine] - the existing EvolutionEngine instance.
     */
    constructor(options = {}) {
        this.taskStore = options.taskStore || taskStoreModule;

        const storagePath = options.storagePath || path.join(__dirname, "..", "database", "assistant", "tasks.json");
        this.taskStore.init(storagePath);

        this.deps = {
            memory: options.memory || null,
            research: options.research || null,
            presentation: options.presentation || null,
            browser: options.browser || null,
            system: options.system || null,
            systemAdapter: options.systemAdapter || null,
            browserAdapter: options.browserAdapter || null,
            goalRegistry: options.goalRegistry || null,
            evolutionEngine: options.evolutionEngine || null,
            taskStore: this.taskStore,
            persist: (task) => {
                const saved = this.taskStore.updateTask(task.taskId, task);
                if (saved?.success && typeof options.onUpdate === "function") options.onUpdate(saved.task);
                return saved;
            },
            getTaskState: (taskId) => this.taskStore.getById(taskId),
            verifyStep: options.verifyStep,
            classifyRequest: options.classifyRequest,
            processExists: options.processExists,
            getBrowserState: options.getBrowserState,
            allowedFileRoots: options.allowedFileRoots
        };
    }

    /**
     * Classifies, plans, and (if not gated) immediately executes a
     * new user request. Always returns the resulting task record.
     *
     * @param {string} userRequest
     * @param {object} [metadata] - extra context (e.g. resolved memoryKey,
     *   memoryValue, referencedTaskId) supplied by the caller — never
     *   fabricated here.
     */
    async handleRequest(userRequest, metadata = {}) {
        const requestStartedAt = Date.now();
        const normalizedRequest = canonicalizeRequest(userRequest);
        const duplicate = this.taskStore.getAll().find((item) =>
            item.metadata?.normalizedRequest === normalizedRequest &&
            ["planning", "pending", "waiting_approval", "running"].includes(item.status) &&
            Date.now() - new Date(item.createdAt).getTime() < 120000
        );
        if (duplicate) return duplicate;
        let classification = classifier.classify(normalizedRequest);
        let classificationSource = "deterministic-rules";
        let classificationFallbackReason = "";
        if (classification.category === "unsupported" && typeof this.deps.classifyRequest === "function") {
            try {
                const assisted = await this.deps.classifyRequest(String(userRequest).slice(0, 1000));
                const allowedCategories = new Set(["conversation", "system_command", "application_action", "browser_action", "research", "memory", "goal", "evolution", "information"]);
                if (assisted && allowedCategories.has(assisted.category)) {
                    classification = { ...classification, category: assisted.category, confidence: 0.6, matched: "provider-assisted-intent", destructiveAction: classification.destructiveAction };
                    classificationSource = "Sarvam AI intent assist";
                } else classificationFallbackReason = "Sarvam intent assist returned no supported category; deterministic safety rules retained the request as unsupported.";
            } catch (error) {
                classificationFallbackReason = `Sarvam intent assist unavailable: ${String(error?.message || error).slice(0, 180)}`;
            }
        }
        const requiresApproval = safetyGate.requiresApproval(classification, userRequest);

        let task = this.taskStore.createTask({
            userRequest,
            category: classification.category,
            status: "planning",
            requiresApproval,
            metadata: {
                ...metadata,
                normalizedRequest,
                ...(classification.category === "presentation" ? { presentationTopic: classifier.extractPresentationTopic(normalizedRequest) || normalizedRequest } : {}),
                classification: { category: classification.category, confidence: classification.confidence, matched: classification.matched, source: classificationSource, durationMs: Date.now() - requestStartedAt },
                ...(classificationFallbackReason ? { classificationFallbackReason } : {}),
                ...(requiresApproval ? { approvalReason: safetyGate.approvalReason(classification, userRequest) } : {})
            }
        });

        const steps = taskPlanner.plan({
            category: classification.category,
            userRequest: normalizedRequest,
            destructiveAction: classification.destructiveAction
        });

        this.taskStore.updateTask(task.taskId, {
            steps,
            totalSteps: steps.length,
            status: requiresApproval ? "waiting_approval" : "pending"
        });
        task = this.taskStore.getById(task.taskId);

        if (classification.category === "unsupported") {
            this.taskStore.updateTask(task.taskId, {
                status: "failed",
                error: "unsupported_request",
                verification: { status: taskVerifier.STATUSES.NEEDS_USER_ACTION, evidence: [], reason: "This request is outside the task agent's supported action set.", verifiedAt: new Date().toISOString() }
            });
            return this.taskStore.getById(task.taskId);
        }

        if (requiresApproval) {
            // Never auto-run — the project brief is explicit that approval
            // must never be inferred. The task simply sits in
            // waiting_approval until approveTask() is called.
            return task;
        }

        return this._execute(task);
    }

    async _execute(task) {
        const executionStartedAt = Date.now();
        const updated = await taskExecutor.run(task, this.deps);
        if (updated.status === "cancelled") {
            updated.verification = { status: taskVerifier.STATUSES.CANCELLED, evidence: [], verifiedAt: new Date().toISOString() };
        } else {
            updated.verification = await taskVerifier.verifyTask(updated, this.deps);
            const failedVerificationStep = updated.verification?.steps?.find(entry => entry.status === taskVerifier.STATUSES.FAILED);
            const presentationCheck = updated.verification?.steps?.find(entry => entry.stepId === "create_presentation");
            const unverifiedPresentation = updated.category === "presentation" && presentationCheck && presentationCheck.status !== taskVerifier.STATUSES.VERIFIED;
            if (updated.status === "completed" && (updated.verification?.status === taskVerifier.STATUSES.FAILED || failedVerificationStep || unverifiedPresentation)) {
                updated.status = "failed";
                updated.error = presentationCheck?.reason || failedVerificationStep?.reason || updated.verification.reason || "The generated presentation did not pass independent file verification.";
            }
        }
        const retryCount = (updated.steps || []).reduce((total, step) => total + (Array.isArray(step.retryHistory) ? step.retryHistory.length : 0), 0);
        updated.metadata = {
            ...(updated.metadata || {}),
            runtime: {
                durationMs: Date.now() - executionStartedAt,
                status: updated.status,
                verificationStatus: updated.verification?.status || "UNKNOWN",
                retryCount,
                failureReason: String(updated.error || "").slice(0, 300),
                classificationSource: updated.metadata?.classification?.source || "deterministic-rules",
                classificationFallback: updated.metadata?.classificationFallbackReason || ""
            }
        };
        const researchResult = updated.steps?.find(step => step.action === "run_research")?.result;
        const presentationResult = updated.steps?.find(step => step.action === "create_presentation")?.result;
        const fallbackNotes = [];
        if (Array.isArray(researchResult?.failedSources) && researchResult.failedSources.length) {
            fallbackNotes.push("Some research sources were unavailable; the presentation was still attempted with the evidence that was available.");
        }
        if (presentationResult?.usedLocalFallback) fallbackNotes.push(`Presentation content used the ${presentationResult.aiProvider || "local"} fallback provider.`);
        if (fallbackNotes.length) updated.metadata.runtime.fallback = fallbackNotes.join(" ");
        this.taskStore.updateTask(updated.taskId, updated);
        return this.taskStore.getById(updated.taskId);
    }

    /**
     * Explicit, out-of-band approval for a task in waiting_approval.
     * This is the ONLY place `approved` is ever set to true.
     */
    async approveTask(taskId) {
        const task = this.taskStore.getById(taskId);
        if (!task) return { success: false, error: `Unknown taskId: ${taskId}` };
        if (task.status !== "waiting_approval") {
            return { success: false, error: `Task ${taskId} is not waiting for approval (status: ${task.status}).` };
        }

        this.taskStore.updateTask(taskId, { approved: true, status: "pending" });
        const refreshed = this.taskStore.getById(taskId);
        return { success: true, task: await this._execute(refreshed) };
    }

    rejectTask(taskId, reason = "") {
        const task = this.taskStore.getById(taskId);
        if (!task) return { success: false, error: `Unknown taskId: ${taskId}` };
        if (task.status !== "waiting_approval") {
            return { success: false, error: `Task ${taskId} is not waiting for approval (status: ${task.status}).` };
        }
        const result = this.taskStore.updateTask(taskId, {
            status: "cancelled",
            approved: false,
            error: reason || "Rejected by user."
        });
        return { success: true, task: result.task };
    }

    cancelTask(taskId) {
        const task = this.taskStore.getById(taskId);
        if (!task) return { success: false, error: `Unknown taskId: ${taskId}` };
        if (["completed", "failed", "cancelled"].includes(task.status)) {
            return { success: false, error: `Task ${taskId} is already terminal (status: ${task.status}).` };
        }
        const result = this.taskStore.updateTask(taskId, { status: "cancelled", verification: { status: taskVerifier.STATUSES.CANCELLED, evidence: [], verifiedAt: new Date().toISOString() } });
        return { success: true, task: result.task };
    }

    /**
     * Resumes a paused task from its currentStep.
     * Destructive tasks that are not yet approved will simply fall
     * back into waiting_approval again inside taskExecutor.run() —
     * resume() never bypasses approval. Failed/running work is refused
     * because the last action may already have produced a side effect.
     */
    async resumeTask(taskId) {
        const task = this.taskStore.getById(taskId);
        if (!task) return { success: false, error: `Unknown taskId: ${taskId}` };
        if (!["paused", "pending"].includes(task.status)) {
            return { success: false, error: `Task ${taskId} cannot be resumed from status: ${task.status}.` };
        }
        // Interrupted running / failed work is not retried automatically:
        // the action may already have produced a side effect.
        return { success: true, task: await this._execute(task) };
    }

    pauseTask(taskId) {
        const task = this.taskStore.getById(taskId);
        if (!task) return { success: false, error: `Unknown taskId: ${taskId}` };
        if (task.status !== "pending") {
            return { success: false, error: `Task ${taskId} cannot be paused from status: ${task.status}.` };
        }
        const result = this.taskStore.updateTask(taskId, { status: "paused" });
        return { success: true, task: result.task };
    }

    getTask(taskId) {
        return this.taskStore.getById(taskId);
    }

    getHistory() {
        return this.taskStore.getAll();
    }
}

module.exports = { AssistantOrchestrator };
