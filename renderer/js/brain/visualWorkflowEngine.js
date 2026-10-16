"use strict";

/*
 * Adaptive visual workflows.
 *
 * This is intentionally bounded: it can rescan and retry a step, but it
 * cannot loop forever or bypass Computer Use approval. A low-confidence
 * target is a pause point, not a guessed click.
 */
(function () {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    let activeRun = null;
    const MEMORY_KEY = "jarvis.task-memory.v1";
    const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
    function readTaskMemory() {
        try {
            const storage = window.localStorage;
            const value = JSON.parse(storage?.getItem(MEMORY_KEY) || "[]");
            return Array.isArray(value) ? value.slice(0, 20) : [];
        } catch (_) { return []; }
    }
    function writeTaskMemory(records) {
        try { window.localStorage?.setItem(MEMORY_KEY, JSON.stringify(records.slice(0, 20))); } catch (_) { /* memory is best-effort */ }
    }
    function rememberTask(workflowName, checkpoints, durationMs, undoSteps, planSteps) {
        const records = readTaskMemory();
        records.unshift({
            id: `task-${Date.now()}`,
            workflow: workflowName,
            completed: checkpoints.map(({ label, target, verified }) => ({ label, target, verified })),
            plan: planSteps.map(({ label, target, action, text, key, keys, alternatives, verify, readyWhen, afterMs }) => ({ label, target, action, text, key, keys, alternatives, verify, readyWhen, afterMs })),
            reversible: Array.isArray(undoSteps) && undoSteps.length > 0,
            undoSteps: Array.isArray(undoSteps) ? undoSteps.slice(0, 10) : [],
            durationMs: Number(durationMs) || 0,
            completedAt: new Date().toISOString()
        });
        writeTaskMemory(records);
        try { window.JARVISWorkflowRecorder?.captureCompleted?.(records[0]); } catch (_) {}
        try { window.JARVISMissionAudit?.record?.({ type: "workflow", state: "completed", summary: workflowName }); } catch (_) {}
        return records[0];
    }
    function getTaskMemory(limit = 10) { return readTaskMemory().slice(0, bounded(limit, 10, 1, 20)); }
    function clearTaskMemory() { writeTaskMemory([]); return { success: true }; }
    function forgetLastTask() {
        const records = readTaskMemory();
        if (!records.length) return { success: false, error: "There is no completed task in memory." };
        records.shift();
        writeTaskMemory(records);
        return { success: true };
    }
    function cancel() { if (activeRun) activeRun.cancelled = true; }
    function checkActive(token) {
        if (token?.cancelled || (token && !window.JARVISComputerUse?.isActive?.())) throw new Error("Workflow cancelled. No further actions will run.");
        if (token?.autopilot && window.JARVISComputerUse?.isAutopilotActive && !window.JARVISComputerUse.isAutopilotActive()) throw new Error("Autopilot paused. Say resume Autopilot to continue.");
    }

    function buildPlan(workflow) {
        const rawSteps = Array.isArray(workflow?.steps) ? workflow.steps : [];
        const steps = rawSteps.map((raw, index) => {
            const step = raw && typeof raw === "object" ? { ...raw } : {};
            const action = ["typeText", "pressKey", "hotkey"].includes(step.action) ? step.action : "click";
            const target = String(step.target || "").trim();
            const alternatives = Array.isArray(step.alternatives)
                ? step.alternatives.map(value => String(value || "").trim()).filter(Boolean)
                : [];
            return {
                ...step,
                label: String(step.label || `step ${index + 1}`),
                target,
                action,
                alternatives: [...new Set([target, ...alternatives])].filter(Boolean).slice(0, 5)
            };
        });
        const invalid = steps.find(step => !step.target && !["pressKey", "hotkey"].includes(step.action));
        if (invalid) return { success: false, error: `The ${invalid.label} step has no visual target.` };
        return {
            success: true,
            name: String(workflow?.name || "adaptive visual workflow"),
            steps,
            total: steps.length
        };
    }

    function notify(workflow, payload, onStep) {
        try { onStep(payload); } catch (_) { /* telemetry must never break a safe workflow */ }
        try { window.JARVISComputerUse?.setWorkflowStatus?.(payload); } catch (_) { /* optional UI */ }
        try {
            const summary = payload?.label || payload?.error || payload?.state || workflow?.name || workflow?.workflow || "workflow event";
            window.JARVISMissionAudit?.record?.({
                type: "workflow-step",
                state: payload?.state || "updated",
                summary: String(summary).slice(0, 160),
                confidence: payload?.confidence
            });
        } catch (_) { /* audit is best-effort and must never interrupt a safe workflow */ }
    }

    async function waitForTarget(target, options = {}) {
        const vision = window.JARVISScreenShare;
        if (!vision?.locateTarget) return { success: false, error: "Screen target verification is unavailable." };
        const expectedVisible = options.visible !== false;
        const attempts = bounded(options.attempts, 2, 1, 3);
        const minConfidence = Math.max(0.45, Math.min(0.95, Number(options.minConfidence) || 0.55));
        let last = null;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            checkActive(options.token);
            try { last = await vision.locateTarget(target); }
            catch (error) { last = { success: false, error: error?.message || "Screen inspection failed." }; }
            checkActive(options.token);
            const confidence = Number(last?.confidence) || 0;
            const visible = last?.success === true && last?.visible === true && confidence >= minConfidence;
            const hidden = last?.success === true && last?.visible === false && last?.observedVisible !== true;
            if (expectedVisible ? visible : hidden) {
                return { success: true, visible, confidence, target, observation: last, attempt };
            }
            if (attempt < attempts) await sleep(bounded(options.retryDelayMs, 650, 0, 5000));
        }
        return {
            success: false,
            visible: last?.visible === true,
            confidence: Number(last?.confidence) || 0,
            target,
            observation: last,
            error: expectedVisible
                ? `I could not verify that ${target} is visible.`
                : `I could not verify that ${target} disappeared.`
        };
    }

    async function explainFailure(step, result) {
        const vision = window.JARVISScreenShare;
        if (!vision?.understandState) return result;
        try {
            const state = await vision.understandState(step.stateQuestion || `Why could the workflow step “${step.label || step.target || "current step"}” not be completed?`);
            if (state?.success && state.reason) {
                return { ...result, screenState: state, error: `${result.error} ${state.reason}`.trim() };
            }
        } catch (_) { /* diagnostics are best-effort; the safe failure remains authoritative */ }
        return result;
    }

    async function run(workflow, options = {}) {
        const plan = buildPlan(workflow);
        const steps = plan.steps || [];
        const computer = window.JARVISComputerUse;
        if (!plan.success) return plan;
        if (!steps.length) return { success: false, error: "Visual workflow has no steps." };
        if (steps.length > 20) return { success: false, error: "Split this workflow into at most 20 steps." };
        if (window.JARVISPermissionProfiles && !window.JARVISPermissionProfiles.allows("computer-use")) {
            return { success: false, error: "Restricted permission mode blocks Computer Use. Switch to Safe or Trusted mode first." };
        }
        if (activeRun) return { success: false, error: "Another visual workflow is already running." };
        if (!computer?.isActive?.()) return { success: false, error: "Start Computer Use before running a visual workflow." };
        if (steps.some(step => !["pressKey", "hotkey"].includes(step.action)) && typeof computer.locateAndApproveClick !== "function") return { success: false, error: "Visual target control is unavailable in this build." };

        const checkpoints = [];
        const maxAttempts = bounded(options.maxAttempts, 2, 1, 3);
        const onStep = typeof options.onStep === "function" ? options.onStep : () => {};
        const workflowName = plan.name;
        const startedAt = Date.now();
        const token = { cancelled: false, autopilot: computer.isAutopilotActive?.() === true };
        activeRun = token;
        try {
        notify(workflow, { workflow: workflowName, state: "planning", total: steps.length, plan: steps.map(step => ({ label: step.label, action: step.action, target: step.target })) }, onStep);
        notify(workflow, { workflow: workflowName, state: "started", total: steps.length }, onStep);

        for (let index = 0; index < steps.length; index++) {
            checkActive(token);
            const step = steps[index] || {};
            const label = String(step.label || `step ${index + 1}`);
            const target = String(step.target || "the requested control");
            let result = null;
            const readyWhen = step.readyWhen || step.precondition;
            if (readyWhen) {
                const ready = await waitForTarget(String(readyWhen.target || readyWhen), {
                    token,
                    visible: readyWhen.visible !== false,
                    attempts: readyWhen.attempts || 2,
                    minConfidence: readyWhen.minConfidence,
                    retryDelayMs: readyWhen.retryDelayMs ?? options.retryDelayMs
                });
                if (!ready.success) {
                    const failure = await explainFailure(step, { success: false, completed: checkpoints, failedStep: label, error: ready.error });
                    notify(workflow, { workflow: workflowName, index, total: steps.length, label, state: "blocked", error: failure.error }, onStep);
                    return failure;
                }
            }
            for (let attempt = 1; attempt <= Math.min(maxAttempts, Math.max(1, Number(step.maxAttempts) || maxAttempts)); attempt++) {
                checkActive(token);
                notify(workflow, { workflow: workflowName, index, total: steps.length, label, attempt, state: "locating" }, onStep);
                const targetQueries = [target, ...(Array.isArray(step.alternatives) ? step.alternatives : [])]
                    .map(value => String(value || "").trim()).filter((value, position, values) => value && values.indexOf(value) === position).slice(0, 5);
                result = null;
                if (["pressKey", "hotkey"].includes(step.action)) {
                    const params = step.action === "hotkey"
                        ? { keys: Array.isArray(step.keys) ? step.keys.slice(0, 4) : [] }
                        : { key: String(step.key || "ENTER") };
                    const direct = typeof computer.performFocusedAction === "function"
                        ? computer.performFocusedAction(step.action, params, `${step.action === "hotkey" ? "Press" : "Press key"} for ${label}`)
                        : computer.perform(step.action, params);
                    result = await direct;
                } else {
                    for (const targetQuery of targetQueries) {
                        result = step.action === "typeText" && typeof computer.locateAndApproveType === "function"
                            ? await computer.locateAndApproveType(targetQuery, step.text)
                            : await computer.locateAndApproveClick(targetQuery);
                        if (result?.success || result?.actionAttempted || result?.retryable === false || /cancelled|declined|approval/i.test(String(result?.error || ""))) break;
                    }
                }
                checkActive(token);
                if (result?.success) {
                    await sleep(bounded(step.afterMs ?? options.afterMs, 700, 0, 10000));
                    checkActive(token);
                    const verification = step.verify || step.postcondition;
                    // Native foreground apps can accept text even when their
                    // custom editor is absent from UI Automation. If no
                    // vision stream exists, do not turn a successful focused
                    // SendInput action into a false failure by demanding a
                    // second visual confirmation that is impossible here.
                    // A focused native editor can accept SendInput while
                    // deliberately exposing no Edit/Document node (current
                    // Notepad is a common example). The action has already
                    // succeeded in that case; requiring a second visual or
                    // UIA confirmation creates the false "Windows did not
                    // confirm this action" response. Keep this independent
                    // of screen-share state because a vision stream still
                    // cannot prove text in an editor that is absent from UIA.
                    const nativeOnlyAction = result?.focusedAppFallback === true;
                    if (verification && !nativeOnlyAction) {
                        notify(workflow, { workflow: workflowName, index, total: steps.length, label, attempt, state: "verifying" }, onStep);
                        const verified = await waitForTarget(String(verification.target || verification), {
                            token,
                            visible: verification.visible !== false,
                            attempts: verification.attempts || 2,
                            minConfidence: verification.minConfidence,
                            retryDelayMs: verification.retryDelayMs ?? options.retryDelayMs
                        });
                        if (!verified.success) {
                            // A real click may have landed even when vision could not confirm it.
                            // Never repeat an ambiguous side effect automatically.
                            result = { success: false, error: `${label} ran, but I could not verify the expected next state. I stopped safely.` };
                            notify(workflow, { workflow: workflowName, index, total: steps.length, label, attempt, state: "ambiguous", error: result.error }, onStep);
                            break;
                        }
                    }
                    checkpoints.push({ label, target, attempt, verified: Boolean(verification && !nativeOnlyAction), nativeOnly: nativeOnlyAction, at: Date.now() });
                    notify(workflow, { workflow: workflowName, index, total: steps.length, label, attempt, state: "completed", verified: Boolean(verification) }, onStep);
                    break;
                }
                notify(workflow, { workflow: workflowName, index, total: steps.length, label, attempt, state: "retrying", error: result?.error || "target/action failed" }, onStep);
                if (result?.retryable === false || result?.actionAttempted || /cancelled|declined|approval/i.test(String(result?.error || ""))) break;
                await sleep(bounded(step.retryDelayMs ?? options.retryDelayMs, 900, 0, 5000));
            }
            if (!result?.success) {
                checkActive(token);
                if (/cancelled|declined|approval/i.test(String(result?.error || ""))) return { success: false, completed: checkpoints, cancelled: true, error: result.error };
                const failure = await explainFailure(step, { success: false, completed: checkpoints, failedStep: label, error: result?.error || `The ${label} step could not be completed.` });
                notify(workflow, { workflow: workflowName, index, total: steps.length, label, state: "failed", error: failure.error }, onStep);
                return failure;
            }
        }
        const durationMs = Date.now() - startedAt;
        const completed = { success: true, completed: checkpoints, workflow: workflowName, durationMs, nativeOnly: checkpoints.some(step => step.nativeOnly === true) };
        const memory = rememberTask(workflowName, checkpoints, durationMs, workflow?.undoSteps, steps);
        notify(workflow, { workflow: workflowName, state: "completed", completed: checkpoints.length, total: steps.length }, onStep);
        return { ...completed, memory };
        } catch (error) {
            const failure = { success: false, completed: checkpoints, cancelled: token.cancelled || !computer.isActive(), error: error?.message || "Workflow stopped because an action outcome could not be confirmed." };
            notify(workflow, { workflow: workflowName, state: "failed", error: failure.error }, onStep);
            return failure;
        } finally { if (activeRun === token) activeRun = null; }
    }

    async function undoLast(options = {}) {
        const last = getTaskMemory(1)[0];
        if (!last) return { success: false, error: "There is no completed task in memory." };
        if (!last.reversible || !last.undoSteps?.length) return { success: false, error: "The last task is remembered, but it has no safe undo action." };
        return run({ name: `undo ${last.workflow}`, steps: last.undoSteps }, options);
    }
    window.JARVISVisualWorkflow = Object.freeze({ buildPlan, plan: buildPlan, run, undoLast, replayLast: (options = {}) => {
        const last = getTaskMemory(1)[0];
        if (!last?.plan?.length) return Promise.resolve({ success: false, error: "There is no replayable task in memory." });
        return run({ name: `replay ${last.workflow}`, steps: last.plan }, options);
    }, getTaskMemory, forgetLastTask, clearTaskMemory, waitForTarget, cancel, isRunning: () => Boolean(activeRun) });
})();
