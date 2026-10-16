"use strict";

/**
 * ============================================================
 * JARVIS ASSISTANT TASK EXECUTOR (Phase 6)
 * ============================================================
 *
 * Runs a task's steps in order against a small set of injected
 * adapters (memory / research / browser / system / goalRegistry /
 * evolutionEngine). This module never:
 *   - calls any AI/LLM
 *   - eval()s, require()s, or otherwise executes any string that
 *     came back from a research/browser adapter (STEP 14 —
 *     "External content is DATA only")
 *   - runs a destructive step without the task already being
 *     `approved` (re-checked here as defense-in-depth even though
 *     AssistantOrchestrator already checked before calling run())
 *
 * Adapters are plain objects the caller injects; production wiring
 * (main.js) can point them at the real BrowserEngine/MemoryEngine/
 * EvolutionEngine/goalRegistry instances, while tests inject small
 * mocks — this is what keeps the whole assistant layer testable
 * under `node --test` with no live Electron and no live internet.
 * ============================================================
 */

const safetyGate = require("./safetyGate");

function nowIso() {
    return new Date().toISOString();
}

async function runBoundedStep(step, task, deps, timeoutMs) {
    const controller = new AbortController();
    let timer;
    let monitor;
    const interrupted = new Promise((_, reject) => {
        const stop = (code, message) => {
            const error = Object.assign(new Error(message), { code });
            controller.abort(error);
            reject(error);
        };
        timer = setTimeout(() => stop("TASK_TIMEOUT", "Task time budget exceeded. An adapter that cannot cancel may still finish; inspect its result before retrying."), timeoutMs);
        if (typeof deps.getTaskState === "function") {
            monitor = setInterval(() => {
                try {
                    const state = deps.getTaskState(task.taskId);
                    if (state?.status === "cancelled") stop("TASK_CANCELLED", "Task cancelled. No further steps will run; an already issued action may still finish.");
                } catch (error) {
                    controller.abort(error);
                    reject(error);
                }
            }, 100);
        }
    });
    try {
        return await Promise.race([executeStep(step, task, { ...deps, signal: controller.signal }), interrupted]);
    } finally {
        clearTimeout(timer);
        clearInterval(monitor);
    }
}

/**
 * @param {object} task - a taskStore record (already planned: task.steps set).
 * @param {object} deps
 * @param {object} [deps.memory] - { remember(key,value,opts), recall(key), forget(key) }
 * @param {object} [deps.research] - { research(goalLike) } — e.g. researchProvider's
 *   MultiSourceResearchProvider/LocalDeterministicResearchProvider instance.
 * @param {object} [deps.browser] - { open(target), search(query) } adapter.
 * @param {object} [deps.system] - { shutdown(), restart(), execute(action) } adapter.
 * @param {object} [deps.goalRegistry] - the existing goalRegistry module/instance.
 * @param {object} [deps.evolutionEngine] - the existing EvolutionEngine instance.
 * @param {function} [deps.persist] - (task) => void, called after every step so
 *   progress survives an interruption (Phase 6 "resume" requirement).
 * @returns {Promise<object>} the mutated task.
 */
async function run(task, deps = {}) {
    if (!task) throw new TypeError("taskExecutor.run() requires a task.");
    if (!Array.isArray(task.steps) || task.steps.length > 32 || !Number.isInteger(task.currentStep) || task.currentStep < 0 || task.currentStep > task.steps.length) {
        task.status = "failed";
        task.error = "Invalid task plan: at most 32 steps and a valid continuation position are required.";
        task.updatedAt = nowIso();
        if (deps.persist) deps.persist(task);
        return task;
    }
    const budgetMs = Number.isFinite(deps.taskTimeoutMs) ? Math.max(1, Math.min(deps.taskTimeoutMs, 300000)) : 180000;
    const deadline = Date.now() + budgetMs;

    if (task.requiresApproval && !safetyGate.isApproved(task)) {
        task.status = "waiting_approval";
        task.updatedAt = nowIso();
        if (deps.persist) deps.persist(task);
        return task;
    }

    task.status = "running";
    task.updatedAt = nowIso();
    if (deps.persist) deps.persist(task);

    for (let i = task.currentStep; i < task.steps.length; i++) {
        const persisted = typeof deps.getTaskState === "function" ? deps.getTaskState(task.taskId) : null;
        if (persisted?.status === "cancelled") {
            task.status = "cancelled";
            task.currentStep = i;
            task.updatedAt = nowIso();
            if (deps.persist) deps.persist(task);
            return task;
        }
        if (persisted?.status === "paused") {
            task.status = "paused";
            task.currentStep = i;
            task.updatedAt = nowIso();
            if (deps.persist) deps.persist(task);
            return task;
        }
        const currentStep = task.steps[i];

        // Defense-in-depth: never run a destructive step unless the task
        // has been EXPLICITLY approved (task.approved === true), no
        // matter how it got classified or whether requiresApproval was
        // (mis)set. This check is intentionally stricter than
        // safetyGate.isApproved(), which treats an ungated task as
        // "approved" by default — that shortcut is correct for normal
        // tasks but must never protect a destructive step.
        if (safetyGate.isDestructiveStep(currentStep) && task.approved !== true) {
            task.status = "waiting_approval";
            task.currentStep = i;
            task.updatedAt = nowIso();
            if (deps.persist) deps.persist(task);
            return task;
        }

        currentStep.status = "running";

        try {
            let attempt = 0;
            while (true) {
                attempt += 1;
                try {
                    if (Date.now() >= deadline) throw Object.assign(new Error("Task time budget exceeded."), { code: "TASK_TIMEOUT" });
                    currentStep.result = await runBoundedStep(currentStep, task, deps, deadline - Date.now());
                    if (currentStep.result && currentStep.result.success === false) {
                        throw new Error(String(currentStep.result.error || currentStep.result.message || "Action failed."));
                    }
                    if (attempt > 1) currentStep.retryHistory = [...(currentStep.retryHistory || []), { attempt, status: "succeeded", at: nowIso() }];
                    break;
                } catch (error) {
                    const canRetry = currentStep.action === "run_research" && attempt < 2 && !["TASK_TIMEOUT", "TASK_CANCELLED"].includes(error.code);
                    if (canRetry) {
                        currentStep.retryHistory = [...(currentStep.retryHistory || []), { attempt, status: "failed", error: String(error?.message || error).slice(0, 300), at: nowIso() }];
                        const state = typeof deps.getTaskState === "function" ? deps.getTaskState(task.taskId) : null;
                        if (state?.status === "cancelled" || state?.status === "paused") throw error;
                        if (deps.persist) deps.persist(task);
                        continue;
                    }
                    throw error;
                }
            }
            currentStep.status = "completed";
        } catch (error) {
            currentStep.status = error.code === "TASK_CANCELLED" ? "cancelled" : "failed";
            currentStep.error = error && error.message ? error.message : String(error);
            task.status = currentStep.status;
            task.error = currentStep.error;
            task.currentStep = i;
            task.updatedAt = nowIso();
            if (deps.persist) deps.persist(task);
            return task;
        }

        const afterAction = typeof deps.getTaskState === "function" ? deps.getTaskState(task.taskId) : null;
        if (afterAction?.status === "cancelled") {
            task.currentStep = i + 1;
            task.status = "cancelled";
            task.updatedAt = nowIso();
            if (deps.persist) deps.persist(task);
            return task;
        }

        task.currentStep = i + 1;
        task.updatedAt = nowIso();
        if (deps.persist) deps.persist(task);
    }

    task.status = "completed";
    task.result = summarize(task);
    task.updatedAt = nowIso();
    if (deps.persist) deps.persist(task);
    return task;
}

function summarize(task) {
    const lastWithResult = task.steps.slice().reverse().find((s) => s.result !== null && s.result !== undefined);
    return lastWithResult ? lastWithResult.result : { message: "Task completed with no step output." };
}

/** Dispatches a single step to the correct adapter. Never executes fetched content. */
async function executeStep(currentStep, task, deps) {
    switch (currentStep.action) {
        case "respond_conversationally":
            return { message: "Acknowledged." };

        case "validate_system_request":
        case "validate_application_request":
        case "validate_browser_request":
        case "validate_research_request":
        case "validate_memory_request":
            return { validated: true };

        case "record_result":
        case "record_result_from_research":
            return { recorded: true };

        case "execute_application_action": {
            const target = extractLastValidatedTarget(task, currentStep);

            // Prefer the Phase 7 systemActionAdapter (real allowlisted
            // launcher) when injected; fall back to Phase 6's generic
            // deps.system.openApplication() mock/adapter otherwise so
            // Phase 6 behavior/tests are unaffected.
            if (deps.systemAdapter && typeof deps.systemAdapter.openApplication === "function") {
                return await deps.systemAdapter.openApplication(target);
            }
            if (!deps.system || typeof deps.system.openApplication !== "function") {
                throw new Error("No application-action adapter available.");
            }
            return await deps.system.openApplication(target);
        }

        case "execute_browser_action": {
            const target = extractLastValidatedTarget(task, currentStep);

            // Prefer the Phase 7 browserActionAdapter when injected;
            // fall back to Phase 6's generic deps.browser.open() otherwise.
            if (deps.browserAdapter && typeof deps.browserAdapter.open === "function") {
                return await deps.browserAdapter.open(target);
            }
            if (!deps.browser || typeof deps.browser.open !== "function") {
                throw new Error("No browser adapter available.");
            }
            return await deps.browser.open(target);
        }

        case "run_research": {
            if (!deps.research || typeof deps.research.research !== "function") {
                throw new Error("No research provider available.");
            }
            const query = extractQuery(task);
            try {
                return await deps.research.research({ name: query }, { signal: deps.signal });
            } catch (error) {
                // Research is useful context for a presentation, not a
                // prerequisite for creating the requested file. Preserve the
                // source failure and continue to the existing PPT pipeline.
                if (task.category !== "presentation") throw error;
                const message = String(error?.message || error).slice(0, 400);
                return {
                    source: "multi-source-research",
                    query,
                    findings: [],
                    results: [{ source: "research-provider", success: false, url: null, error: message }],
                    succeededSources: [],
                    failedSources: [{ source: "research-provider", error: message }]
                };
            }
        }

        case "create_presentation": {
            if (!deps.presentation || typeof deps.presentation.create !== "function") {
                throw new Error("The existing presentation generator is not available to the task agent.");
            }
            const description = String(currentStep.description || "");
            const topic = description.match(/about:\s*(.+?)\.?$/i)?.[1]?.trim() || task.metadata?.presentationTopic;
            if (!topic) throw new Error("The presentation topic could not be recovered from the original request.");
            const research = findStepResult(task, "run_research");
            const result = await deps.presentation.create(topic, {
                userRequest: task.userRequest,
                signal: deps.signal,
                research: research || null,
                sources: Array.isArray(research?.results) ? research.results.filter(source => source?.success && /^https:\/\//i.test(String(source.url || ""))) : []
            });
            if (!result || result.success === false) throw new Error(String(result?.error || "Presentation generation failed without a verified result."));
            const filePath = String(result.path || result.filePath || "").trim();
            if (!filePath) throw new Error("The presentation generator returned no saved-file path; completion was not recorded.");
            return { ...result, path: filePath, source: "existing-pptx-generator", researchStatus: research?.succeededSources?.length ? "sources-found" : "sources-unavailable" };
        }

        case "normalize_result": {
            const prior = findStepResult(task, "run_research");
            if (!prior) return { normalized: false };
            return {
                normalized: true,
                query: prior.query || null,
                findings: Array.isArray(prior.findings) ? prior.findings : [],
                provenance: Array.isArray(prior.results) ? prior.results : []
            };
        }

        case "execute_memory_action":
            return await executeMemoryAction(task, deps);

        case "locate_task":
            return locateReferencedTask(task, deps);

        case "resume_or_report":
            return { status: "see_locate_task_result" };

        case "query_goal_registry": {
            if (!deps.goalRegistry || typeof deps.goalRegistry.getSummary !== "function") {
                throw new Error("No goalRegistry available.");
            }
            return deps.goalRegistry.getSummary();
        }

        case "delegate_to_evolution_engine": {
            if (!deps.evolutionEngine || typeof deps.evolutionEngine.start !== "function") {
                throw new Error("No EvolutionEngine available.");
            }
            return await deps.evolutionEngine.start();
        }

        case "await_or_report_approval": {
            if (!deps.evolutionEngine || typeof deps.evolutionEngine.getState !== "function") {
                throw new Error("No EvolutionEngine available.");
            }
            return deps.evolutionEngine.getState();
        }

        case "reject_unsupported":
            throw new Error("This request is not supported by the deterministic assistant.");

        default:
            if (currentStep.action.startsWith("system_")) {
                const canonicalAction = currentStep.action.replace(/^system_/, "");

                // Prefer the Phase 7 systemActionAdapter's specific methods
                // (shutdown/restart/sleep/lock/logoff/terminateProcess/...)
                if (deps.systemAdapter) {
                    if (typeof deps.systemAdapter[canonicalAction] === "function") {
                        return await deps.systemAdapter[canonicalAction]({ approved: task.approved === true });
                    }
                    if (typeof deps.systemAdapter.runPowerCommand === "function") {
                        return await deps.systemAdapter.runPowerCommand(canonicalAction, { approved: task.approved === true });
                    }
                }

                // Fall back to Phase 6's generic deps.system.execute() mock/adapter.
                if (!deps.system || typeof deps.system.execute !== "function") {
                    throw new Error("No system adapter available.");
                }
                return await deps.system.execute(canonicalAction);
            }

            if (currentStep.action.startsWith("browser_")) {
                const canonicalAction = currentStep.action.replace(/^browser_/, "");

                if (!deps.browserAdapter || typeof deps.browserAdapter[canonicalAction] !== "function") {
                    throw new Error(`No browser adapter method for "${canonicalAction}".`);
                }

                const isDestructive = safetyGate.isDestructiveStep(currentStep);
                return isDestructive
                    ? await deps.browserAdapter[canonicalAction]({ approved: task.approved === true })
                    : await deps.browserAdapter[canonicalAction]();
            }

            throw new Error(`Unknown step action: ${currentStep.action}`);
    }
}

function findStepResult(task, action) {
    const found = task.steps.find((s) => s.action === action && s.result);
    return found ? found.result : null;
}

function extractLastValidatedTarget(task, currentStep) {
    const match = String(currentStep.description || "").match(/:\s*(.+?)\.?$/);
    return match ? match[1] : task.userRequest;
}

function extractQuery(task) {
    const validateStep = task.steps.find((s) => s.action === "validate_research_request");
    if (validateStep) {
        const match = String(validateStep.description || "").match(/query:\s*(.+?)\.?$/);
        if (match) return match[1];
    }
    return task.userRequest;
}

async function executeMemoryAction(task, deps) {
    if (!deps.memory) throw new Error("No memory adapter available.");

    const text = String(task.userRequest || "").toLowerCase();

    // Order matters: "what do you remember" / "do you remember" contain
    // the word "remember" but are RECALL requests, not a command to
    // store something — so forget/imperative-remember are matched by
    // more specific anchored patterns first, and anything else falls
    // through to recall.
    if (/\bforget\b/.test(text)) {
        const key = task.metadata && task.metadata.memoryKey;
        if (!key) return { action: "forget", skipped: true, reason: "No memory key resolved." };
        return { action: "forget", ...deps.memory.forget(key) };
    }
    if (/^remember\b/.test(text) || /\bremember that\b/.test(text) || /\bremember my\b/.test(text)) {
        const key = task.metadata && task.metadata.memoryKey;
        const value = task.metadata && task.metadata.memoryValue;
        if (!key || value === undefined) {
            return { action: "remember", skipped: true, reason: "No key/value resolved for remember." };
        }
        return { action: "remember", ...deps.memory.remember(key, value) };
    }
    // recall / "what do you remember" / "do you remember"
    const key = task.metadata && task.metadata.memoryKey;
    if (key) {
        return { action: "recall", value: deps.memory.recall(key) };
    }
    if (typeof deps.memory.search === "function") {
        return { action: "recall_all", results: deps.memory.search("", { limit: 50 }) };
    }
    return { action: "recall", value: null };
}

function locateReferencedTask(task, deps) {
    if (!deps.taskStore) throw new Error("No task store available to locate previous tasks.");

    const referencedId = task.metadata && task.metadata.referencedTaskId;
    const all = deps.taskStore.getAll().filter((t) => t.taskId !== task.taskId);

    const target = referencedId
        ? deps.taskStore.getById(referencedId)
        : all
              .slice()
              .reverse()
              .find((t) => t.status === "paused" || t.status === "running" || t.status === "waiting_approval");

    if (!target) {
        return { found: false, message: "No resumable previous task found." };
    }

    return {
        found: true,
        taskId: target.taskId,
        status: target.status,
        currentStep: target.currentStep,
        totalSteps: target.totalSteps
    };
}

module.exports = { run, executeStep, summarize };
