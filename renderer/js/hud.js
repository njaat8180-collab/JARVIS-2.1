"use strict";

/* HUD bridge: paints immediately, then fills live state from window.jarvis.
   No Node APIs. Subsystem failures stay in the alert strip. */
(function () {
    const alertBar = document.getElementById("hudAlertBar");
    const voiceHud = document.getElementById("hudVoiceState");
    const activityStateHud = document.getElementById("hudActivityState");
    const activityTaskHud = document.getElementById("hudActivityTask");
    const activityToolHud = document.getElementById("hudActivityTool");
    const trustReadout = document.getElementById("hudTrustValue");
    const alerts = new Map();
    let activeActivity = null;
    let completionTimer = null;

    function setAlert(key, message) {
        if (message) alerts.set(key, message);
        else alerts.delete(key);

        if (!alertBar) return;

        if (!alerts.size) {
            alertBar.hidden = true;
            alertBar.textContent = "";
            return;
        }

        alertBar.hidden = false;
        alertBar.textContent = Array.from(alerts.values()).join("  ·  ");
    }

    function getVoice() {
        return window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent || null;
    }

    function getChat() {
        return window.ChatEngine || null;
    }

    function resolveOrbState() {
        const voice = getVoice();
        const chat = getChat();
        const processing = !!(chat && (chat.processing || (chat.runtime && chat.runtime.activeRequests > 0)));

        if (processing && activeActivity?.phase === "working") return activeActivity.state;
        if (processing) return "thinking";
        if (voice && voice.isSpeaking) return "speaking";
        if (voice && voice.isListening && !voice.muted) return "listening";
        return "ready";
    }

    let lastOrbState = "";

    function applyOrb(state) {
        document.body.dataset.orbState = state;
        if (voiceHud) {
            voiceHud.textContent = state === "ready" ? "IDLE" : String(state).toUpperCase();
        }
        if (state === lastOrbState) return;
        lastOrbState = state;
        if (window.OrbEngine && typeof window.OrbEngine.setOrb === "function") {
            const coreState = ["understanding", "planning", "executing", "searching", "reading", "waiting", "success", "error"].includes(state)
                ? (state === "error" ? "offline" : "thinking") : state;
            window.OrbEngine.setOrb(coreState);
            document.body.dataset.orbState = state;
        }
    }

    const ACTIVITY_LABELS = { understanding: "UNDERSTANDING", thinking: "THINKING", planning: "PLANNING", executing: "EXECUTING", searching: "SEARCHING", reading: "READING", waiting: "WAITING", success: "COMPLETED", error: "ERROR" };

    function renderActivity(event) {
        const detail = event?.detail || {};
        const phase = String(detail.phase || "");
        if (phase === "working" && completionTimer) { clearTimeout(completionTimer); completionTimer = null; }
        activeActivity = { ...detail };
        if (activityStateHud) activityStateHud.textContent = ACTIVITY_LABELS[detail.state] || (phase === "working" ? "WORKING" : "IDLE");
        if (activityTaskHud && detail.task) activityTaskHud.textContent = String(detail.task).replace(/\s+/g, " ").slice(0, 140);
        if (activityToolHud && (detail.tool || detail.operation)) {
            activityToolHud.textContent = [detail.tool, detail.operation].filter(Boolean).join(" · ").slice(0, 72);
        }
        document.body.dataset.activityState = phase === "working" ? String(detail.state || "thinking") : phase;
        if (phase === "completed" || phase === "failed") {
            completionTimer = setTimeout(() => {
                if (activeActivity?.requestID !== detail.requestID) return;
                if (activityStateHud) activityStateHud.textContent = "IDLE";
                document.body.dataset.activityState = "idle";
                activeActivity = null;
                completionTimer = null;
            }, 2600);
        }
    }

    function stampMessages() {
        const box = document.getElementById("chatMessages");
        if (!box) return;
        box.querySelectorAll(".message").forEach((node) => {
            if (node.querySelector(".msg-time")) return;
            const time = document.createElement("span");
            time.className = "msg-time";
            time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            node.appendChild(time);
        });
    }

    async function refreshConsciousness() {
        try {
            const api = window.jarvis && window.jarvis.ai && window.jarvis.ai.consciousnessState;
            if (typeof api !== "function") {
                setAlert("consciousness", "CONSCIOUSNESS BRIDGE UNAVAILABLE");
                return;
            }

            const result = await Promise.race([
                api(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500))
            ]);

            if (!result || result.success === false) {
                setAlert("consciousness", "CONSCIOUSNESS LINK DEGRADED");
                return;
            }

            setAlert("consciousness", null);
            const state = result.consciousness || {};
            document.body.dataset.mood = String(state.mood || "calm").toLowerCase();
            if (trustReadout) {
                const trust = Math.round((Number(state.trustLevel) || 0) * 100);
                trustReadout.textContent = String(trust).padStart(2, "0");
            }
            if (window.JARVISConsciousnessHUD && typeof window.JARVISConsciousnessHUD.render === "function") {
                window.JARVISConsciousnessHUD.render(state);
            }
        } catch (error) {
            setAlert("consciousness", "CONSCIOUSNESS LINK DEGRADED");
        }
    }

    async function refreshDiagnostics() {
        try {
            const diag = window.jarvis && window.jarvis.diagnostics;
            if (!diag || typeof diag.getStatus !== "function") {
                setAlert("diagnostics", "DIAGNOSTICS BRIDGE UNAVAILABLE");
                return;
            }

            const status = diag.getStatus();
            if (!status || status.status !== "online") {
                setAlert("diagnostics", "PRELOAD DIAGNOSTICS OFFLINE");
            } else {
                setAlert("diagnostics", null);
            }

            // status.js owns live CPU/RAM/disk/network polling and its UI.
            // The HUD only checks that the bridge exists, avoiding a second
            // system-info IPC request every four seconds.
            const infoApi = window.jarvis && window.jarvis.info && window.jarvis.info.info;
            setAlert("telemetry", typeof infoApi === "function" ? null : "TELEMETRY BRIDGE UNAVAILABLE");

            const registry = window.AgentRegistry;
            if (registry && typeof registry.filter === "function") {
                const failed = registry.filter().filter((row) => {
                    const health = String(row.health || "").toLowerCase();
                    const status = String(row.status || "").toLowerCase();
                    return health === "failed" || status === "error";
                });
                if (failed.length) {
                    setAlert("modules", "MODULE FAULT: " + failed.map((row) => row.name).join(", ").toUpperCase());
                } else {
                    setAlert("modules", null);
                }
            }
        } catch (error) {
            // Diagnostics are optional. A transient bridge timeout must not
            // keep raising a full-width banner and shifting the app layout.
            setAlert("diagnostics", null);
            console.debug("[HUD] Diagnostics refresh skipped:", error?.message || error);
        }
    }

    function tick() {
        applyOrb(resolveOrbState());
        stampMessages();
    }

    document.addEventListener("DOMContentLoaded", () => {
        window.addEventListener("jarvis:activity", renderActivity);
        tick();
        setTimeout(() => {
            refreshConsciousness();
            refreshDiagnostics();
        }, 0);
        setInterval(tick, 250);
        setInterval(refreshConsciousness, 1500);
        setInterval(refreshDiagnostics, 4000);
    });
})();
