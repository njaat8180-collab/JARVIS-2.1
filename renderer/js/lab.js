"use strict";

(function installJarvisLab() {
    const STORAGE_KEY = "JARVIS_LAB_STATE_V1";
    const IDLE_DELAY = 2 * 60 * 1000;
    const REPEAT_DELAY = 10 * 60 * 1000;
    const MAX_EXPERIMENTS = 30;
    let nextExperimentAt = Date.now() + IDLE_DELAY;
    let processing = false;
    let paused = false;
    let timer = null;
    let initialized = false;
    let creating = false;
    let experiments = [];
    let recentTemplates = [];
    const seenKnowledge = new Set();

    function load() {
        try {
            const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            experiments = Array.isArray(state.experiments) ? state.experiments.slice(0, MAX_EXPERIMENTS) : [];
            recentTemplates = Array.isArray(state.recentTemplates)
                ? state.recentTemplates.map(String).slice(-MAX_EXPERIMENTS)
                : experiments.map(item => String(item?.template || "")).filter(Boolean).slice(0, 5);
            (Array.isArray(state.seenKnowledge) ? state.seenKnowledge : []).forEach(id => seenKnowledge.add(String(id)));
            paused = Boolean(state.paused);
        } catch (_) { experiments = []; recentTemplates = []; }
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ experiments: experiments.slice(0, MAX_EXPERIMENTS), recentTemplates: recentTemplates.slice(-MAX_EXPERIMENTS), seenKnowledge: Array.from(seenKnowledge).slice(-500), paused })); } catch (_) { /* Lab remains usable for this session. */ }
    }

    function el(id) { return document.getElementById(id); }

    function setStatus(text) { const node = el("labStatus"); if (node) node.textContent = text; }

    function appendText(parent, tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(text || "");
        parent.appendChild(node);
        return node;
    }

    function render() {
        const list = el("labExperiments");
        if (!list) return;
        list.replaceChildren();
        const count = el("labExperimentCount");
        if (count) count.textContent = `${experiments.length} EXPERIMENT${experiments.length === 1 ? "" : "S"}`;
        if (!experiments.length) {
            appendText(list, "div", "lab-empty", "After two quiet minutes, JARVIS will choose a runnable coding project. Each new experiment varies the project type.");
            return;
        }
        experiments.forEach(item => {
            const card = document.createElement("article");
            card.className = "lab-experiment-card";
            appendText(card, "div", "lab-card-type", String(item.type || "experiment").replaceAll("-", " ").toUpperCase());
            appendText(card, "h3", "", item.headline);
            appendText(card, "p", "lab-prompt", item.prompt);
            const experimentCode = window.JARVISLabEngine?.getCodeForExperiment?.(item) || "";
            const previewDocument = window.JARVISLabEngine?.getPreviewForExperiment?.(item) || "";
            if (experimentCode && previewDocument) {
                const preview = document.createElement("section");
                preview.className = "lab-preview";
                const launch = appendText(preview, "button", "lab-preview-launch", "PREVIEW & RUN LOCALLY");
                launch.type = "button";
                launch.setAttribute("aria-expanded", "false");
                const status = appendText(preview, "span", "lab-preview-status", "Sandboxed preview · no network or system access");
                const frame = document.createElement("iframe");
                frame.className = "lab-preview-frame";
                frame.title = `${item.headline || "Experiment"} interactive preview`;
                frame.setAttribute("sandbox", "allow-scripts allow-forms");
                frame.referrerPolicy = "no-referrer";
                frame.hidden = true;
                launch.addEventListener("click", () => {
                    const opening = frame.hidden;
                    frame.hidden = !opening;
                    launch.setAttribute("aria-expanded", String(opening));
                    launch.textContent = opening ? "STOP PREVIEW" : "PREVIEW & RUN LOCALLY";
                    if (opening) {
                        frame.srcdoc = previewDocument;
                        status.textContent = "Running locally in an isolated, offline preview";
                    } else {
                        frame.srcdoc = "about:blank";
                        status.textContent = "Preview stopped";
                    }
                });
                preview.append(launch, status, frame);
                card.appendChild(preview);
            }
            if (experimentCode) {
                const codeDetails = document.createElement("details");
                codeDetails.className = "lab-code-viewer";
                const codeSummary = appendText(codeDetails, "summary", "", "VIEW CODE");
                codeSummary.title = "Show the complete source code for this experiment";
                const code = document.createElement("code");
                code.textContent = experimentCode;
                const pre = document.createElement("pre");
                pre.setAttribute("aria-label", "Complete experiment source code");
                pre.appendChild(code);
                codeDetails.appendChild(pre);
                card.appendChild(codeDetails);
            }
            const source = document.createElement("details");
            source.className = "lab-source";
            const summary = appendText(source, "summary", "", `Source: ${item.source?.title || "Verified local knowledge"}`);
            summary.title = "Show the exact approved or verified knowledge used";
            appendText(source, "blockquote", "", item.source?.excerpt || "");
            if (/^https?:\/\//i.test(item.source?.sourceUrl || "")) {
                const link = document.createElement("a");
                link.href = item.source.sourceUrl;
                link.target = "_blank";
                link.rel = "noreferrer noopener";
                link.textContent = item.source.sourceUrl;
                source.appendChild(link);
            }
            card.appendChild(source);
            const label = appendText(card, "label", "lab-reflection-label", "Your prediction or notes");
            const input = document.createElement("textarea");
            input.rows = 2;
            input.maxLength = 1500;
            input.value = item.reflection || "";
            input.placeholder = "Write an observation or prediction (optional)";
            label.appendChild(input);
            const saveButton = appendText(card, "button", "lab-save-reflection", "SAVE NOTES");
            saveButton.type = "button";
            saveButton.addEventListener("click", () => {
                item.reflection = input.value.trim();
                save();
                setStatus("Experiment notes saved locally.");
            });
            const deleteButton = appendText(card, "button", "lab-delete-experiment", "DELETE TEST");
            deleteButton.type = "button";
            deleteButton.title = "Remove this local Lab experiment from the list";
            deleteButton.addEventListener("click", () => {
                experiments = experiments.filter(candidate => candidate.id !== item.id);
                save();
                render();
                setStatus("Local Lab test deleted.");
            });
            appendText(card, "time", "lab-time", new Date(item.createdAt).toLocaleString());
            list.appendChild(card);
        });
    }

    async function createOne(manual = false) {
        if (creating) return false;
        creating = true;
        try {
        if (!window.JARVISLabEngine) return false;
        const experiment = window.JARVISLabEngine.createStarterExperiment(experiments.length, Date.now(), recentTemplates);
        if (!experiment) {
            setStatus("No runnable coding project is available right now.");
            return false;
        }
        recentTemplates.push(String(experiment.template || ""));
        recentTemplates = recentTemplates.slice(-MAX_EXPERIMENTS);
        experiments.unshift(experiment);
        experiments = experiments.slice(0, MAX_EXPERIMENTS);
        save();
        render();
        setStatus(`${manual ? "Random coding experiment ready" : "Idle-time coding experiment ready"}: ${experiment.headline}. Open Preview & Run Locally to use it.`);
        return true;
        } finally { creating = false; }
    }

    function onCommandStart() { nextExperimentAt = Date.now() + IDLE_DELAY; processing = true; setStatus("Command received; automatic experiments are paused until JARVIS finishes and is idle again."); }
    function onCommandEnd() { nextExperimentAt = Date.now() + IDLE_DELAY; processing = false; }

    function tick() {
        if (!initialized) return;
        const chat = window.ChatEngine;
        processing = Boolean(chat?.processing);
        const remaining = Math.max(0, nextExperimentAt - Date.now());
        const countdown = el("labIdleCountdown");
        if (countdown) countdown.textContent = paused ? "AUTO LAB PAUSED" : processing ? "JARVIS IS WORKING" : remaining > 0 ? `NEXT EXPERIMENT IN ${Math.ceil(remaining / 1000)}s` : "IDLE — READY";
        const pauseButton = el("labPause");
        if (pauseButton) { pauseButton.textContent = paused ? "RESUME AUTO LAB" : "PAUSE AUTO LAB"; pauseButton.setAttribute("aria-pressed", String(paused)); }
        if (paused || processing || remaining > 0) return;
        // After its first experiment, wait ten quiet minutes before another.
        // Any new command resets the full two-minute quiet period.
        if (!creating) {
            createOne(false).then(created => {
                nextExperimentAt = Date.now() + (created ? REPEAT_DELAY : 60_000);
            }).catch(() => {
                nextExperimentAt = Date.now() + 60_000;
                setStatus("Lab could not prepare an experiment; it will retry in one minute.");
            });
        }
    }

    function show() { const panel = el("labPanel"); if (panel) panel.hidden = false; }
    function hide() { const panel = el("labPanel"); if (panel) panel.hidden = true; }

    function init() {
        if (initialized) return;
        initialized = true;
        load();
        render();
        window.ChatEngine?.on?.("processingStart", onCommandStart);
        ["messageComplete", "messageError", "messageTimeout", "messageCancelled", "processingEnd"].forEach(name => window.ChatEngine?.on?.(name, onCommandEnd));
        el("labPause")?.addEventListener("click", () => { paused = !paused; save(); tick(); setStatus(paused ? "Automatic experiments paused." : "Automatic experiments resumed."); });
        el("labRunNow")?.addEventListener("click", () => { if (!processing) window.JARVISLab.runOne(); else setStatus("JARVIS is processing a command. Try again when it is finished."); });
        el("labReviewKnowledge")?.addEventListener("click", () => el("navBackgroundEvents")?.click());
        timer = window.setInterval(tick, 1000);
        tick();
    }

    window.JARVISLab = Object.freeze({ init, show, hide, runOne: async () => {
        const created = await createOne(true);
        if (created) nextExperimentAt = Date.now() + REPEAT_DELAY;
        return created;
    }, getState: () => ({ paused, processing: Boolean(window.ChatEngine?.processing), nextExperimentAt, experimentCount: experiments.length }) });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
