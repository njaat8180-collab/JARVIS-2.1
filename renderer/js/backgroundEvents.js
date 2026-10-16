"use strict";

/**
 * JARVIS Background Events UI.
 * Renders only structured data received from the main-process worker.
 * No activity entries are fabricated in the renderer.
 */
(function () {
    const panel = document.getElementById("backgroundEventsPanel");
    const toggle = document.getElementById("learningEngineControl");
    const eventStream = document.getElementById("backgroundEventStream");

    if (!panel || !toggle || !eventStream) return;

    const byId = id => document.getElementById(id);
    const setText = (id, value) => {
        const el = byId(id);
        if (el) el.textContent = value == null || value === "" ? "—" : String(value);
    };

    const events = [];
    const MAX_EVENTS = 120;

    function timeLabel(timestamp) {
        try {
            return new Date(timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
            });
        } catch (_) {
            return "—";
        }
    }

    function friendlyEvent(event) {
        const topic = event.topic ? ` · ${event.topic}` : "";
        const source = event.source ? ` · ${event.source}` : "";
        const messages = {
            LEARNING_STARTED: "Learning Engine started",
            LEARNING_STOPPED: "Learning Engine stopped",
            INTERNET_CONNECTED: event.message || "Internet connection verified",
            INTERNET_DISCONNECTED: event.message || "Internet unavailable — background learning paused",
            SOURCE_SELECTED: `Knowledge source selected${source}${topic}`,
            FETCH_STARTED: `Fetching knowledge${source}${topic}`,
            FETCH_COMPLETED: `Information received${source}${topic}`,
            PROCESSING_STARTED: `Processing knowledge${topic}`,
            PROCESSING_COMPLETED: `Knowledge processing completed${topic}`,
            DUPLICATE_FOUND: `Duplicate found — not stored${topic}`,
            KNOWLEDGE_VERIFIED: `Knowledge verified with ${event.verificationSource || "secondary source"}${topic}`,
            KNOWLEDGE_SAVED: `Knowledge saved${source}${topic}`,
            KNOWLEDGE_REJECTED: `Knowledge rejected${topic}`,
            LEARNING_ERROR: `Learning error${topic}: ${event.message || "Unknown error"}`,
            LEARNING_IDLE: `Learning Engine idle (${event.reason || "waiting"})`,
            KNOWLEDGE_UPDATED: `Knowledge updated${source}${topic}`,
            RETRY_SCHEDULED: `Retry scheduled${source}${topic}`
        };
        return messages[event.type] || event.message || event.type || "Background event";
    }

    function renderEvents() {
        eventStream.textContent = "";
        if (!events.length) {
            const empty = document.createElement("div");
            empty.className = "background-empty";
            empty.textContent = "No live events yet. Press LEARNING ENGINE → ON to begin.";
            eventStream.appendChild(empty);
        } else {
            for (const event of events.slice(-MAX_EVENTS).reverse()) {
                const row = document.createElement("div");
                row.className = "background-event-row";

                const time = document.createElement("time");
                time.textContent = timeLabel(event.timestamp);

                const dot = document.createElement("span");
                dot.className = "background-event-dot";

                const message = document.createElement("span");
                message.className = "background-event-message";
                message.textContent = friendlyEvent(event);

                row.append(time, dot, message);
                eventStream.appendChild(row);
            }
        }
        setText("backgroundEventCount", `${events.length} EVENTS`);
    }

    function renderCurrent(current = {}) {
        setText("backgroundCurrentActivity", current.activity || "Idle");
        setText("backgroundCurrentSource", current.source);
        setText("backgroundCurrentTopic", current.topic);
        setText("backgroundCurrentAction", current.action || "Waiting");
        setText("backgroundCurrentProcessing", current.processingStatus || "IDLE");
        setText("backgroundCurrentStorage", current.storageStatus || "Not active");
        setText("backgroundProcessingStatus", current.processingStatus || "IDLE");

        const link = byId("backgroundCurrentSourceUrl");
        if (link) {
            link.textContent = current.sourceUrl || "—";
            link.href = current.sourceUrl || "#";
            link.style.pointerEvents = current.sourceUrl ? "auto" : "none";
        }

        const live = byId("backgroundLiveIndicator");
        if (live) live.textContent = current.processingStatus || "IDLE";
    }

    function renderStatus(status = {}) {
        const enabled = !!status.enabled;
        const running = !!status.running;
        toggle.classList.toggle("is-on", enabled);
        toggle.classList.toggle("is-off", !enabled);
        toggle.setAttribute("aria-pressed", String(enabled));
        setText("learningEngineState", enabled ? "● ON" : "OFF");
        setText("backgroundLearningStatus", running ? (status.internet === false ? "● OFFLINE" : "● ONLINE") : enabled ? "● STANDBY" : "OFF");
        setText("backgroundLearningStatusDetail",
            !enabled ? "Disabled by preference" :
            running ? (status.internet === false ? "Worker active · offline mode" : "Worker is active") :
            "Enabled · waiting to start");

        const online = status.internet;
        setText("backgroundInternetStatus", online === true ? "● CONNECTED" : online === false ? "DISCONNECTED" : "CHECKING");
        setText("backgroundEventsConnection", online === true ? "CONNECTED" : "OFFLINE");

        renderCurrent(status.current || {});

        const s = status.stats || {};
        setText("backgroundStatSuccess", s.successfulFetches || 0);
        setText("backgroundStatFailed", s.failedFetches || 0);
        setText("backgroundStatSaved", s.saved || 0);

        if (status.storage) {
            setText("backgroundStatKnowledge", status.storage.knowledgeItems || 0);
            setText("backgroundStatSources", status.storage.sourcesUsed || 0);
            setText("backgroundStatTopics", status.storage.topicsLearned || 0);
            setText("backgroundKnowledgeCount", `${status.storage.knowledgeItems || 0} ITEMS`);
        }

        if (status.lastError) {
            setText("backgroundEventsUpdated", `Worker error: ${status.lastError}`);
        }
    }

    function renderRecent(records = []) {
        const box = byId("backgroundRecentKnowledge");
        if (!box) return;
        box.textContent = "";

        if (!records.length) {
            const empty = document.createElement("div");
            empty.className = "background-empty";
            empty.textContent = "No background knowledge has been collected yet.";
            box.appendChild(empty);
            return;
        }

        for (const record of records.slice(0, 12)) {
            const card = document.createElement("article");
            card.className = "background-knowledge-item";

            const title = document.createElement("strong");
            title.textContent = record.topic || "Unknown topic";

            const meta = document.createElement("small");
            meta.textContent = `${record.source || "Unknown source"} · ${record.verified ? "Verified" : "Single-source"} · confidence ${record.confidence ?? "—"}`;

            const content = document.createElement("p");
            content.textContent = record.content || "No content stored.";

            card.append(title, meta, content);

            if (record.sourceUrl) {
                const link = document.createElement("a");
                link.href = record.sourceUrl;
                link.target = "_blank";
                link.rel = "noreferrer noopener";
                link.textContent = "VIEW SOURCE";
                card.appendChild(link);
            }

            box.appendChild(card);
        }
    }

    async function refresh() {
        try {
            const result = await window.jarvis?.backgroundLearning?.status?.();
            if (!result?.success) {
                setText("backgroundEventsUpdated", result?.error || "Background learning bridge unavailable.");
                return;
            }
            renderStatus(result);
            renderRecent(result.recent || []);
            setText("backgroundEventsUpdated", `Live worker telemetry · updated ${timeLabel(new Date().toISOString())}`);
        } catch (error) {
            setText("backgroundEventsUpdated", `Telemetry refresh failed: ${error.message || error}`);
        }
    }

    async function toggleLearning() {
        toggle.disabled = true;
        try {
            const status = await window.jarvis?.backgroundLearning?.status?.();
            const enabled = !!status?.enabled;
            const result = enabled
                ? await window.jarvis.backgroundLearning.disable()
                : await window.jarvis.backgroundLearning.enable();

            if (result?.success === false) {
                setText("backgroundEventsUpdated", result.error || "Unable to change Learning Engine state.");
            }
            await refresh();
        } catch (error) {
            setText("backgroundEventsUpdated", `Learning Engine control failed: ${error.message || error}`);
        } finally {
            toggle.disabled = false;
        }
    }

    toggle.addEventListener("click", toggleLearning);

    byId("backgroundEventsRefresh")?.addEventListener("click", refresh);

    const unsubscribe = window.jarvis?.backgroundLearning?.onEvent?.((event) => {
        if (!event) return;

        if (event.type === "STATE_CHANGED") {
            renderCurrent(event.current || {});
        } else {
            events.push(event);
            if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
            renderEvents();

            if (event.type === "KNOWLEDGE_SAVED" || event.type === "DUPLICATE_FOUND" || event.type === "KNOWLEDGE_REJECTED") {
                refresh();
            }
        }

        if (event.type === "LEARNING_STARTED" || event.type === "LEARNING_STOPPED" || event.type === "STATE_CHANGED") {
            refresh();
        }

        if (event.type === "INTERNET_CONNECTED" || event.type === "INTERNET_DISCONNECTED") {
            setText("backgroundInternetStatus", event.type === "INTERNET_CONNECTED" ? "● CONNECTED" : "DISCONNECTED");
            setText("backgroundEventsConnection", event.type === "INTERNET_CONNECTED" ? "CONNECTED" : "OFFLINE");
        }
    });

    function show() {
        panel.hidden = false;
        document.body.classList.add("background-events-view-active");
        document.body.classList.remove("health-view-active");
        refresh();
    }

    function hide() {
        panel.hidden = true;
        document.body.classList.remove("background-events-view-active");
    }

    window.JarvisBackgroundEvents = { show, hide, refresh, destroy: unsubscribe || (() => {}) };

    renderEvents();
    refresh();

    setInterval(() => {
        if (document.body.classList.contains("background-events-view-active")) refresh();
    }, 3000);
})();
