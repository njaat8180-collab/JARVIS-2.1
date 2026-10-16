"use strict";

(() => {
    let stream = null;
    // Screen understanding is shared by the background Autopilot observer and
    // foreground workflows. Serialize provider calls so a second screenshot
    // cannot replace the frame or response belonging to the active step.
    let visionQueue = Promise.resolve();
    let replyWatchTimer = null;
    let replyWatchProvider = "";
    let replyWatchBaseline = "";
    let replyWatchCandidate = "";
    let replyWatchStableCount = 0;
    let replyWatchInFlight = false;
    const button = document.getElementById("jarvisScreenShareButton");
    if (!button) return;

    const panel = document.createElement("section");
    panel.id = "jarvisScreenSharePanel";
    panel.className = "jarvis-screen-share-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Screen shared with JARVIS");
    panel.innerHTML = '<header><div><strong>JARVIS VISION</strong><span data-share-status>Screen sharing is off</span></div><button type="button" data-stop-share aria-label="Stop screen sharing">Stop sharing</button></header><video autoplay muted playsinline aria-label="Preview of the screen shared with JARVIS"></video><div class="screen-share-question"><input data-screen-question type="text" maxlength="500" placeholder="Ask about anything visible…"><button type="button" data-analyze-screen>Analyze</button></div><p data-screen-answer aria-live="polite">Share a screen or window. JARVIS will answer from the visible image using your local vision model.</p>';
    document.body.appendChild(panel);

    function shouldAnalyzeQuestion(text) {
        // Autopilot may be running in native-only mode when Windows denied
        // capture or the selected provider has no vision model.  In that mode
        // screen questions still have a useful answer from UI Automation.
        const nativeAutopilot = Boolean(window.JARVISComputerUse?.isAutopilotActive?.());
        if (!stream && !nativeAutopilot) return false;
        return /\b(?:this|that|it|here|on my screen|on the screen|in this (?:image|picture|video|window|page)|what do you see|what(?:'s| is) this|what is that|what does this say|read this|look at this|tell me about (?:this|that|it)|identify this|describe this|show me (?:this|that))\b|\b(?:ye|yeh|yah|is|isko|ise|iska|iske|isake)\s+(?:kya|kaisa|kaisi|ke baare|ke bare)|\b(?:iske|isake)\s+(?:baare|bare)\s+mein|(?:ये|यह|इस|इसे|इसको|इसका|इसके|इसमें|इसमे).{0,35}(?:क्या|कौन|कैसा|कैसी|बताओ|बताइए|दिख|समझाओ|पता)|(?:क्या|कौन).{0,25}(?:दिख रहा|दिख रही|ये है|यह है)|इसके बारे में|इसके बारेमे/iu.test(String(text || ""));
    }

    function setStatus(text) {
        const status = panel.querySelector("[data-share-status]");
        if (status) status.textContent = text;
    }

    async function waitForVideoFrame(video, timeoutMs = 4000) {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true;
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return false;
    }

    async function stop() {
        stopReplyWatch();
        const oldStream = stream;
        stream = null;
        oldStream?.getTracks().forEach((track) => track.stop());
        const video = panel.querySelector("video");
        if (video) video.srcObject = null;
        panel.hidden = true;
        button.setAttribute("aria-pressed", "false");
        button.textContent = "▣ Share screen";
        setStatus("Screen sharing is off");
    }

    function stopReplyWatch() {
        if (replyWatchTimer) window.clearInterval(replyWatchTimer);
        replyWatchTimer = null;
        replyWatchProvider = "";
        replyWatchBaseline = "";
        replyWatchCandidate = "";
        replyWatchStableCount = 0;
        replyWatchInFlight = false;
    }

    function cancelReplyWatch() {
        const active = Boolean(replyWatchTimer);
        stopReplyWatch();
        if (active) setStatus("Reply monitoring cancelled");
        return active;
    }

    async function getVisionModel() {
        const statusResponse = await window.jarvis?.ollama?.status?.();
        const status = statusResponse?.data || statusResponse;
        if (!statusResponse?.success || !status?.connected) return { error: "Screen understanding needs local Ollama. Open Settings → Ollama, start the Ollama app, then try again. This feature runs locally and does not use a cloud API." };
        const model = status.models?.find((item) => /^(?:llava|qwen2\.5[-:]?vl|qwen3[-:]?vl|gemma3|moondream|minicpm-v|bakllava)(?:[:@.-]|$)/i.test(item.name));
        return model ? { model: model.name } : { error: "No vision model is installed. In a terminal, run: ollama pull gemma3:4b. Then return here and analyze the shared screen again." };
    }

    async function captureSharedFrame() {
        if (stream?.__desktopFallback) {
            const result = await window.jarvis?.screenShare?.capture?.();
            const data = result?.data || result;
            if (!result?.success || !data?.image) throw new Error(result?.error || "Windows did not return a desktop frame.");
            return String(data.image).replace(/^data:image\/[^;]+;base64,/i, "");
        }
        const video = panel.querySelector("video");
        if (!await waitForVideoFrame(video)) throw new Error("The shared screen frame is not ready.");
        const scale = Math.min(1, 1600 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Could not prepare the shared screen frame.");
        const panelVisibility = panel.style.visibility;
        try {
            panel.style.visibility = "hidden";
            await new Promise((resolve) => setTimeout(resolve, 120));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
        } finally { panel.style.visibility = panelVisibility; }
        return canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
    }

    async function visionChat(prompt, image, options = {}) {
        const configResponse = await window.jarvis?.aiProvider?.get?.();
        const config = configResponse?.data || configResponse || {};
        if (config.provider === "ollama") {
            const statusResponse = await window.jarvis?.ollama?.status?.();
            const status = statusResponse?.data || statusResponse;
            if (!statusResponse?.success || !status?.connected || !status.selectedModel) return { success: false, error: "The selected Ollama vision model is not running." };
            return window.jarvis.ollama.chat([{ role: "user", content: String(prompt || "Inspect the current screen."), images: [image] }], { ...options, model: status.selectedModel });
        }
        if (typeof window.jarvis?.aiProvider?.vision !== "function") return { success: false, error: "Selected provider screen vision is unavailable in this JARVIS build." };
        return window.jarvis.aiProvider.vision(String(prompt || "Inspect the current screen."), image, options);
    }

    function queuedVisionChat(prompt, image, options = {}) {
        const run = visionQueue.then(() => visionChat(prompt, image, options));
        visionQueue = run.catch(() => {});
        return run;
    }

    async function inspectProviderReply(provider) {
        const image = await captureSharedFrame();
        const response = await queuedVisionChat(`Inspect this screenshot only. Determine whether the visible page belongs to ${provider === "Any" ? "ChatGPT or Gemini" : provider}. Return provider as exactly "ChatGPT", "Gemini", "other", or "uncertain". Read the newest assistant reply visible in the conversation. Set generating=true only if a clear stop-generating indicator or active response animation is visible; otherwise false. Return exactly one JSON object with keys provider (string), providerVisible (boolean), replyText (string), generating (boolean). If uncertain, provider="uncertain", providerVisible=false, and replyText="". Do not infer content that cannot be read.`, image, { timeoutMs: 25000 });
        if (!response?.success) return { success: false, error: response?.error || "The local vision model could not inspect the shared screen." };
        const data = response.data || response;
        const raw = String(data.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start < 0 || end <= start) return { success: false, error: "The local vision model returned unreadable screen details." };
        try {
            const result = JSON.parse(raw.slice(start, end + 1));
            const detectedProvider = /gemini/i.test(String(result.provider || "")) ? "Gemini" : /chat\s*gpt|openai/i.test(String(result.provider || "")) ? "ChatGPT" : "";
            const providerMatches = provider === "Any" ? Boolean(detectedProvider) : detectedProvider === provider;
            return { success: true, providerVisible: result.providerVisible === true && providerMatches, detectedProvider, replyText: String(result.replyText || "").trim().slice(0, 12000), generating: result.generating === true, model: data.model || "selected vision model" };
        } catch (_) { return { success: false, error: "The local vision model returned invalid screen details." }; }
    }

    async function watchForProviderReply(provider) {
        const providerText = String(provider || "");
        const normalized = /gemini/i.test(providerText) && /chat\s*gpt|openai/i.test(providerText) ? "Any" : /gemini/i.test(providerText) ? "Gemini" : /chat\s*gpt|openai/i.test(providerText) ? "ChatGPT" : "";
        if (!normalized) return { success: false, error: "Choose ChatGPT or Gemini for reply monitoring." };
        if (!stream) return { success: false, error: "Share the ChatGPT or Gemini window with JARVIS first, then repeat the shutdown command." };
        stopReplyWatch();
        const initial = await inspectProviderReply(normalized);
        if (!initial.success) return initial;
        if (!initial.providerVisible) return { success: false, error: `I can't confirm ${normalized} is visible in the shared window. Show its chat page and try again.` };
        replyWatchProvider = normalized;
        replyWatchBaseline = initial.replyText;
        replyWatchTimer = window.setInterval(async () => {
            if (!stream || replyWatchInFlight || !replyWatchProvider) return;
            replyWatchInFlight = true;
            try {
                const current = await inspectProviderReply(replyWatchProvider);
                if (!current.success) { setStatus(`Watching ${replyWatchProvider === "Any" ? "ChatGPT or Gemini" : replyWatchProvider} · local screen check will retry`); return; }
                if (!current.providerVisible || current.generating || current.replyText.length < 24 || current.replyText === replyWatchBaseline) {
                    replyWatchCandidate = "";
                    replyWatchStableCount = 0;
                    setStatus(`Watching shared ${replyWatchProvider} screen for a new completed reply…`);
                    return;
                }
                if (current.replyText === replyWatchCandidate) replyWatchStableCount += 1;
                else { replyWatchCandidate = current.replyText; replyWatchStableCount = 1; }
                setStatus(`New ${replyWatchProvider} reply detected · confirming it is complete (${replyWatchStableCount}/2)…`);
                if (replyWatchStableCount < 2) return;
                const completedProvider = replyWatchProvider;
                stopReplyWatch();
                setStatus(`${completedProvider} reply is visible and complete · shutting down…`);
                const result = await window.jarvis?.system?.shutdown?.();
                if (result?.success === false) setStatus(`Reply was detected, but shutdown failed: ${result.error || "system action unavailable"}`);
            } catch (error) {
                setStatus(`Screen monitoring paused: ${error?.message || "local vision check failed"}`);
            } finally { replyWatchInFlight = false; }
        }, 4500);
        setStatus(`Watching the shared ${normalized} screen for a new reply · local vision · no API key`);
        return { success: true, provider: normalized, baselineCaptured: true };
    }

    async function analyze(question = "Describe what is visible on this screen.") {
        if (!stream && window.JARVISComputerUse?.isAutopilotActive?.()) {
            const nativeState = await understandState(question);
            if (nativeState?.success) {
                return {
                    success: true,
                    text: `${nativeState.app || "The active Windows app"}: ${nativeState.screen || "native UI state observed"}. ${nativeState.visibleControls?.length ? `Visible controls: ${nativeState.visibleControls.join(", ")}.` : "No named controls were exposed."}${nativeState.blocker ? ` Blocker: ${nativeState.blocker}` : ""}`,
                    model: "Windows Accessibility"
                };
            }
            return nativeState;
        }
        if (!stream) return { success: false, error: "Share your screen first using the Share screen button." };
        let base64;
        try { base64 = await captureSharedFrame(); }
        catch (error) { return { success: false, error: error?.message || "The shared image could not be captured." }; }
        const userQuestion = String(question || "Describe what is visible on this screen.").slice(0, 500);
        const reply = await queuedVisionChat(`You are answering about the attached current screenshot. Use only evidence visible in this image. First identify the main visible subject or screen content that the user points to. If it is a recognizable landmark or object, name it and give one or two visible clues that support the identification. Never invent details, text, actions, or context that are not visible. If the image does not provide enough evidence, say what is uncertain instead of guessing. Read visible text only when legible; say when it is too small. Reply in the same language as the user's question, clearly and briefly. User question: ${userQuestion}`, base64, { timeoutMs: 120000 });
        if (!reply?.success) return { success: false, error: reply?.error || "The local vision model could not analyze this frame." };
        const data = reply.data || reply;
        return { success: true, text: data.text, model: data.model || "selected vision model" };
    }

    async function locateTarget(request = "the main button") {
        // Prefer the native Windows accessibility tree when available. It
        // provides exact labels and bounds for standard desktop controls and
        // avoids asking vision to guess small text or buttons. This path is
        // intentionally available without a media stream: native apps such
        // as Notepad and Settings remain controllable when screen capture or
        // a provider's vision model is unavailable.
        try {
            const tree = await window.jarvis?.computerUse?.inspectAccessibility?.();
            const items = tree?.data?.data?.items || tree?.data?.items || tree?.items;
            if (tree?.success && Array.isArray(items) && items.length) {
                const item = window.JARVISAccessibilityTargets?.match(request, items);
                if (item) {
                    const width = Math.max(1, Number(window.screen?.width || 1));
                    const height = Math.max(1, Number(window.screen?.height || 1));
                    const centerX = (Number(item.x) + Number(item.width) / 2) / width;
                    const centerY = (Number(item.y) + Number(item.height) / 2) / height;
                    return { success: true, target: String(item.name).slice(0, 120), visible: true, observedVisible: true, confidence: 0.95, desktopPoint: { x: Math.round(Number(item.x) + Number(item.width) / 2), y: Math.round(Number(item.y) + Number(item.height) / 2) }, centerX, centerY, box: { left: Number(item.x) / width, top: Number(item.y) / height, right: (Number(item.x) + Number(item.width)) / width, bottom: (Number(item.y) + Number(item.height)) / height }, reason: "Matched a native Windows accessibility element.", source: "accessibility", controlType: item.controlType };
                }
            }
        } catch (_) { /* vision remains the fallback for custom or web-rendered controls */ }
        if (!stream) return { success: false, error: "This control is not exposed by Windows accessibility. Share the screen so JARVIS can inspect the visual UI." };
        let base64;
        try { base64 = await captureSharedFrame(); }
        catch (error) { return { success: false, error: error?.message || "The shared image could not be captured." }; }
        const targetRequest = String(request || "the main button").slice(0, 300);
        const normalizedTarget = targetRequest.toLowerCase();
        const aliases = normalizedTarget.includes("play") || normalizedTarget.includes("launch")
            ? ["Play", "Launch", "Start", "Run"]
            : normalizedTarget.includes("save")
                ? ["Save", "Apply", "Confirm"]
                : normalizedTarget.includes("join") || normalizedTarget.includes("survival")
                    ? ["Join", "Play", "Enter", "first Survival world"]
                    : normalizedTarget.includes("close") || normalizedTarget.includes("cancel")
                        ? ["Close", "Cancel", "X"] : [];
        const reply = await queuedVisionChat(`Inspect the attached screenshot only. Locate this visible UI target: ${targetRequest}. ${aliases.length ? `Treat these as possible label variants for the same requested control: ${aliases.join(", ")}. Do not click or infer from an alias unless it is visibly the same control.` : ""} Return exactly one JSON object with keys target (string), visible (boolean), confidence (number from 0 to 1), centerX (number from 0 to 1), centerY (number from 0 to 1), box (object with left, top, right, bottom each 0 to 1), and reason (short string). Coordinates are normalized to the screenshot width and height. If the target is not clearly visible, set visible=false, confidence=0, and all coordinates to 0. Never guess or infer a target that is not visible.`, base64, { timeoutMs: 45000 });
        if (!reply?.success) return { success: false, error: reply?.error || "The local vision model could not locate the target." };
        const data = reply.data || reply;
        const raw = String(data.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start < 0 || end <= start) return { success: false, error: "The local vision model returned unreadable target details." };
        try {
            const result = JSON.parse(raw.slice(start, end + 1));
            const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
            const coordinate = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
            const box = result.box;
            const validGeometry = [result.centerX, result.centerY, box?.left, box?.top, box?.right, box?.bottom].every(coordinate)
                && box.left < box.right && box.top < box.bottom
                && result.centerX >= box.left && result.centerX <= box.right && result.centerY >= box.top && result.centerY <= box.bottom;
            const visible = result.visible === true && coordinate(result.confidence) && result.confidence >= 0.55 && validGeometry;
            return {
                success: true,
                target: String(result.target || targetRequest).slice(0, 120),
                visible,
                observedVisible: result.visible === true,
                confidence: clamp(result.confidence),
                centerX: visible ? clamp(result.centerX) : 0,
                centerY: visible ? clamp(result.centerY) : 0,
                box: {
                    left: clamp(result.box?.left), top: clamp(result.box?.top),
                    right: clamp(result.box?.right), bottom: clamp(result.box?.bottom)
                },
                reason: String(result.reason || "").slice(0, 240),
                model: data.model || "selected vision model"
            };
        } catch (_) { return { success: false, error: "The local vision model returned invalid target details." }; }
    }

    async function understandState(question = "Describe the current app, visible state, blockers, and the safest next step.") {
        // Native UI Automation can describe many Windows apps without a
        // media stream or a vision-capable provider. Keep this state path
        // available so Autopilot can remain hands-free when screen capture is
        // denied or a selected model cannot read images.
        try {
            const tree = await window.jarvis?.computerUse?.inspectAccessibility?.();
            const items = tree?.data?.data?.items || tree?.data?.items || tree?.items;
            if (tree?.success && Array.isArray(items) && items.length) {
                const root = items.find(item => item?.controlType === "ControlType.Window") || items[0];
                const controls = items
                    .filter(item => item?.enabled !== false && item?.name && item.controlType !== "ControlType.Window")
                    .map(item => String(item.name).trim())
                    .filter((name, index, names) => name && names.indexOf(name) === index)
                    .slice(0, 12);
                const text = items.map(item => `${item?.name || ""} ${item?.value || ""}`).join(" ");
                const blocker = /captcha|sign\s*in|log\s*in|permission|allow access|password/i.test(text)
                    ? "A sign-in, permission, or verification step may require your instruction."
                    : "";
                return {
                    success: true,
                    app: String(root?.windowName || root?.name || "Windows app").slice(0, 120),
                    screen: `Native UI state with ${items.length} visible element(s)`,
                    ready: true,
                    blocker,
                    visibleControls: controls,
                    suggestedNextStep: blocker ? "Ask the user what to do with the visible blocker." : "Wait for the next voice command.",
                    confidence: 0.82,
                    reason: "Read from the active Windows accessibility tree.",
                    source: "accessibility"
                };
            }
        } catch (_) { /* vision remains the fallback when native inspection fails */ }
        if (!stream) return { success: false, error: "The current app is not exposed by Windows accessibility. Share the screen so JARVIS can inspect its visual UI." };
        let base64;
        try { base64 = await captureSharedFrame(); }
        catch (error) { return { success: false, error: error?.message || "The shared screen frame could not be captured." }; }
        const userQuestion = String(question || "Describe the current app state.").slice(0, 500);
        const reply = await queuedVisionChat(`Inspect this current desktop screenshot only. Provide grounded state awareness for a safe UI workflow. Return exactly one JSON object with keys app (string), screen (string), ready (boolean), blocker (string), visibleControls (array of short strings), suggestedNextStep (string), confidence (number from 0 to 1), and reason (short string). Do not invent unreadable text or assume an action succeeded. If uncertain, set ready=false and explain the uncertainty. User context: ${userQuestion}`, base64, { timeoutMs: 45000 });
        if (!reply?.success) return { success: false, error: reply?.error || "The local vision model could not understand the current screen state." };
        const data = reply.data || reply;
        const raw = String(data.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start < 0 || end <= start) return { success: false, error: "The local vision model returned unreadable screen state." };
        try {
            const result = JSON.parse(raw.slice(start, end + 1));
            const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
            return {
                success: true,
                app: String(result.app || "unknown").slice(0, 120),
                screen: String(result.screen || "unknown").slice(0, 240),
                ready: result.ready === true && clamp(result.confidence) >= 0.55,
                blocker: String(result.blocker || "").slice(0, 240),
                visibleControls: Array.isArray(result.visibleControls) ? result.visibleControls.map(item => String(item).slice(0, 100)).slice(0, 12) : [],
                suggestedNextStep: String(result.suggestedNextStep || "").slice(0, 240),
                confidence: clamp(result.confidence),
                reason: String(result.reason || "").slice(0, 300),
                model: data.model || "selected vision model"
            };
        } catch (_) { return { success: false, error: "The local vision model returned invalid screen state." }; }
    }

    window.JARVISScreenShare = Object.freeze({ isActive: () => !!stream, start, stop, shouldAnalyzeQuestion, analyze, locateTarget, understandState, watchForProviderReply, cancelReplyWatch });

    const analyzeButton = panel.querySelector("[data-analyze-screen]");
    analyzeButton.addEventListener("click", async () => {
        const answer = panel.querySelector("[data-screen-answer]");
        const question = panel.querySelector("[data-screen-question]").value.trim();
        analyzeButton.disabled = true;
        answer.textContent = "Looking at the shared image locally…";
        setStatus("Analyzing the current frame…");
        try {
            const result = await analyze(question);
            answer.textContent = result.success ? result.text : result.error;
            setStatus(result.success ? `Analyzed locally · ${result.model}` : "Could not analyze this frame");
        } catch (error) {
            answer.textContent = error?.message || "The screen could not be analyzed.";
            setStatus("Could not analyze this frame");
        } finally {
            analyzeButton.disabled = false;
        }
    });
    panel.querySelector("[data-screen-question]").addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !analyzeButton.disabled) {
            event.preventDefault();
            analyzeButton.click();
        }
    });

    async function start(options = {}) {
        if (stream) return { success: true, alreadyActive: true };
        // Autopilot is voice-first. Starting it must not open the OS display
        // picker, because that picker requires a pointer and can strand a
        // hands-free user before the first command runs. The explicit Share
        // screen button still uses live getDisplayMedia below; Autopilot gets
        // the same desktop snapshot IPC path used by unsupported platforms.
        if (options?.autopilot) {
            try {
                const capture = await window.jarvis?.screenShare?.capture?.();
                const data = capture?.data || capture;
                if (capture?.success && data?.image) {
                    stream = { __desktopFallback: true, getTracks: () => [] };
                    panel.hidden = false;
                    button.setAttribute("aria-pressed", "true");
                    button.textContent = "■ Stop sharing";
                    setStatus(`Autopilot desktop snapshots active · ${data.source || "desktop"}`);
                    return { success: true, fallback: true, voiceFirst: true };
                }
            } catch (_) { /* native accessibility remains available */ }
        }
        if (!navigator.mediaDevices?.getDisplayMedia) {
            const capture = await window.jarvis?.screenShare?.capture?.();
            const data = capture?.data || capture;
            if (!capture?.success || !data?.image) return { success: false, error: capture?.error || "Screen sharing is not available in this JARVIS build." };
            stream = { __desktopFallback: true, getTracks: () => [] };
            panel.hidden = false;
            button.setAttribute("aria-pressed", "true");
            button.textContent = "■ Stop sharing";
            setStatus(`Sharing desktop snapshot fallback · ${data.source || "desktop"}`);
            return { success: true, fallback: true };
        }
        try {
            const sharedStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 8, max: 15 } },
                audio: false
            });
            const video = panel.querySelector("video");
            stream = sharedStream;
            video.srcObject = sharedStream;
            panel.hidden = false;
            button.setAttribute("aria-pressed", "true");
            button.textContent = "■ Stop sharing";
            setStatus("Connecting to the selected screen…");
            await video.play();
            if (!await waitForVideoFrame(video)) throw new Error("JARVIS could not read a frame from the selected screen. Stop sharing and choose it again.");
            setStatus("Sharing live · ask about anything visible");
            sharedStream.getVideoTracks()[0]?.addEventListener("ended", stop, { once: true });
            return { success: true };
        } catch (error) {
            if (error?.name === "NotSupportedError" || error?.name === "TypeError") {
                const capture = await window.jarvis?.screenShare?.capture?.();
                const data = capture?.data || capture;
                if (capture?.success && data?.image) {
                    stream = { __desktopFallback: true, getTracks: () => [] };
                    panel.hidden = false;
                    button.setAttribute("aria-pressed", "true");
                    button.textContent = "■ Stop sharing";
                    setStatus(`Sharing desktop snapshot fallback · ${data.source || "desktop"}`);
                    return { success: true, fallback: true };
                }
            }
            await stop();
            const answer = panel.querySelector("[data-screen-answer]");
            if (error?.name !== "NotAllowedError") answer.textContent = error?.message || "The selected screen could not be shared.";
            if (error?.name !== "NotAllowedError") {
                console.error("JARVIS screen share failed:", error?.name || "UnknownError", error?.message || String(error));
            }
            return { success: false, error: error?.message || "The selected screen could not be shared." };
        }
    }

    button.addEventListener("click", async () => {
        if (stream) return stop();
        const result = await start();
        if (result?.success === false && result.error) window.alert(result.error);
    });
    panel.querySelector("[data-stop-share]").addEventListener("click", stop);
})();
