"use strict";

(() => {
    const api = window.jarvis?.computerUse;
    const button = document.getElementById("jarvisComputerUseButton");
    if (!api || !button) return;

    const panel = document.createElement("section");
    panel.className = "jarvis-computer-use-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "JARVIS Autopilot Mode controls");
    panel.innerHTML = `
        <header>
            <div><span class="computer-use-kicker">JARVIS AUTOPILOT MODE</span><strong data-cu-status>OFF</strong></div>
            <button type="button" data-cu-stop class="computer-use-stop">Emergency stop</button>
        </header>
        <p class="computer-use-note">Speak naturally and tell JARVIS what you want. It finds the app, asks before risky actions, and checks each result. You do not need to use coordinates.</p>
        <div class="computer-use-access-banner" data-cu-access-banner data-active="false"><span class="computer-use-kicker">AUTOPILOT · VOICE FIRST</span><strong>Just say what you want done</strong><small>Screen watch stays active while selected · “Open Microsoft Store and search cloud” · “Open Minecraft” · “Click Play” · “Pause Autopilot” · “Resume Autopilot”</small><button type="button" data-cu-access-toggle>Start Autopilot Mode</button></div>
        <div class="computer-use-voice-guide" aria-label="Voice command examples"><span>VOICE READY</span><button type="button" data-cu-voice-example="click the Play button">“click Play”</button><button type="button" data-cu-voice-example="select the first world">“select first world”</button><button type="button" data-cu-voice-example="inspect the current screen">“inspect screen”</button></div>
        <div class="computer-use-workflow-status" data-cu-workflow-status hidden aria-live="polite"><span class="computer-use-kicker">ADAPTIVE WORKFLOW</span><strong data-cu-workflow-label>Ready</strong><small data-cu-workflow-detail>State-aware planning is idle.</small></div>
        <div class="computer-use-mission-board" data-cu-mission-board hidden aria-live="polite"><div><span class="computer-use-kicker">MISSION CONTROL · EVENT MODE</span><strong data-cu-mission-title>Ready for a live demo</strong></div><div class="computer-use-mission-steps" data-cu-mission-steps></div><small data-cu-mission-proof>Every action is approval-gated and screen-verified.</small></div>
        <div class="computer-use-intelligence-card" data-cu-intelligence hidden aria-live="polite"><div><span class="computer-use-kicker">JARVIS DECISION EVIDENCE</span><strong data-cu-intelligence-headline>Waiting for a mission</strong></div><div class="computer-use-intelligence-metrics"><span><b data-cu-intent>—</b><small>INTENT</small></span><span><b data-cu-confidence>—</b><small>CONFIDENCE</small></span><span><b data-cu-verification>—</b><small>VERIFICATION</small></span></div><small data-cu-intelligence-reason>JARVIS will show why it selected a target and how it confirmed the result.</small></div>
        <div class="computer-use-task-memory" data-cu-task-memory hidden><span class="computer-use-kicker">TASK MEMORY</span><strong data-cu-task-memory-label>No completed task yet</strong><small data-cu-task-memory-detail>Completed workflows will appear here.</small><div class="computer-use-task-memory-actions"><button type="button" data-cu-replay-last>Run again safely</button><button type="button" data-cu-undo-last disabled>Undo last reversible task</button></div></div>
        <div class="computer-use-row computer-use-vision-row">
            <input data-cu-inspect-query type="text" maxlength="300" placeholder="What should JARVIS inspect?">
            <button type="button" data-cu-inspect>Inspect screen</button>
        </div>
        <div class="computer-use-row computer-use-target-row">
            <input data-cu-target-query type="text" maxlength="200" placeholder="Target to locate, e.g. Save button">
            <button type="button" data-cu-locate>Locate target</button>
        </div>
        <div class="computer-use-grid">
            <label>X <input data-cu-x type="number" min="0" max="32767" value="500"></label>
            <label>Y <input data-cu-y type="number" min="0" max="32767" value="300"></label>
            <label>X₂ <input data-cu-x2 type="number" min="0" max="32767" value="800"></label>
            <label>Y₂ <input data-cu-y2 type="number" min="0" max="32767" value="500"></label>
            <button type="button" data-cu-click>Click</button>
            <button type="button" data-cu-double>Double-click</button>
            <button type="button" data-cu-right>Right-click</button>
            <button type="button" data-cu-drag>Drag</button>
            <button type="button" data-cu-scroll>Scroll down</button>
        </div>
        <div class="computer-use-row">
            <input data-cu-text type="text" maxlength="2000" placeholder="Text to type after confirmation…">
            <button type="button" data-cu-type>Type</button>
        </div>
        <div class="computer-use-row">
            <input data-cu-key type="text" maxlength="12" placeholder="Key, e.g. Enter or Tab">
            <button type="button" data-cu-key-press>Press key</button>
        </div>
        <p class="computer-use-feedback" data-cu-feedback aria-live="polite">Start the session to enable controls.</p>
        <div class="computer-use-confirm" data-cu-confirm hidden role="dialog" aria-modal="true" aria-labelledby="cuConfirmTitle">
            <div class="computer-use-confirm-card">
                <span class="computer-use-kicker">ACTION APPROVAL</span>
                <h3 id="cuConfirmTitle">Allow this desktop action?</h3>
                <p data-cu-confirm-detail></p>
                <div class="computer-use-confirm-actions"><button type="button" data-cu-confirm-cancel>Cancel</button><button type="button" data-cu-confirm-allow>Allow once</button></div>
            </div>
        </div>`;
    document.body.appendChild(panel);

    const focusFrame = document.createElement("div");
    focusFrame.className = "computer-use-focus-frame";
    focusFrame.hidden = true;
    focusFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(focusFrame);

    const by = (selector) => panel.querySelector(selector);
    const state = { active: false, accessMode: false, epoch: 0, busy: false, cancelApproval: null, watchTimer: null, watchInFlight: false, lastObservation: null };
    const normalizeWindow = value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    const setFeedback = (text, kind = "") => {
        const element = by("[data-cu-feedback]");
        element.textContent = String(text || "");
        element.dataset.kind = kind;
    };
    function setWorkflowStatus(event = {}) {
        const card = by("[data-cu-workflow-status]");
        const label = by("[data-cu-workflow-label]");
        const detail = by("[data-cu-workflow-detail]");
        if (!card || !label || !detail) return;
        const state = String(event.state || "");
        if (!state || state === "idle") {
            card.hidden = true;
            return;
        }
        card.hidden = false;
        const names = {
            planning: "Planning",
            started: "Planning",
            locating: "Locating target",
            verifying: "Verifying result",
            retrying: "Re-scanning",
            completed: "Step complete",
            ambiguous: "Paused safely",
            blocked: "Waiting for screen",
            failed: "Stopped safely"
        };
        label.textContent = names[state] || state.toUpperCase();
        const progress = Number.isFinite(Number(event.index)) ? ` · step ${Number(event.index) + 1}/${event.total || "?"}` : "";
        detail.textContent = `${event.label || event.workflow || "Adaptive workflow"}${progress}${event.error ? ` · ${event.error}` : ""}`;
        card.dataset.state = state;
        const mission = by("[data-cu-mission-board]");
        const missionTitle = by("[data-cu-mission-title]");
        const missionSteps = by("[data-cu-mission-steps]");
        if (mission && missionTitle && missionSteps) {
            mission.hidden = false;
            mission.dataset.state = state;
            missionTitle.textContent = state === "completed" ? "Mission completed · evidence captured" : state === "failed" || state === "ambiguous" ? "Mission paused safely" : `${event.workflow || "Live mission"} · ${state}`;
            if (Array.isArray(event.plan)) missionSteps.innerHTML = event.plan.map(step => `<span data-state="planned">${String(step.label || step.target || "Step").replace(/[<>]/g, "")}</span>`).join("");
            if (Number.isFinite(Number(event.index))) {
                const current = missionSteps.children[Number(event.index)];
                if (current) current.dataset.state = state === "completed" ? "done" : state;
            }
            if (state === "completed") Array.from(missionSteps.children).forEach(step => { step.dataset.state = "done"; });
        }
        const evidence = by("[data-cu-intelligence]");
        const evidenceHeadline = by("[data-cu-intelligence-headline]");
        const intent = by("[data-cu-intent]");
        const confidence = by("[data-cu-confidence]");
        const verification = by("[data-cu-verification]");
        const reason = by("[data-cu-intelligence-reason]");
        if (evidence && evidenceHeadline && intent && confidence && verification && reason) {
            evidence.hidden = false;
            const workflow = String(event.workflow || event.label || "Computer Use mission");
            evidenceHeadline.textContent = state === "completed" ? "Decision verified" : state === "ambiguous" || state === "failed" ? "Safe pause · no guess made" : "Decision trace live";
            intent.textContent = workflow.slice(0, 28);
            const rawConfidence = Number(event.confidence ?? event.targetConfidence);
            confidence.textContent = Number.isFinite(rawConfidence) ? `${Math.round((rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence))}%` : "GATED";
            verification.textContent = state === "completed" ? "PASSED" : state === "verifying" ? "CHECKING" : state === "ambiguous" || state === "failed" ? "BLOCKED" : "PENDING";
            reason.textContent = event.error ? `Reason: ${String(event.error).slice(0, 180)}` : state === "completed" ? "The expected screen state was observed after the approved action." : "Target selection, approval, and screen state are tracked before completion.";
        }
        refreshTaskMemory();
    }
    function refreshTaskMemory() {
        const card = by("[data-cu-task-memory]");
        const label = by("[data-cu-task-memory-label]");
        const detail = by("[data-cu-task-memory-detail]");
        const undo = by("[data-cu-undo-last]");
        const recent = window.JARVISVisualWorkflow?.getTaskMemory?.(1)?.[0];
        if (!card || !label || !detail || !undo) return;
        card.hidden = !recent;
        if (!recent) return;
        label.textContent = recent.workflow || "Completed workflow";
        detail.textContent = `${recent.completed?.length || 0} verified step(s) remembered${recent.reversible ? " · undo available" : " · no safe undo"}`;
        undo.disabled = !recent.reversible;
    }
    function stopAutopilotWatch() {
        if (state.watchTimer) window.clearInterval(state.watchTimer);
        state.watchTimer = null;
        state.watchInFlight = false;
    }
    function startAutopilotWatch() {
        stopAutopilotWatch();
        const vision = window.JARVISScreenShare;
        if (!vision?.understandState) return;
        const inspect = async () => {
            // A workflow owns the screen while it is locating, acting, and
            // verifying. Do not let the background observer capture the same
            // frame or compete for the vision provider during that window.
            // Native UI Automation is a first-class observation source. Do
            // not gate the watcher on a media stream: voice-first Autopilot
            // deliberately stays native-only when capture is unavailable.
            if (!state.active || !state.accessMode || state.busy || state.watchInFlight) return;
            state.watchInFlight = true;
            try {
                const result = await vision.understandState("Continuously monitor the desktop for Autopilot. Identify the active app and whether a requested control is clearly visible. Do not perform or recommend an action automatically.");
                if (state.active && state.accessMode && result?.success) {
                    state.lastObservation = result;
                    const blocker = result.blocker ? ` · ${result.blocker}` : "";
                    setFeedback(`Autopilot watching screen · ${result.app || "desktop"} · ${result.screen || "state observed"}${blocker}`, result.ready === false && result.blocker ? "error" : "ok");
                }
            } catch (_) {
                // Monitoring is best-effort; it must never interrupt a command.
            } finally { state.watchInFlight = false; }
        };
        inspect();
        state.watchTimer = window.setInterval(inspect, 5500);
    }
    const values = () => ({ x: Number(by("[data-cu-x]").value), y: Number(by("[data-cu-y]").value) });
    const dragValues = () => ({ ...values(), x2: Number(by("[data-cu-x2]").value), y2: Number(by("[data-cu-y2]").value) });
    const unwrap = (result) => result?.data && typeof result.data === "object" && result.data.action ? result.data : result;
    const wait = (ms) => new Promise(resolve => {
        const timer = window.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
        if (timer) timer(resolve, ms);
        else resolve();
    });
    async function readAccessibilityItems() {
        try {
            const result = unwrap(await api.inspectAccessibility?.());
            // IPC wrappers have existed in both flat and nested forms across
            // JARVIS builds. Normalize all of them here so a successful
            // inspection is never mistaken for an empty tree.
            const items = result?.data?.items
                || result?.data?.data?.items
                || result?.items;
            return result?.success === true && Array.isArray(items) && items.length ? items : null;
        } catch (_) { return null; }
    }
    async function readAccessibilityState() {
        try {
            const raw = unwrap(await api.inspectAccessibility?.());
            const items = raw?.data?.items || raw?.items;
            if (raw?.success !== true || !Array.isArray(items) || !items.length) {
                return { success: false, error: raw?.error || "Windows UI Automation returned no active controls." };
            }
            const focused = items.find(item => item?.keyboardFocused === true);
            const focusedWindow = String(focused?.focusedWindowName || focused?.windowName || items[0]?.windowName || "").trim();
            const fingerprint = JSON.stringify(items.map(item => [
                String(item?.name || ""), String(item?.value || ""), String(item?.controlType || ""),
                Number(item?.x) || 0, Number(item?.y) || 0, Boolean(item?.enabled), Boolean(item?.keyboardFocused), String(item?.focusedWindowName || "")
            ]));
            return { success: true, items, focusedWindow, focusedControl: focused ? { name: String(focused.name || ""), controlType: String(focused.controlType || ""), value: String(focused.value || "") } : null, fingerprint };
        } catch (error) {
            return { success: false, error: error?.message || "Windows UI Automation inspection failed." };
        }
    }
    async function waitForFocusedAccessibilityState(attempts = 3, delayMs = 80) {
        let last = { success: false, error: "Windows UI Automation did not expose the focused application." };
        for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
            last = await readAccessibilityState();
            if (last.success && last.focusedWindow) return last;
            if (attempt + 1 < attempts) await wait(delayMs);
        }
        return last;
    }
    function accessibilityContainsText(items, text) {
        const literal = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!literal || !Array.isArray(items)) return false;
        return items.some(item => String(item?.value || "").toLowerCase().replace(/\s+/g, " ").includes(literal));
    }

    async function refresh() {
        const result = unwrap(await api.status());
        state.active = result?.data?.active === true || result?.active === true;
        panel.hidden = !state.active;
        focusFrame.hidden = !state.active;
        document.body.classList.toggle("computer-use-active", state.active);
        button.setAttribute("aria-pressed", String(state.active));
        button.textContent = state.active ? "■ Control" : "⌁ Control";
        const status = by("[data-cu-status]");
        status.textContent = state.active ? "ON · SESSION ACTIVE" : "OFF";
        status.dataset.active = String(state.active);
        const banner = by("[data-cu-access-banner]");
        const accessToggle = by("[data-cu-access-toggle]");
        if (banner) banner.dataset.active = String(state.accessMode);
        if (accessToggle) accessToggle.textContent = state.accessMode ? "Autopilot Mode active" : "Start Autopilot Mode";
    }

    async function start() {
        state.epoch++;
        const result = unwrap(await api.start());
        if (result?.success === false) {
            setFeedback(result.error || "Computer Use could not start.", "error");
            return result;
        }
        await refresh();
        setFeedback("Computer Use is active. Select the target window and use one action at a time.", "ok");
        return result;
    }

    async function setAccessMode(enabled = true) {
        // Repeated calls are common: every Autopilot command ensures access
        // before acting. Do not tear down and recreate the screen watcher for
        // an already-active mode; doing that races an in-flight inspection and
        // lets stale vision results compete with the current command.
        if (enabled === true && state.accessMode === true) {
            if (!state.watchTimer) startAutopilotWatch();
            return { success: true, accessMode: true, alreadyActive: true };
        }
        if (enabled !== true && state.accessMode !== true) {
            stopAutopilotWatch();
            return { success: true, accessMode: false, alreadyInactive: true };
        }
        const epoch = state.epoch;
        state.accessMode = enabled === true;
        panel.classList.toggle("accessos-mode", state.accessMode);
        document.body.classList.toggle("accessos-mode", state.accessMode);
        if (state.accessMode) {
            const vision = window.JARVISScreenShare;
            if (vision?.start && !vision.isActive?.()) {
                try {
                    const result = await vision.start({ autopilot: true });
                    if (epoch !== state.epoch || !state.accessMode) return { success: false, error: "Autopilot start was cancelled." };
                    if (result?.success === false || !vision.isActive?.()) {
                        // Native Windows accessibility remains a complete
                        // action path for standard controls. Keep Autopilot
                        // active and downgrade only the visual fallback so a
                        // denied/unsupported capture does not break Notepad,
                        // Settings, File Explorer, and other native apps.
                        startAutopilotWatch();
                        setFeedback(`Autopilot active with native UI control. Visual screen fallback unavailable: ${result?.error || "screen sharing could not start."}`, "ok");
                        return { success: true, accessMode: true, nativeOnly: true, warning: result?.error || "Screen sharing could not start." };
                    }
                    startAutopilotWatch();
                } catch (error) {
                    startAutopilotWatch();
                    setFeedback(`Autopilot active with native UI control. Visual screen fallback unavailable: ${error?.message || "screen sharing could not start."}`, "ok");
                    return { success: true, accessMode: true, nativeOnly: true, warning: error?.message || "Screen sharing could not start." };
                }
            } else startAutopilotWatch();
        } else stopAutopilotWatch();
        refresh().catch(() => {});
        return { success: true, accessMode: state.accessMode };
    }

    async function stop() {
        state.active = false;
        state.accessMode = false;
        stopAutopilotWatch();
        state.epoch++;
        window.JARVISVisualWorkflow?.cancel?.();
        state.cancelApproval?.();
        focusFrame.hidden = true;
        document.body.classList.remove("computer-use-active");
        const result = unwrap(await api.stop());
        await refresh();
        setFeedback(result?.success === false ? (result.error || "Windows could not confirm the stop.") : "Emergency stop enabled. No more mouse or keyboard actions will run.", result?.success === false ? "error" : "ok");
        return result;
    }

    async function perform(action, params, label, forceApproval = false, expectedEpoch = state.epoch) {
        if (state.busy) return { success: false, retryable: false, error: "Another computer action is in progress." };
        if (!state.active) {
            const result = { success: false, error: "Start Computer Use first." };
            setFeedback(result.error, "error");
            return result;
        }
        state.busy = true;
        let attempted = false;
        try {
        if (expectedEpoch !== state.epoch) return { success: false, retryable: false, error: "Action cancelled because the Computer Use session changed." };
        // Autopilot is an explicit user opt-in for hands-free operation. While
        // it is active, bounded workflow actions may run without reopening a
        // mouse confirmation modal; outside Autopilot, visual clicks retain
        // their normal approval gate.
        let result;
        const fastNativeInput = action === "typeText" && params?.fastPath === true;
        const observeAfterAction = !["move", "cursor"].includes(action) && !fastNativeInput;
        const beforeState = observeAfterAction ? await readAccessibilityState() : { success: false, error: "No UI state is required for this primitive." };
        const autopilotApproved = state.accessMode && ["click", "typeText", "pressKey", "hotkey"].includes(action);
        if (forceApproval && !autopilotApproved) result = { requiresApproval: true };
        else { attempted = true; result = unwrap(await api.perform(action, params, autopilotApproved)); }
        if (result?.requiresApproval) {
            attempted = false;
            const approved = await requestApproval(label);
            if (!approved) {
                const cancelled = { success: false, error: "Action cancelled by user." };
                setFeedback(cancelled.error, "ok");
                return cancelled;
            }
            if (!state.active || expectedEpoch !== state.epoch) return { success: false, retryable: false, error: "Action cancelled because the Computer Use session stopped." };
            attempted = true;
            result = unwrap(await api.perform(action, params, true));
        }
        if (result?.success === true && fastNativeInput) {
            const verification = { verified: true, reason: "Windows accepted the focused native text input.", focusedWindow: beforeState.focusedWindow || "", focusedControl: beforeState.focusedControl };
            result = { ...result, verification, focusedAppFallback: true };
            setFeedback(`${label} completed · fast native input`, "ok");
        } else if (result?.success === true && observeAfterAction) {
            // Native UIA actions are synchronous for most desktop controls;
            // keep a brief settle window for the accessibility tree without
            // adding a full perceptible pause to every voice command.
            await wait(70);
            const afterState = await readAccessibilityState();
            const verification = !afterState.success
                ? { verified: false, reason: afterState.error, focusedWindow: beforeState.focusedWindow || "" }
                : { verified: beforeState.success && beforeState.fingerprint !== afterState.fingerprint, focusedWindow: afterState.focusedWindow || beforeState.focusedWindow || "", focusedControl: afterState.focusedControl };
            result = { ...result, verification };
            const suffix = verification.verified ? " · UI state changed" : ` · UI state not confirmed: ${verification.reason || "no observable accessibility change"}`;
            setFeedback(`${label} completed${suffix}`, verification.verified ? "ok" : "warning");
        } else {
            setFeedback(result?.success === false ? (result.error || `${label} failed.`) : `${label} completed.`, result?.success === false ? "error" : "ok");
        }
        return result?.success === true ? result : { ...result, success: false, retryable: false, actionAttempted: attempted, error: result?.error || `${label} failed before Windows reported a completed action.` };
        } catch (error) { return { success: false, retryable: false, actionAttempted: attempted, error: error?.message || "The action outcome could not be confirmed." }; }
        finally { state.busy = false; }
    }

    async function inspectScreen() {
        const vision = window.JARVISScreenShare;
        if (!vision?.analyze) {
            setFeedback("Screen inspection is unavailable in this build.", "error");
            return { success: false, error: "Screen inspection is unavailable." };
        }
        const question = by("[data-cu-inspect-query]").value.trim() || "Describe the active app and the main visible controls. Do not guess text that is not legible.";
        setFeedback("Inspecting the shared screen locally…", "");
        const result = await vision.analyze(question);
        setFeedback(result?.success ? `Screen understood: ${String(result.text || "No clear details found.").slice(0, 500)}` : (result?.error || "The screen could not be inspected."), result?.success ? "ok" : "error");
        return result;
    }

    async function locateTarget() {
        const vision = window.JARVISScreenShare;
        if (!vision?.locateTarget) {
            setFeedback("Target location is unavailable in this build.", "error");
            return { success: false, error: "Target location is unavailable." };
        }
        const query = by("[data-cu-target-query]").value.trim() || "the main actionable button";
        setFeedback("Locating the target in the shared screen…", "");
        const result = await vision.locateTarget(query);
        if (!result?.success) {
            setFeedback(result?.error || "The target could not be located.", "error");
            return result;
        }
        if (!result.visible) {
            setFeedback(`Target not clearly visible. ${result.reason || "I will not guess a coordinate."}`, "error");
            return result;
        }
        const confidence = Math.round(Number(result.confidence || 0) * 100);
        setFeedback(`Target found: ${result.target} · ${confidence}% confidence · ${Math.round(result.centerX * 100)}% across, ${Math.round(result.centerY * 100)}% down. Confirm coordinates before clicking.`, "ok");
        return result;
    }

    async function locateAndApproveClick(query) {
        if (!state.active) return { success: false, error: "Start Computer Use first." };
        const epoch = state.epoch;
        const vision = window.JARVISScreenShare;
        if (!vision?.locateTarget) return { success: false, error: "Target location is unavailable in this build." };
        const result = await vision.locateTarget(query);
        if (!state.active || epoch !== state.epoch) return { success: false, retryable: false, error: "Action cancelled because the Computer Use session changed." };
        if (!result?.success || !result.visible) return { success: false, error: result?.error || `I could not clearly locate ${query}. I will not guess.` };
        if (!Number.isFinite(result.confidence) || result.confidence < 0.65) return { success: false, error: "The target is not clear enough to click safely." };
        if (result.source === "accessibility" && Number.isInteger(result.desktopPoint?.x) && Number.isInteger(result.desktopPoint?.y)) {
            return perform("click", result.desktopPoint, `Click ${result.target}`, true, epoch);
        }
        if (![result.centerX, result.centerY].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return { success: false, error: "The target coordinates are invalid." };
        const width = Number(window.screen?.width || 0);
        const height = Number(window.screen?.height || 0);
        if (!width || !height) return { success: false, error: "The desktop display size is unavailable, so I will not convert the target into a click." };
        const confidence = Math.round(Number(result.confidence || 0) * 100);
        return perform("click", { x: Math.min(width - 1, Math.round(result.centerX * width)), y: Math.min(height - 1, Math.round(result.centerY * height)) }, `Click ${result.target} (${confidence}% confidence)`, true, epoch);
    }

    async function locateAndApproveType(query, text) {
        const epoch = state.epoch;
        const payload = String(text || "");
        if (payload.length > 2000) return { success: false, retryable: false, error: "Please dictate at most 2000 characters at a time." };
        const clicked = await locateAndApproveClick(query);
        if (!clicked?.success) {
            // Some native Windows apps (notably the current Notepad) expose
            // only the focused window/panes through UI Automation and hide
            // their editor surface. If that foreground app is unambiguous,
            // use the already-focused control instead of sending the command
            // to a browser or giving up. Browser editors remain vision-only
            // because a focused webpage can contain many unrelated inputs.
            const appMatch = String(query || "").match(/\b(?:editable text area|focused editable text area)\s+in\s+(.+)$/i);
            if (!appMatch) return clicked;
            const app = appMatch[1].trim().toLowerCase();
            if (!app || /chrome|edge|firefox|browser|opera|brave/i.test(app)) return clicked;
            // App launch and foreground activation are asynchronous. Poll in
            // short bounded slices so the first editor is used immediately
            // without imposing the old multi-second retry ladder.
            let items = null;
            let roots = [];
            let editors = [];
            for (let attempt = 0; attempt < 20; attempt++) {
                items = await readAccessibilityItems();
                const appItems = Array.isArray(items)
                    ? items.filter(item => normalizeWindow(item.windowName || item.name).includes(app))
                    : [];
                roots = appItems.filter(item => item?.controlType === "ControlType.Window");
                const focusedApp = appItems.some(item => item?.keyboardFocused === true);
                if (roots.length > 1) roots = focusedApp ? roots : [];
                editors = Array.isArray(items)
                    ? items.filter(item => /\.(Edit|Document|Text)$/.test(String(item?.controlType || "")) && item.keyboardFocusable !== false)
                    : [];
                if (roots.length === 1 || editors.length) break;
                if (attempt < 19) await wait(50);
            }
            const appEditors = editors.filter(item => {
                const windowName = normalizeWindow(item?.windowName);
                return !windowName || windowName.includes(app);
            });
            // If UIA exposes exactly one editor for the focused app, a failed
            // semantic click must not abort the whole voice command. Focus it
            // by its native bounds when available, then type through the same
            // approved SendInput path. This covers packaged editors whose
            // labels do not match the spoken phrase “text editor”.
            if (roots.length === 1 && appEditors.length === 1) {
                const editor = appEditors[0];
                if (!editor.keyboardFocused && !(Number.isInteger(editor.x) && Number.isInteger(editor.y) && Number(editor.width) > 0 && Number(editor.height) > 0)) {
                    return { success: false, retryable: false, actionAttempted: false, error: "The editor was found, but Windows did not expose focus or usable bounds. No text was sent." };
                }
                if (!editor.keyboardFocused && Number.isInteger(editor.x) && Number.isInteger(editor.y) && Number(editor.width) > 0 && Number(editor.height) > 0) {
                    const focused = await perform("click", {
                        x: Math.round(Number(editor.x) + Number(editor.width) / 2),
                        y: Math.round(Number(editor.y) + Number(editor.height) / 2)
                    }, `Focus ${app} text editor`, false, epoch);
                    if (!focused?.success) return { ...focused, retryable: false, error: focused?.error || "Windows could not focus the editor. No text was sent." };
                }
                const typedEditor = await perform("typeText", { text: payload, fastPath: true }, `Type “${payload.slice(0, 80)}” in focused ${app}`, false, epoch);
                return typedEditor?.success ? { ...typedEditor, focusedAppFallback: true, verified: false } : typedEditor;
            }
            if (roots.length !== 1 || appEditors.length > 1) return clicked;
            const typedFocused = await perform("typeText", { text: payload, fastPath: true }, `Type “${payload.slice(0, 80)}” in focused ${app}`, false, epoch);
            return typedFocused?.success ? { ...typedFocused, focusedAppFallback: true, verified: false } : typedFocused;
        }
        const typed = await perform("typeText", { text: payload, fastPath: true }, `Type “${payload.slice(0, 80)}”`, false, epoch);
        if (!typed?.success || !payload) return typed;
        // Native editors can report their value shortly after SendInput.
        // Confirm the literal through UI Automation, but never resend a
        // completed type action: a delayed tree update must not duplicate text.
        if (typeof api.inspectAccessibility !== "function") return typed;
        let sawAccessibilityTree = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            await wait(60);
            const items = await readAccessibilityItems();
            if (Array.isArray(items)) sawAccessibilityTree = true;
            if (accessibilityContainsText(items, payload)) return { ...typed, verified: true };
        }
        return sawAccessibilityTree
            ? { ...typed, success: false, actionAttempted: true, error: "Windows accepted the text input, but the active editor did not confirm the requested text." }
            : typed;
    }

    // A direct voice command such as “type this in Notepad” is itself an
    // explicit request. Run that focused-app typing path without requiring a
    // mouse confirmation, so users who cannot use their hands can complete a
    // reversible text-entry task by voice alone. Visual click workflows keep
    // their existing approval gate.
    async function typeFocusedText(text) {
        if (!state.active) {
            const started = await start();
            if (started?.success === false) return started;
        }
        if (state.busy) return { success: false, error: "Another computer action is in progress." };
        state.busy = true;
        try {
            const beforeState = await waitForFocusedAccessibilityState();
            if (!beforeState.success || !beforeState.focusedWindow) {
                const error = beforeState.error || "Windows did not expose a focused application.";
                setFeedback(error, "error");
                return { success: false, retryable: true, error };
            }
            const result = unwrap(await api.perform("typeText", { text: String(text || "").slice(0, 2000) }, true));
            if (result?.success === true) {
                await wait(70);
                const afterState = await readAccessibilityState();
                const verification = afterState.success
                    ? { verified: beforeState.success && beforeState.fingerprint !== afterState.fingerprint, focusedWindow: afterState.focusedWindow || beforeState.focusedWindow || "", focusedControl: afterState.focusedControl }
                    : { verified: false, reason: afterState.error, focusedWindow: beforeState.focusedWindow || "" };
                setFeedback(`Voice text entered in the focused app${verification.verified ? " · UI state changed" : ` · UI state not confirmed: ${verification.reason || "the editor is not exposed by UI Automation"}`}.`, verification.verified ? "ok" : "warning");
                return { ...result, verification };
            }
            setFeedback(result?.error || "Typing failed before Windows accepted input.", "error");
            return { ...result, success: false, error: result?.error || "Typing failed before Windows accepted input." };
        } catch (error) {
            return { success: false, error: error?.message || "Voice typing failed." };
        } finally { state.busy = false; }
    }

    async function performFocusedAction(action, params = {}, label = `Voice ${action}`) {
        if (!state.active) {
            const started = await start();
            if (started?.success === false) return started;
        }
        if (state.busy) return { success: false, error: "Another computer action is in progress." };
        state.busy = true;
        try {
            const beforeState = await waitForFocusedAccessibilityState();
            if (!beforeState.success || !beforeState.focusedWindow) {
                const error = beforeState.error || "Windows did not expose a focused application.";
                setFeedback(error, "error");
                return { success: false, retryable: true, error };
            }
            const result = unwrap(await api.perform(action, params, true));
            if (result?.success === true) {
                await wait(180);
                const afterState = await readAccessibilityState();
                const verification = afterState.success
                    ? { verified: beforeState.success && beforeState.fingerprint !== afterState.fingerprint, focusedWindow: afterState.focusedWindow || beforeState.focusedWindow || "", focusedControl: afterState.focusedControl }
                    : { verified: false, reason: afterState.error, focusedWindow: beforeState.focusedWindow || "" };
                setFeedback(`${label} completed${verification.verified ? " · UI state changed" : ` · UI state not confirmed: ${verification.reason || "no observable accessibility change"}`}`, verification.verified ? "ok" : "warning");
                return { ...result, verification };
            }
            setFeedback(result?.error || `${label} failed before Windows accepted the action.`, "error");
            return { ...result, success: false, error: result?.error || `${label} failed before Windows accepted the action.` };
        } catch (error) {
            return { success: false, error: error?.message || `${label} failed.` };
        } finally { state.busy = false; }
    }

    button.addEventListener("click", () => state.active ? stop() : start());
    by("[data-cu-stop]").addEventListener("click", stop);
    by("[data-cu-access-toggle]").addEventListener("click", () => setAccessMode(!state.accessMode));
    by("[data-cu-click]").addEventListener("click", () => perform("click", values(), "Click"));
    by("[data-cu-double]").addEventListener("click", () => perform("doubleClick", values(), "Double-click"));
    by("[data-cu-right]").addEventListener("click", () => perform("rightClick", values(), "Right-click"));
    by("[data-cu-drag]").addEventListener("click", () => perform("drag", dragValues(), "Drag"));
    by("[data-cu-scroll]").addEventListener("click", () => perform("scroll", { ...values(), delta: -700 }, "Scroll"));
    by("[data-cu-type]").addEventListener("click", () => perform("typeText", { text: by("[data-cu-text]").value }, "Typing text"));
    by("[data-cu-key-press]").addEventListener("click", () => perform("pressKey", { key: by("[data-cu-key]").value }, "Pressing a key"));
    by("[data-cu-inspect]").addEventListener("click", () => inspectScreen().catch((error) => setFeedback(error?.message || "The screen could not be inspected.", "error")));
    by("[data-cu-locate]").addEventListener("click", () => locateTarget().catch((error) => setFeedback(error?.message || "The target could not be located.", "error")));
    by("[data-cu-undo-last]").addEventListener("click", async () => {
        const result = await window.JARVISVisualWorkflow?.undoLast?.({ maxAttempts: 1 });
        setFeedback(result?.success ? "The last reversible task was undone." : (result?.error || "No safe undo is available."), result?.success ? "ok" : "error");
        refreshTaskMemory();
    });
    by("[data-cu-replay-last]").addEventListener("click", async () => {
        const result = await window.JARVISVisualWorkflow?.replayLast?.({ maxAttempts: 2 });
        setFeedback(result?.success ? "The remembered task completed again with fresh verification." : (result?.error || "The last task could not be replayed safely."), result?.success ? "ok" : "error");
        refreshTaskMemory();
    });
    panel.addEventListener("click", (event) => {
        const example = event.target.closest?.("[data-cu-voice-example]");
        if (!example) return;
        const text = example.getAttribute("data-cu-voice-example") || "";
        by("[data-cu-target-query]").value = text.replace(/^inspect\s+the\s+/i, "");
        setFeedback(`Say “${text}” to JARVIS, or use the matching control below.`, "ok");
    });

    window.JARVISComputerUse = Object.freeze({
        start,
        stop,
        setAccessMode,
        status: () => api.status(),
        perform: (action, params = {}) => perform(action, params, `Computer action: ${action}`),
        locateAndApproveClick,
        locateAndApproveType,
        typeFocusedText,
        performFocusedAction,
        setWorkflowStatus,
        taskMemory: () => window.JARVISVisualWorkflow?.getTaskMemory?.() || [],
        replayLastTask: (options = {}) => window.JARVISVisualWorkflow?.replayLast?.(options),
        isActive: () => state.active,
        isAutopilotActive: () => state.accessMode,
        lastObservation: () => state.lastObservation
    });
    refresh().catch(() => setFeedback("Computer Use status is unavailable.", "error"));

    function requestApproval(label) {
        const modal = by("[data-cu-confirm]");
        const detail = by("[data-cu-confirm-detail]");
        detail.textContent = `${label} will send input to the currently focused Windows app. It will run once and cannot be automatically repeated.`;
        modal.hidden = false;
        return new Promise((resolve) => {
            const finish = (value) => { modal.hidden = true; state.cancelApproval = null; resolve(value); };
            state.cancelApproval = () => finish(false);
            by("[data-cu-confirm-cancel]").onclick = () => finish(false);
            by("[data-cu-confirm-allow]").onclick = () => finish(true);
            modal.onkeydown = (event) => { if (event.key === "Escape") finish(false); };
            by("[data-cu-confirm-allow]").focus();
        });
    }
})();
