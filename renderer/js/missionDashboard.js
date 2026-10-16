"use strict";

(() => {
    const $ = id => document.getElementById(id);
    const safeText = value => String(value || "").trim();
    let shutdownAtMs = 0;
    let recentDocuments = [];
    let recentJobs = [];

    function updateShutdownCountdown() {
        const panel = $("scheduledShutdownCountdown");
        const output = $("scheduledShutdownRemaining");
        if (!panel || !output) return;
        const remaining = Math.max(0, Math.ceil((shutdownAtMs - Date.now()) / 1000));
        if (!shutdownAtMs || remaining <= 0) {
            shutdownAtMs = 0;
            panel.hidden = true;
            return;
        }
        panel.hidden = false;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        output.textContent = hours
            ? `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
            : `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }

    async function loadScheduledShutdown() {
        try {
            const result = await window.jarvis?.system?.getScheduledShutdown?.();
            if (result?.success && result.scheduled && Number.isFinite(Date.parse(result.shutdownAt))) {
                setScheduledShutdown(result.shutdownAt);
            } else {
                clearScheduledShutdown();
            }
        } catch (_) {
            clearScheduledShutdown();
        }
    }

    function setScheduledShutdown(timestamp) {
        const value = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
        shutdownAtMs = Number.isFinite(value) ? value : 0;
        updateShutdownCountdown();
    }

    function clearScheduledShutdown() {
        shutdownAtMs = 0;
        updateShutdownCountdown();
    }

    window.JARVISDashboard = { setScheduledShutdown, clearScheduledShutdown };

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value == null || value === "" ? "—" : String(value);
    }

    async function refreshProfile() {
        try {
            const result = await window.jarvis?.users?.getActive?.();
            const user = result?.user || result?.data?.user || result?.profile?.user || result;
            const profile = result?.profile || user?.profile || result?.data?.profile || user;
            const name = safeText(profile?.preferredName || profile?.displayName || profile?.name || user?.name) || "there";
            const profileName = name === "there" ? "Guest" : name;
            setText("dashboardUserName", name);
            setText("dashboardProfileName", profileName);
            setText("dashboardUserInitial", profileName.slice(0, 1).toUpperCase());
            const oldName = $("username");
            if (oldName && oldName.textContent === "Guest") oldName.textContent = profileName;
        } catch (_) {
            setText("dashboardUserName", "there");
            setText("dashboardProfileName", "Guest");
            setText("dashboardUserInitial", "G");
        }
    }

    function updateAssistantStatus() {
        const raw = safeText($("systemStatus")?.textContent).toUpperCase();
        if (!raw) return;
        if (raw.includes("THINK")) setText("dashboardAssistantState", "LOCAL CORE THINKING");
        else if (raw.includes("ONLINE") || raw.includes("READY")) setText("dashboardAssistantState", "LOCAL CORE READY");
        else if (raw.includes("OFFLINE") || raw.includes("STOP")) setText("dashboardAssistantState", "CORE STANDBY");
        else setText("dashboardAssistantState", raw.slice(0, 30));
    }

    function copyLiveValue(sourceId, targetId) {
        const source = $(sourceId);
        const target = $(targetId);
        if (!source || !target) return;
        const unavailable = source.dataset.available === "false";
        const value = safeText(source.textContent);
        target.textContent = !value || value === "—" ? "Checking…" : (unavailable ? "Unavailable" : value);
    }

    function updateDashboardTelemetry() {
        copyLiveValue("cpuPercent", "dashboardCpu");
        copyLiveValue("ramPercent", "dashboardRam");
        copyLiveValue("diskPercent", "dashboardDisk");
        copyLiveValue("netSpeed", "dashboardNetworkStatus");
        const rawSystem = safeText($("systemStatus")?.textContent);
        setText("dashboardRuntimeStatus", rawSystem || "Checking…");
        updateAssistantStatus();

        const voice = window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent;
        const stt = safeText($("sttEngineLabel")?.textContent);
        const voiceState = safeText($("voiceStatus")?.textContent);
        const state = voice?.muted
            ? "MIC OFF"
            : voice?.isListening
                ? `LISTENING${stt ? ` · ${stt}` : ""}`
                : (voiceState || "Checking…");
        setText("dashboardVoiceStatus", state);

        const micActive = Boolean(voice && !voice.muted && (voice.isListening || window.WakeWordEngine?.active));
        const micButton = $("dashboardMicToggle");
        if (micButton) {
            micButton.setAttribute("aria-pressed", micActive ? "true" : "false");
            micButton.classList.toggle("is-active", micActive);
            micButton.classList.toggle("is-off", !micActive);
            micButton.textContent = micActive ? "🎙 Turn mic off" : "🎙 Turn mic on";
        }
        setText("dashboardMicState", micActive ? "ON" : "OFF");
        const providerSelect = $("settingsAiProvider");
        const providerName = safeText($("chatAiProviderSummary")?.textContent) || safeText(providerSelect?.selectedOptions?.[0]?.textContent) || "Sarvam AI";
        setText("dashboardProviderState", providerName.replace(/\s*\([^)]*\)/g, "").slice(0, 28));
        setText("dashboardInternetState", safeText($("internetStatus")?.textContent) || (navigator.onLine ? "Online" : "Offline"));
        setText("dashboardTaskState", recentJobs.filter(job => ["queued", "running", "cancelling"].includes(job.state)).length);

        const wakeButton = $("wakeWordToggle");
        const wakeEnabled = Boolean(window.WakeWordEngine?.isEnabled?.());
        const wakeDashboardButton = $("dashboardWakeWordToggle");
        if (wakeDashboardButton) {
            wakeDashboardButton.setAttribute("aria-pressed", wakeEnabled ? "true" : "false");
            wakeDashboardButton.classList.toggle("is-active", wakeEnabled);
            wakeDashboardButton.classList.toggle("is-off", !wakeEnabled);
            wakeDashboardButton.textContent = wakeEnabled ? "Wake word: ON" : "Wake word: OFF";
            wakeDashboardButton.title = wakeButton?.title || "Toggle wake-word listening";
        }
    }

    function escape(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    }

    function showActionError(button, message) {
        const container = button?.closest(".mission-recent-list");
        if (!container) return;
        let feedback = container.querySelector(".mission-action-error");
        if (!feedback) { feedback = document.createElement("small"); feedback.className = "mission-action-error"; feedback.setAttribute("role", "alert"); container.append(feedback); }
        feedback.textContent = String(message || "JARVIS could not complete that action.");
    }

    function renderRecentDocuments() {
        const list = $("dashboardRecentDocuments");
        if (!list) return;
        if (!recentDocuments.length) {
            list.innerHTML = '<div class="mission-empty-state"><p>No presentations or PDFs yet.</p><button type="button" data-home-create-document>Create a document</button></div>';
            return;
        }
        list.innerHTML = recentDocuments.slice(0, 4).map((doc, index) => {
            const kind = doc.type === "presentation" ? "PPTX" : "PDF";
            const date = new Date(doc.modifiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return `<div class="mission-recent-row"><span class="mission-recent-kind">${kind}</span><div class="mission-recent-copy"><strong>${escape(doc.title)}</strong><small>${date}</small></div><button type="button" data-home-open-document="${index}" aria-label="Open ${escape(doc.title)}">Open</button></div>`;
        }).join("");
    }

    async function refreshRecentDocuments() {
        try {
            const response = await window.jarvis?.documents?.listGenerated?.();
            const data = response?.data || response || {};
            recentDocuments = Array.isArray(data.documents) ? data.documents.slice(0, 4) : [];
            renderRecentDocuments();
        } catch (_) {
            const list = $("dashboardRecentDocuments");
            if (list) list.innerHTML = '<p class="mission-empty">Recent documents are unavailable. Open Documents to refresh the gallery.</p>';
        }
    }

    function renderActiveJobs() {
        const list = $("dashboardActiveJobs");
        if (!list) return;
        const active = recentJobs.filter(job => ["queued", "running", "cancelling"].includes(job.state)).slice(0, 2);
        const recoverable = recentJobs.filter(job => ["failed", "cancelled"].includes(job.state)).slice(0, 1);
        const visible = [...active, ...recoverable];
        if (!visible.length) {
            list.innerHTML = '<div class="mission-empty-state"><p>No background tasks are running.</p><button type="button" data-home-start-task>Start a task in Chat</button></div>';
            return;
        }
        list.innerHTML = visible.map(job => {
            const percent = Math.max(0, Math.min(100, Number(job.progress) || 0));
            const activeJob = ["queued", "running", "cancelling"].includes(job.state);
            const jobIndex = recentJobs.indexOf(job);
            const control = activeJob
                ? `<button type="button" data-home-cancel-job="${jobIndex}">Cancel</button>`
                : `<button type="button" data-home-retry-job="${jobIndex}">${job.payload?.checkpoint?.stage ? "Resume saved work" : "Retry"}</button>`;
            return `<div class="mission-job-row"><div class="mission-job-heading"><strong>${escape(job.title || "JARVIS task")}</strong><span>${activeJob ? `${percent}%` : escape(job.state)}</span></div><small>${escape(job.error || job.stage || job.state)}</small><div class="mission-job-progress"><i style="width:${percent}%"></i></div>${control}</div>`;
        }).join("");
    }

    async function refreshRecentJobs() {
        try {
            const response = await window.jarvis?.jobs?.list?.();
            const data = response?.data || response || {};
            recentJobs = Array.isArray(data.jobs) ? data.jobs : [];
            const shutdown = await window.jarvis?.system?.getScheduledShutdown?.();
            if ((shutdown?.data || shutdown)?.scheduled) {
                const timer = shutdown?.data || shutdown;
                recentJobs.unshift({ id: "scheduled-shutdown", title: "Scheduled system shutdown", state: "running", stage: new Date(timer.shutdownAt).toLocaleString(), progress: 0, shutdownAt: timer.shutdownAt });
            }
            renderActiveJobs();
            updateDashboardTelemetry();
        } catch (_) {
            const list = $("dashboardActiveJobs");
            if (list) list.innerHTML = '<p class="mission-empty">Task status is unavailable. Open Task Center to check again.</p>';
        }
    }

    function setupDashboardPreferences() {
        const key = "jarvis.dashboard.widgets.v1";
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) {}
        document.querySelectorAll("[data-dashboard-widget]").forEach(input => {
            const name = input.dataset.dashboardWidget;
            if (Object.prototype.hasOwnProperty.call(saved, name)) input.checked = saved[name] !== false;
            const apply = () => {
                document.querySelectorAll(`[data-dashboard-section="${name}"]`).forEach(section => { section.hidden = !input.checked; });
                saved[name] = input.checked;
                try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) {}
            };
            input.addEventListener("change", apply);
            apply();
        });
    }

    async function setDashboardMicrophone(enabled) {
        const voice = window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent;
        const button = $("dashboardMicToggle");
        if (!voice) {
            setText("dashboardVoiceStatus", "Voice engine unavailable");
            return false;
        }
        if (button) button.disabled = true;
        try {
            if (!enabled) {
                voice.autoListen = false;
                voice.mute?.();
                await Promise.resolve(voice.stopListening?.());
                window.WakeWordEngine?.suspend?.();
                updateDashboardTelemetry();
                return true;
            }

            if (typeof voice.init === "function" && !voice.initialized) await voice.init();
            voice.muted = false;
            voice.autoListen = true;
            voice.setMuteUI?.(false);
            const started = await voice.startListening?.();
            const active = started !== false && Boolean(voice.isListening);
            if (!active) {
                voice.autoListen = false;
                voice.mute?.();
                window.WakeWordEngine?.suspend?.();
                setText("dashboardVoiceStatus", voice.lastError || "Microphone did not start");
                return false;
            }
            updateDashboardTelemetry();
            return true;
        } catch (error) {
            voice.autoListen = false;
            voice.mute?.();
            window.WakeWordEngine?.suspend?.();
            setText("dashboardVoiceStatus", safeText(error?.message) || "Microphone could not start");
            return false;
        } finally {
            if (button) button.disabled = false;
            updateDashboardTelemetry();
        }
    }

    function init() {
        if (!$("missionDashboard")) return;
        refreshProfile();
        setText("dashboardClock", new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()));
        window.setInterval(() => {
            setText("dashboardClock", new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()));
            updateDashboardTelemetry();
            updateShutdownCountdown();
        }, 2500);
        updateDashboardTelemetry();
        loadScheduledShutdown();
        setupDashboardPreferences();
        refreshRecentDocuments();
        refreshRecentJobs();
        window.setInterval(() => {
            if (document.body.classList.contains("dashboard-view-active")) refreshRecentJobs();
        }, 5000);
        window.setInterval(() => {
            if (document.body.classList.contains("dashboard-view-active")) refreshRecentDocuments();
        }, 30000);

        $("dashboardAskForm")?.addEventListener("submit", async event => {
            event.preventDefault();
            const input = $("dashboardAskInput");
            const prompt = safeText(input?.value);
            if (!prompt) { input?.focus(); return; }
            document.querySelector('.menu-item[data-view="chat"]')?.click();
            // Let the chat view become visible before transferring the draft.
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const chatInput = $("chatInput");
            if (!chatInput) { input.focus(); return; }
            chatInput.disabled = false;
            chatInput.value = prompt;
            chatInput.dispatchEvent(new Event("input", { bubbles: true }));
            input.value = "";
            if (typeof window.Renderer?.sendMessage === "function") await window.Renderer.sendMessage();
            else $("sendBtn")?.click();
        });
        $("missionDashboard")?.addEventListener("click", async event => {
            const starter = event.target.closest("[data-command-draft]");
            if (starter) {
                const input = $("dashboardAskInput");
                if (input) {
                    input.value = starter.dataset.commandDraft;
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);
                }
                return;
            }
            const openButton = event.target.closest("[data-home-open-document]");
            if (openButton) {
                const doc = recentDocuments[Number(openButton.dataset.homeOpenDocument)];
                if (!doc) return;
                openButton.disabled = true;
                try {
                    const result = await window.jarvis?.documents?.openGenerated?.(doc.path);
                    const data = result?.data || result || {};
                    if (data.success === false) throw new Error(data.error || "JARVIS could not open this document.");
                } catch (error) { showActionError(openButton, error?.message || "Could not open the document."); }
                finally { openButton.disabled = false; }
                return;
            }
            if (event.target.closest("[data-home-create-document]")) {
                document.querySelector('.menu-item[data-view="chat"]')?.click();
                window.setTimeout(() => { const input = $("chatInput"); if (input) { input.value = "Create a PPT on "; input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }, 120);
                return;
            }
            if (event.target.closest("[data-home-start-task]")) {
                document.querySelector('.menu-item[data-view="chat"]')?.click();
                window.setTimeout(() => $("chatInput")?.focus(), 120);
                return;
            }
            const cancel = event.target.closest("[data-home-cancel-job]");
            if (cancel) {
                const job = recentJobs[Number(cancel.dataset.homeCancelJob)];
                if (!job) return;
                cancel.disabled = true;
                try {
                    const result = job.id === "scheduled-shutdown"
                        ? await window.jarvis?.system?.cancelScheduledShutdown?.()
                        : await window.jarvis?.jobs?.cancel?.(job.id);
                    const data = result?.data || result || {};
                    if (data.success === false) throw new Error(data.error || "Could not cancel this task.");
                    await refreshRecentJobs();
                } catch (error) { showActionError(cancel, error?.message || "Could not cancel this task."); cancel.disabled = false; }
                return;
            }
            const retry = event.target.closest("[data-home-retry-job]");
            if (retry) {
                const job = recentJobs[Number(retry.dataset.homeRetryJob)];
                if (!job) return;
                retry.disabled = true;
                try {
                    const payload = job.payload || {};
                    let result;
                    if (job.type === "presentation") result = await window.jarvis?.presentations?.create?.(payload.topic, { ...(payload.options || {}), ...(payload.checkpoint?.stage === "deck-ready" ? { resumeJobId: job.id } : {}) });
                    else if (job.type === "pdf") result = await window.jarvis?.documents?.createPdf?.(payload.topic, { ...(payload.options || {}), ...(payload.checkpoint?.stage ? { resumeJobId: job.id } : {}) });
                    else if (job.type === "spreadsheet") result = await window.jarvis?.documents?.createSpreadsheet?.(payload.request || "Smart personal tracker");
                    else if (job.type === "office-file") result = await window.jarvis?.documents?.createOfficeFile?.(payload.format, payload.request || "", payload.options || {});
                    else if (job.type === "research") result = payload.source === "crossref" ? await window.jarvis?.data?.crossrefSearch?.(payload.query, payload.limit) : await window.jarvis?.data?.researchSearch?.(payload.query, payload.limit);
                    else throw new Error("Open Task Center to retry this task type.");
                    const data = result?.data || result || {};
                    if (data.success === false) throw new Error(data.error || "JARVIS could not restart this task.");
                    await refreshRecentJobs();
                } catch (error) { showActionError(retry, error?.message || "Could not restart this task."); retry.disabled = false; }
            }
        });

        const profileButton = $("dashboardProfileButton");
        profileButton?.addEventListener("click", () => {
            if (window.JARVISUserPanel?.openProfile) window.JARVISUserPanel.openProfile();
            else document.querySelector('.menu-item[data-view="settings"]')?.click();
        });
        document.querySelectorAll("[data-open-view]").forEach(button => {
            button.addEventListener("click", () => document.querySelector(`.menu-item[data-view="${button.dataset.openView}"]`)?.click());
        });
        $("dashboardStartButton")?.addEventListener("click", () => $("start-btn")?.click());
        $("dashboardStopButton")?.addEventListener("click", () => $("stop-btn")?.click());
        $("dashboardMicToggle")?.addEventListener("click", () => {
            const voice = window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent;
            const active = Boolean(voice && !voice.muted && (voice.isListening || window.WakeWordEngine?.active));
            setDashboardMicrophone(!active);
        });
        $("dashboardWakeWordToggle")?.addEventListener("click", () => $("wakeWordToggle")?.click());
        const statusSource = $("systemStatus");
        if (statusSource && typeof MutationObserver !== "undefined") {
            new MutationObserver(updateAssistantStatus).observe(statusSource, { subtree: true, childList: true, characterData: true });
        }
        window.addEventListener("online", updateDashboardTelemetry);
        window.addEventListener("offline", updateDashboardTelemetry);
        window.addEventListener("jarvis:user-changed", refreshProfile);
        window.addEventListener("jarvis:microphone-state", updateDashboardTelemetry);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();


