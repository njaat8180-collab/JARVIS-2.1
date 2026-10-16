"use strict";

(function () {
    function isDebugEnabled() {
        return !!(window.ChatEngine && window.ChatEngine.config && window.ChatEngine.config.debug);
    }

    function text(value, fallback = "—") {
        const s = String(value == null ? "" : value).trim();
        return s || fallback;
    }

    function render() {
        const panel = document.getElementById("jarvisDiagnosticsPanel");
        if (!panel) return;
        const debug = isDebugEnabled();
        panel.hidden = !debug;
        if (!debug || !window.JARVISDiagnostics) return;

        const snapshot = window.JARVISDiagnostics.snapshot();
        const intent = snapshot.activeIntent || {};
        const topic = snapshot.topic || {};
        const pending = snapshot.pendingIntent || {};
        const state = document.getElementById("diagnosticsState");
        const count = document.getElementById("diagEventCount");
        const intentNode = document.getElementById("diagIntent");
        const topicNode = document.getElementById("diagTopic");
        const pendingNode = document.getElementById("diagPending");
        const log = document.getElementById("diagnosticsLog");

        if (state) state.textContent = "ON";
        if (count) count.textContent = String(snapshot.eventCount || 0);
        if (intentNode) intentNode.textContent = text(intent.intent);
        if (topicNode) topicNode.textContent = text(topic.subject);
        if (pendingNode) pendingNode.textContent = pending.intent ? `${pending.intent} / ${pending.missingParameter || "?"}` : "NONE";

        if (log) {
            log.textContent = "";
            snapshot.events.slice(-40).forEach((event) => {
                const li = document.createElement("li");
                const time = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                li.innerHTML = `<span class="diag-kind">${time} ${event.kind}</span>${event.message.replace(/[<>]/g, "")}`;
                log.appendChild(li);
            });
            log.scrollTop = log.scrollHeight;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const clear = document.getElementById("diagnosticsClear");
        if (clear) clear.addEventListener("click", () => {
            window.JARVISDiagnostics?.clear?.();
            render();
        });
        window.addEventListener("jarvis:diagnostic", render);
        render();
        setInterval(render, 1000);
    });
})();
