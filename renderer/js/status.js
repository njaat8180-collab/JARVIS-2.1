// ============================================
// JARVIS 4.0
// Status Engine
// ============================================

"use strict";

const Status = {

    system: "OFFLINE",
    mode: "IDLE",
    voice: "READY",
    network: "OFFLINE"

};

// ============================================
// Elements
// ============================================

const systemStatus = document.getElementById("systemStatus");



const voiceStatus = document.getElementById("voiceStatus");

const networkStatus = document.getElementById("networkStatus");

// ============================================

function update(el, value) {

    if (el) {

        el.textContent = value;

    }

}

function updateMetric(el, value, available) {
    if (!el) return;
    el.textContent = value;
    el.dataset.available = available ? "true" : "false";
    el.setAttribute("aria-label", available ? `Live reading: ${value}` : "Reading unavailable");
}

function updateSystemStatus(value) {

    Status.system = value;
    update(systemStatus, value);

}

function updateMode(value){

    Status.mode = value;

}

function updateVoice(value) {

    Status.voice = value;
    update(voiceStatus, value);

}

function updateNetwork(value) {

    Status.network = value;
    update(networkStatus, value);

}

// ============================================
// Helper Functions
// ============================================

function setOrb(state) {

    if (window.OrbEngine) {

        OrbEngine.setOrb(state);

    }

}

function visualizerStart() {

    if (window.Visualizer) {

        Visualizer.start();

    }

}

function visualizerStop() {

    if (window.Visualizer) {

        Visualizer.stop();

    }

}

function visualizerThinking() {

    if (window.Visualizer && Visualizer.thinking) {

        Visualizer.thinking();

    }

}

// ============================================
// Status Functions
// ============================================

function setOffline() {

    updateSystemStatus("OFFLINE");
    updateMode("IDLE");
    updateVoice("READY");
    updateNetwork("OFFLINE");

    setOrb("offline");
    visualizerStop();

}

function setStarting() {

    updateSystemStatus("STARTING...");
    updateMode("BOOTING");
    updateVoice("INITIALIZING");
    updateNetwork("CONNECTING");

    setOrb("starting");

}

function setListening() {

    updateSystemStatus("LISTENING");
    updateMode("ACTIVE");
    updateVoice("LISTENING");
    updateNetwork("ONLINE");

    setOrb("listening");
    visualizerStart();

}

function setThinking() {

    updateSystemStatus("THINKING");
    updateMode("PROCESSING");
    updateVoice("WAIT");
    updateNetwork("ONLINE");

    setOrb("thinking");
    visualizerThinking();

}

function setSpeaking() {

    updateSystemStatus("SPEAKING");
    updateMode("ACTIVE");
    updateVoice("SPEAKING");
    updateNetwork("ONLINE");

    setOrb("speaking");
    visualizerStart();

}

function setReady() {

    updateSystemStatus("READY");
    updateMode("ACTIVE");
    updateVoice("READY");
    updateNetwork("ONLINE");

    setOrb("ready");
    visualizerStop();

}

// ============================================

window.JarvisStatus = {

    setOffline,
    setStarting,
    setListening,
    setThinking,
    setSpeaking,
    setReady

};

// ============================================
// LIVE SYSTEM STATS (CPU / RAM / DISK)
// These elements previously showed hardcoded
// "0%" placeholders with no JS ever touching
// them. Polls the real system:info IPC channel.
// ============================================

const cpuUsageEl = document.getElementById("cpuUsage");
const memoryUsageEl = document.getElementById("memoryUsage");
const cpuPercentEl = document.getElementById("cpuPercent");
const ramPercentEl = document.getElementById("ramPercent");
const diskPercentEl = document.getElementById("diskPercent");
const netSpeedEl = document.getElementById("netSpeed");
const systemPlatformEl = document.getElementById("systemPlatform");
const systemUptimeEl = document.getElementById("systemUptime");
const batteryStatusEl = document.getElementById("batteryStatus");
let statsRefreshInFlight = false;

function formatUptime(seconds) {
    if (seconds === null || seconds === undefined || seconds === "" || !Number.isFinite(Number(seconds))) return "N/A";
    const total = Math.max(0, Math.floor(Number(seconds)));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return [days ? `${days}d` : "", `${hours}h`, `${minutes}m`].filter(Boolean).join(" ");
}

function formatPlatform(platform) {
    const names = { win32: "Windows", darwin: "macOS", linux: "Linux" };
    return names[platform] || (platform ? String(platform) : "N/A");
}

function formatOperatingSystem(data) {
    const name = formatPlatform(data?.platform);
    if (name === "N/A") return name;
    const version = String(data?.osVersion || "").trim();
    return version ? `${name} ${version}` : name;
}

function formatBattery(battery) {
    if (!battery || battery.percent === null || battery.percent === undefined) return "N/A";
    const percent = Number(battery.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return "N/A";
    return `${Math.round(percent)}%`;
}

function formatMB(bytes) {
    if (bytes === null || bytes === undefined || bytes === "") return "N/A";
    const value = Number(bytes);
    return Number.isFinite(value) && value >= 0
        ? Math.round(value / (1024 * 1024)) + " MB"
        : "N/A";
}

function formatGB(bytes) {
    if (bytes === null || bytes === undefined || bytes === "") return "N/A";
    const value = Number(bytes);
    return Number.isFinite(value) && value >= 0
        ? `${(value / (1024 ** 3)).toFixed(1)} GB`
        : "N/A";
}

function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "N/A";
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
        ? `${Math.round(numeric)}%`
        : "N/A";
}

async function refreshSystemStats() {

    if (!window.jarvis || !window.jarvis.info || typeof window.jarvis.info.info !== "function") {
        [cpuUsageEl, cpuPercentEl, memoryUsageEl, ramPercentEl, diskPercentEl, netSpeedEl, systemPlatformEl, systemUptimeEl, batteryStatusEl]
            .forEach((element) => updateMetric(element, "N/A", false));
        return;
    }
    if (statsRefreshInFlight) return;
    statsRefreshInFlight = true;

    try {
        const result = await window.jarvis.info.info();

        if (!result || result.success === false || !result.data) {
            [cpuUsageEl, cpuPercentEl, memoryUsageEl, ramPercentEl, diskPercentEl, netSpeedEl, systemPlatformEl, systemUptimeEl, batteryStatusEl]
                .forEach((element) => updateMetric(element, "N/A", false));
            return;
        }

        const data = result.data;

        const cpuText = formatPercent(data.cpu?.percent);
        const memoryPercent = formatPercent(data.memory?.percent);
        const diskPercent = formatPercent(data.storage?.percent);
        const memoryUsed = formatGB(data.memory?.usedBytes);
        const memoryTotal = formatGB(data.memory?.totalBytes);
        const memoryText = memoryUsed === "N/A" || memoryTotal === "N/A"
            ? "N/A"
            : `${memoryUsed} / ${memoryTotal} · ${memoryPercent}`;
        const diskUsed = formatGB(data.storage?.usedBytes);
        const diskTotal = formatGB(data.storage?.totalBytes);
        const diskText = diskUsed === "N/A" || diskTotal === "N/A"
            ? "N/A"
            : `${diskUsed} / ${diskTotal} · ${diskPercent}`;
        updateMetric(cpuUsageEl, cpuText, cpuText !== "N/A");
        updateMetric(cpuPercentEl, cpuText, cpuText !== "N/A");
        updateMetric(memoryUsageEl, memoryText, memoryText !== "N/A");
        updateMetric(ramPercentEl, memoryPercent, memoryPercent !== "N/A");
        updateMetric(diskPercentEl, diskText, diskText !== "N/A");

        const platformText = formatOperatingSystem(data);
        const uptimeText = formatUptime(data.uptimeSeconds);
        const batteryText = formatBattery(data.battery);
        updateMetric(systemPlatformEl, platformText, platformText !== "N/A");
        updateMetric(systemUptimeEl, uptimeText, uptimeText !== "N/A");
        updateMetric(batteryStatusEl, batteryText, batteryText !== "N/A");

        // Real network *throughput* (KB/s) isn't available without a
        // native perf-counter API — rather than fabricate a number,
        // this honestly reflects connectivity state instead.
        if (Array.isArray(data.network)) {
            const networkText = navigator.onLine && data.network.length > 0 ? "ONLINE" : "OFFLINE";
            updateMetric(netSpeedEl, networkText, true);
            updateMetric(networkStatus, networkText, true);
        } else {
            updateMetric(netSpeedEl, "N/A", false);
            updateMetric(networkStatus, "N/A", false);
        }

    } catch (error) {
        console.warn("⚠ System stats refresh failed:", error);
        [cpuUsageEl, cpuPercentEl, memoryUsageEl, ramPercentEl, diskPercentEl, netSpeedEl, networkStatus, systemPlatformEl, systemUptimeEl, batteryStatusEl]
            .forEach((element) => updateMetric(element, "N/A", false));
    } finally {
        statsRefreshInFlight = false;
    }
}

if (cpuUsageEl || memoryUsageEl || cpuPercentEl || ramPercentEl || diskPercentEl || netSpeedEl) {
    refreshSystemStats();
    setInterval(refreshSystemStats, 3000);
}

// ============================================
// Initial State
// ============================================

setOffline();
