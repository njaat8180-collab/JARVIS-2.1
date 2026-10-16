"use strict";

/*
 * JARVIS Health Matrix
 *
 * This module intentionally reads the desktop system-info IPC bridge and the
 * live AgentRegistry. It does not manufacture health values when a native
 * subsystem is unavailable.
 */
(function () {
    const healthPanel = document.getElementById("healthPanel");
    const agentList = document.getElementById("healthAgentList");
    const refreshButton = document.getElementById("healthRefreshBtn");
    const preflightButton = document.getElementById("healthPreflightBtn");
    const preflightList = document.getElementById("healthPreflightList");
    const doctorScanButton = document.getElementById("pcDoctorScanBtn");
    const doctorApplyButton = document.getElementById("pcDoctorApplyBtn");
    const doctorSummary = document.getElementById("pcDoctorSummary");
    const doctorIssues = document.getElementById("pcDoctorIssues");

    if (!healthPanel || !agentList) {
        return;
    }

    const requiredAgents = [
        ["ReasoningAgent", "Reasoning and inference"],
        ["BrowserAgent", "Browser navigation and actions"],
        ["KnowledgeAgent", "Knowledge retrieval and indexing"],
        ["SelfLearningAgent", "Pattern learning and adaptation"],
        ["MemoryManagerAgent", "Persistent memory and context"],
        ["LearningAgent", "Feedback and skill refinement"],
        ["TaskPlanner", "Goals, tasks, and scheduling"],
        ["AgentMonitor", "Agent health and recovery"]
    ];

    const byId = id => document.getElementById(id);
    let refreshInFlight = false;
    let doctorReport = null;

    async function runPCDoctor() {
        if (!window.jarvis?.system?.pcDoctorScan) return;
        if (doctorSummary) doctorSummary.textContent = "Running local checks…";
        const result = await window.jarvis.system.pcDoctorScan();
        doctorReport = result?.data || result;
        if (!doctorReport || doctorReport.success === false) { if (doctorSummary) doctorSummary.textContent = doctorReport?.error || "Offline scan failed."; return; }
        if (doctorSummary) doctorSummary.textContent = `${doctorReport.summary} ${doctorReport.offline ? "Offline scan complete." : ""}`;
        if (doctorIssues) {
            const issues = doctorReport.issues || [];
            doctorIssues.innerHTML = issues.length
                ? issues.map(item => `<div class="pc-doctor-issue"><strong>${escapeHTML(item.title)} · ${escapeHTML(item.severity)}</strong><small>${escapeHTML(item.detail)}</small><small class="pc-doctor-fix">Suggested: ${escapeHTML(item.fix)}</small></div>`).join("")
                : `<div class="pc-doctor-pass">✓ No actionable local issues found.</div>`;
        }
        if (doctorApplyButton) doctorApplyButton.hidden = !(doctorReport.safeFixes || []).length;
    }

    async function applyPCDoctorFixes() {
        const fixes = doctorReport?.safeFixes || [];
        if (!fixes.length || !window.jarvis?.system?.pcDoctorApply) return;
        const approved = window.confirm(`JARVIS will apply ${fixes.length} approved safe fix(s). Only app-owned data is touched. Continue?`);
        if (!approved) return;
        const result = await window.jarvis.system.pcDoctorApply(fixes.map(item => item.id), true);
        if (doctorSummary) doctorSummary.textContent = result?.success === false ? (result.error || "Safe fix failed.") : "Approved safe fixes applied. Run another offline scan to verify.";
        await runPCDoctor();
    }

    function renderPreflight(rows) {
        if (!preflightList) return;
        preflightList.innerHTML = rows.map((row) => `<div><span>${escapeHTML(row.label)}</span><strong class="preflight-${escapeHTML(row.state)}">${escapeHTML(row.state.toUpperCase())} · ${escapeHTML(row.detail)}</strong></div>`).join("");
    }

    async function runPreflight() {
        const rows = [];
        const add = (label, state, detail) => rows.push({ label, state, detail });
        add("Renderer", typeof window.jarvis === "object" ? "pass" : "fail", typeof window.jarvis === "object" ? "IPC bridge available" : "IPC bridge unavailable");
        add("Microphone", navigator.mediaDevices?.getUserMedia ? "pass" : "fail", navigator.mediaDevices?.getUserMedia ? "Capture capability available; permission is checked on mic start" : "Browser audio capture is unavailable");

        try {
            const response = await window.jarvis?.aiProvider?.health?.();
            const data = response?.data || response || {};
            const sarvamReady = data.sarvam?.keyConfigured === true || data.hasSarvamApiKey === true;
            add("Sarvam AI", sarvamReady ? "pass" : "warn", sarvamReady ? "API key configured" : "API key not configured");
        } catch (_) { add("Sarvam AI", "warn", "Provider health unavailable"); }

        try {
            const response = await window.jarvis?.ollama?.status?.();
            const data = response?.data || response || {};
            const ready = data.connected === true && Boolean(data.selectedModel);
            add("Ollama fallback", ready ? "pass" : "warn", ready ? `${data.selectedModel} ready` : "Optional fallback is not ready");
        } catch (_) { add("Ollama fallback", "warn", "Local model status unavailable"); }

        try {
            const response = await window.jarvis?.computerUse?.status?.();
            const data = response?.data || response || {};
            add("Computer Use", data.platform === "win32" ? "pass" : "warn", data.platform === "win32" ? "Windows controls available; session starts manually" : "Windows control support unavailable");
        } catch (_) { add("Computer Use", "fail", "Computer control bridge unavailable"); }
        add("Smart PC Doctor", typeof window.jarvis?.system?.pcDoctorScan === "function" && typeof window.jarvis?.system?.pcDoctorApply === "function" ? "pass" : "fail", typeof window.jarvis?.system?.pcDoctorScan === "function" ? "Offline scan and approval-gated fixes available" : "PC Doctor bridge unavailable");
        add("Screen vision", typeof window.JARVISScreenShare?.analyze === "function" ? "pass" : "warn", typeof window.JARVISScreenShare?.analyze === "function" ? "Share a screen and use a local vision model" : "Screen vision module unavailable");
        renderPreflight(rows);
        return rows;
    }

    async function refreshConsciousness() {
        try {
            const result = await window.jarvis?.ai?.consciousnessState?.();

            if (!result?.success) {
                return;
            }

            if (window.JARVISConsciousnessHUD) {
                window.JARVISConsciousnessHUD.render(result.consciousness);
            }

            const health = result.health || {};
            setText("healthMemoryStatus", health.memoryStatus || "N/A");
            setText(
                "healthMemoryFacts",
                Number.isFinite(Number(health.memoryFactCount))
                    ? String(health.memoryFactCount)
                    : "—"
            );
            setText(
                "healthMemoryDetail",
                `${health.memoryFactCount || 0} known fact(s) · cognitive state: ${health.state || "IDLE"}`
            );
        } catch (error) {
            console.debug("Consciousness health refresh:", error);
        }
    }


    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setText(id, value) {
        const element = byId(id);
        if (element) {
            element.textContent = value;
        }
    }

    function setMeter(id, value) {
        const element = byId(id);
        if (!element) {
            return;
        }

        const numeric = Number(value);
        element.style.width = Number.isFinite(numeric)
            ? `${Math.max(0, Math.min(100, numeric))}%`
            : "0%";
        element.classList.toggle("unavailable", !Number.isFinite(numeric));
    }

    function formatUptime(seconds) {
        const total = Math.max(0, Number(seconds) || 0);
        const days = Math.floor(total / 86400);
        const hours = Math.floor((total % 86400) / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const parts = [];

        if (days) parts.push(`${days}d`);
        if (hours || days) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);

        return parts.join(" ");
    }

    function getAgentRows() {
        const registryRows = window.AgentRegistry &&
            typeof window.AgentRegistry.filter === "function"
            ? window.AgentRegistry.filter()
            : [];
        const registryByName = new Map(
            registryRows.map(item => [item.name, item])
        );
        const names = requiredAgents.map(item => item[0]);

        registryRows.forEach(item => {
            if (item && item.name && !names.includes(item.name)) {
                names.push(item.name);
            }
        });

        return names.map(name => {
            const registryItem = registryByName.get(name);
            const definition = requiredAgents.find(item => item[0] === name);
            const status = registryItem
                ? String(registryItem.status || "idle")
                : "offline";
            const health = registryItem
                ? String(registryItem.health || "healthy")
                : "offline";
            const load = registryItem && Number.isFinite(Number(registryItem.load))
                ? Number(registryItem.load)
                : null;
            const stateClass = status === "error" || health === "failed"
                ? "error"
                : status === "offline"
                    ? "offline"
                    : status === "running"
                        ? "running"
                        : "idle";

            return {
                name,
                role: definition ? definition[1] : "Registered JARVIS subsystem",
                status: status.toUpperCase(),
                stateClass,
                load,
                runs: registryItem ? Number(registryItem.runs || 0) : 0,
                errors: registryItem ? Number(registryItem.errors || 0) : 0,
                detail: registryItem
                    ? `${registryItem.enabled === false ? "Disabled" : "Registered"} · ${health}`
                    : "Not registered in AgentRegistry"
            };
        });
    }

    function renderAgents() {
        const rows = getAgentRows();
        const online = rows.filter(item => item.stateClass !== "offline").length;
        const failed = rows.filter(item => item.stateClass === "error").length;
        const onlineRatio = rows.length ? (online / rows.length) : 0;
        setText("healthAgentsCheck", failed ? `${failed} ISSUE${failed > 1 ? "S" : ""}` : `${online}/${rows.length} ONLINE`);

        setText(
            "healthAgentSummary",
            `${online}/${rows.length} online${failed ? ` · ${failed} error` : ""}`
        );

        agentList.innerHTML = rows.map(item => {
            const loadLabel = item.load == null ? "load n/a" : `${item.load}% load`;
            const width = item.load == null ? 0 : Math.max(0, Math.min(100, item.load));

            return `
                <div class="health-agent-row">
                    <div class="health-agent-main">
                        <span class="health-agent-dot ${item.stateClass}"></span>
                        <div>
                            <strong>${escapeHTML(item.name)}</strong>
                            <small>${escapeHTML(item.role)}</small>
                        </div>
                    </div>
                    <div class="health-agent-state ${item.stateClass}">
                        <span>${escapeHTML(item.status)}</span>
                        <small>${escapeHTML(item.detail)}</small>
                    </div>
                    <div class="health-agent-meta">
                        <span>${escapeHTML(loadLabel)}</span>
                        <span>${item.runs} runs · ${item.errors} errors</span>
                    </div>
                    <div class="health-agent-meter"><span style="width:${width}%"></span></div>
                </div>
            `;
        }).join("");
    }

    function renderSystem(data) {
        const cpu = data.cpu || {};
        const memory = data.memory || {};
        const storage = data.storage || {};
        const gpu = data.gpu || {};
        const cpuPercent = Number(cpu.percent);
        const memoryPercent = Number(memory.percent);
        const storagePercent = Number(storage.percent);
        const gpuPercent = Number(gpu.usagePercent);

        setText("healthCpu", Number.isFinite(cpuPercent) ? `${cpuPercent}%` : "N/A");
        setText("healthCpuStatus", Number.isFinite(cpuPercent) ? "LIVE" : "N/A");
        setText(
            "healthCpuDetail",
            `${cpu.cores || "?"} cores · ${cpu.model || "Unknown processor"}`
        );
        setMeter("healthCpuBar", cpuPercent);

        setText("healthRam", Number.isFinite(memoryPercent) ? `${memoryPercent}%` : "N/A");
        setText("healthRamStatus", Number.isFinite(memoryPercent) ? "LIVE" : "N/A");
        setText(
            "healthRamDetail",
            `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)} used`
        );
        setMeter("healthRamBar", memoryPercent);

        setText(
            "healthGpu",
            Number.isFinite(gpuPercent)
                ? `${gpuPercent}%`
                : gpu.available
                    ? "READY"
                    : "N/A"
        );
        setText("healthGpuStatus", gpu.available ? "AVAILABLE" : "N/A");
        setText(
            "healthGpuDetail",
            gpu.model || gpu.status || "GPU telemetry unavailable"
        );
        setMeter("healthGpuBar", gpuPercent);

        setText("healthDisk", Number.isFinite(storagePercent) ? `${storagePercent}%` : "N/A");
        setText("healthDiskStatus", Number.isFinite(storagePercent) ? "LIVE" : "N/A");
        setText(
            "healthDiskDetail",
            `${formatBytes(storage.freeBytes)} free`
        );
        setMeter("healthDiskBar", storagePercent);

        setText("healthPlatform", data.platform || "Unknown");
        setText("healthArch", data.arch || "Unknown");
        setText("healthUptime", formatUptime(data.uptimeSeconds));
        setText(
            "healthNetwork",
            Array.isArray(data.network) && data.network.length
                ? `${data.network.length} interface(s) connected`
                : "No external interface"
        );
        setText(
            "healthMonitor",
            window.AgentMonitor
                ? String(window.AgentMonitor.status || "ready").toUpperCase()
                : "NOT LOADED"
        );

        const agentRows = getAgentRows();
        const agentScore = agentRows.length
            ? (agentRows.filter(item => item.stateClass !== "error" && item.stateClass !== "offline").length / agentRows.length) * 100
            : 0;
        const resourceValues = [cpuPercent, memoryPercent, storagePercent].filter(Number.isFinite);
        const resourceScore = resourceValues.length
            ? resourceValues.reduce((sum, value) => sum + (100 - Math.max(0, Math.min(100, value))), 0) / resourceValues.length
            : 0;
        const overall = resourceValues.length ? Math.round((agentScore * 0.45) + (resourceScore * 0.55)) : null;
        const label = overall == null ? "TELEMETRY UNAVAILABLE" : overall >= 90 ? "SYSTEM OPTIMAL" : overall >= 75 ? "SYSTEM STABLE" : overall >= 55 ? "SYSTEM DEGRADED" : "ATTENTION REQUIRED";

        setText("healthOverallScore", Number.isFinite(overall) ? overall : "—");
        setText("healthOverallLabel", label);
        setText("healthOverallDetail", `${agentRows.filter(item => item.stateClass !== "offline").length}/${agentRows.length} agents available · resource load ${resourceValues.length ? "live" : "unavailable"}`);
        setText("healthCoreCheck", overall == null ? "UNKNOWN" : overall >= 75 ? "NOMINAL" : "CHECK");
        setText("healthTelemetryCheck", resourceValues.length ? "LIVE" : "UNAVAILABLE");
        setText("healthNetworkCheck", Array.isArray(data.network) && data.network.length ? "CONNECTED" : "OFFLINE");
        const featureList = byId("healthFeatureList");
        if (featureList) {
            const labels = { chat: "CHAT / AI", voice: "VOICE", browser: "BROWSER", documents: "PPT + PDF", screenVision: "SCREEN VISION", computerUse: "COMPUTER USE" };
            const rows = data.subsystems && typeof data.subsystems === "object" ? data.subsystems : {};
            featureList.innerHTML = Object.entries(labels).map(([key, label]) => {
                const item = rows[key] || {};
                const state = String(item.status || "unknown").toLowerCase();
                const stateLabel = state === "ready" ? "READY" : state === "fallback" ? "FALLBACK" : state === "setup" ? "SETUP NEEDED" : state === "limited" ? "LIMITED" : "UNKNOWN";
                const detail = item.detail || "No live status was returned.";
                return `<div><span>${escapeHTML(label)}</span><strong class="health-feature-state ${escapeHTML(state)}" title="${escapeHTML(detail)}">${escapeHTML(stateLabel)} · ${escapeHTML(detail)}</strong></div>`;
            }).join("");
        }
    }

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value < 0) {
            return "N/A";
        }

        const units = ["B", "KB", "MB", "GB", "TB"];
        let index = 0;
        let scaled = value;

        while (scaled >= 1024 && index < units.length - 1) {
            scaled /= 1024;
            index++;
        }

        return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
    }

    async function refresh() {
        if (refreshInFlight) return;
        refreshInFlight = true;
        renderAgents();
        refreshConsciousness();

        if (!window.jarvis ||
            !window.jarvis.info ||
            typeof window.jarvis.info.info !== "function") {
            setText("healthUpdated", "Desktop telemetry bridge unavailable");
            setText("healthTelemetryCheck", "UNAVAILABLE");
            refreshInFlight = false;
            return;
        }

        try {
            const result = await window.jarvis.info.info();
            if (!result || result.success === false || !result.data) {
                setText("healthUpdated", "Desktop telemetry returned no data");
                setText("healthTelemetryCheck", "NO DATA");
                return;
            }

            renderSystem(result.data);
            const stamp = new Date().toLocaleTimeString();
            setText("healthUpdated", `Live desktop telemetry · updated ${stamp}`);
            setText("healthTelemetryCheck", "LIVE");
            setText("healthTimestamp", stamp);
        } catch (error) {
            console.warn("Health telemetry refresh failed:", error);
            setText("healthUpdated", "Telemetry refresh failed");
        } finally {
            refreshInFlight = false;
        }
    }

    function show() {
        healthPanel.hidden = false;
        document.body.classList.add("health-view-active");
        refresh();
    }

    function hide() {
        healthPanel.hidden = true;
        document.body.classList.remove("health-view-active");
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", refresh);
    }
    if (preflightButton) {
        preflightButton.addEventListener("click", () => runPreflight().catch(() => renderPreflight([{ label: "Preflight", state: "fail", detail: "Readiness check failed" }])));
    }
    if (doctorScanButton) doctorScanButton.addEventListener("click", () => runPCDoctor().catch(() => { if (doctorSummary) doctorSummary.textContent = "Offline scan failed."; }));
    if (doctorApplyButton) doctorApplyButton.addEventListener("click", () => applyPCDoctorFixes().catch(() => { if (doctorSummary) doctorSummary.textContent = "Safe fix could not be applied."; }));

    window.JarvisHealth = {
        show,
        hide,
        refresh,
        runPreflight
        ,runPCDoctor
    };

    setInterval(() => {
        if (document.body.classList.contains("health-view-active")) {
            refresh();
        }
    }, 3000);
})();
