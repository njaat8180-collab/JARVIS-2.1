"use strict";

(function installAIMessageQueue() {
    const KEY = "JARVIS_AI_MESSAGE_QUEUE_V1";
    const MAX_ITEMS = 50;
    let items = [];
    let targets = [];
    let paused = false;
    let running = false;
    let initialized = false;

    const byId = id => document.getElementById(id);
    const setStatus = (message, error = false) => {
        const node = byId("aiQueueStatus");
        if (node) { node.textContent = String(message || ""); node.dataset.state = error ? "error" : "ready"; }
    };
    const unwrap = value => window.JARVISAIMessageQueueEngine.unwrap(value);

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
            items = Array.isArray(saved.items) ? saved.items.filter(x => x && typeof x.message === "string").slice(-MAX_ITEMS) : [];
            items.forEach(x => { if (x.status === "sending") x.status = "waiting"; });
        } catch (_) { items = []; }
    }
    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify({ items: items.slice(-MAX_ITEMS), selectedTargetId: byId("aiQueueTarget")?.value || "" })); }
        catch (_) { setStatus("Could not save the queue locally. It will remain available until JARVIS closes.", true); }
    }
    function append(parent, tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(text || "");
        parent.appendChild(node);
        return node;
    }

    function render() {
        const list = byId("aiQueueList");
        if (!list) return;
        list.replaceChildren();
        const count = byId("aiQueueCount");
        if (count) count.textContent = `${items.length} MESSAGE${items.length === 1 ? "" : "S"}`;
        const pauseButton = byId("aiQueuePause");
        if (pauseButton) {
            pauseButton.textContent = running ? "PAUSE AFTER CURRENT REPLY" : paused ? "QUEUE PAUSED" : "QUEUE READY";
            pauseButton.disabled = !running;
        }
        const clearButton = byId("aiQueueClear");
        if (clearButton) clearButton.disabled = running;
        const modelSelect = byId("aiQueueTarget");
        if (modelSelect) modelSelect.disabled = running || !targets.length;
        if (!items.length) { append(list, "div", "ai-queue-empty", "Your queued messages and model replies will appear here."); return; }
        items.forEach((item, index) => {
            const card = document.createElement("article");
            card.className = `ai-queue-item ai-queue-${item.status || "waiting"}`;
            const top = document.createElement("div"); top.className = "ai-queue-item-top";
            append(top, "span", "ai-queue-number", `MESSAGE ${String(index + 1).padStart(2, "0")}`);
            append(top, "span", `ai-queue-state ai-queue-state-${item.status}`, String(item.status || "waiting").replaceAll("-", " ").toUpperCase());
            const remove = append(top, "button", "ai-queue-remove", item.status === "error" ? "RETRY" : "REMOVE");
            remove.type = "button";
            remove.disabled = item.status === "sending";
            remove.addEventListener("click", () => {
                if (item.status === "error") { item.status = "waiting"; item.error = ""; persist(); render(); setStatus("Message is ready to retry."); }
                else { items = items.filter(entry => entry.id !== item.id); persist(); render(); }
            });
            card.appendChild(top);
            append(card, "p", "ai-queue-message-text", item.message);
            if (item.error) append(card, "p", "ai-queue-error", item.error);
            if (item.answer) {
                const details = document.createElement("details"); details.className = "ai-queue-answer";
                append(details, "summary", "", "VIEW MODEL REPLY");
                append(details, "p", "", item.answer);
                card.appendChild(details);
            }
            list.appendChild(card);
        });
    }

    async function refreshModels() {
        const select = byId("aiQueueTarget");
        if (!select) return [];
        select.disabled = true;
        setStatus("Checking models currently available in JARVIS…");
        try {
            const [configResult, ollamaResult] = await Promise.all([
                window.jarvis?.aiProvider?.get?.(),
                window.jarvis?.ollama?.status?.()
            ]);
            const configData = unwrap(configResult);
            const config = configData.config || configData;
            const ollama = unwrap(ollamaResult);
            targets = window.JARVISAIMessageQueueEngine.targetsFor(config, ollama);
            const savedValue = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}").selectedTargetId; } catch (_) { return ""; } })();
            select.replaceChildren();
            targets.forEach(target => {
                const option = document.createElement("option");
                option.value = target.id; option.textContent = target.label;
                select.appendChild(option);
            });
            if (!targets.length) {
                const option = document.createElement("option"); option.value = ""; option.textContent = "No usable model configured"; select.appendChild(option);
                setStatus("Connect a JARVIS model in Settings before sending messages.", true);
            } else {
                select.value = targets.some(target => target.id === savedValue) ? savedValue : targets.find(target => target.provider !== "ollama")?.id || targets[0].id;
                const selected = targets.find(target => target.id === select.value);
                setStatus(`Ready to send messages to ${selected?.label}.`);
            }
            select.disabled = running || !targets.length;
            return targets;
        } catch (error) {
            targets = [];
            select.replaceChildren();
            const option = document.createElement("option"); option.value = ""; option.textContent = "Model settings unavailable"; select.appendChild(option);
            setStatus(error?.message || "Could not read configured JARVIS models.", true);
            return [];
        } finally { if (!running && targets.length) select.disabled = false; }
    }

    function selectedTarget(hint = "") {
        if (hint) {
            const requested = String(hint).toLowerCase();
            const match = targets.find(target => `${target.label} ${target.provider} ${target.model} ${target.family || ""}`.toLowerCase().includes(requested));
            if (!match) return null;
            byId("aiQueueTarget").value = match.id;
            return match;
        }
        return targets.find(target => target.id === byId("aiQueueTarget")?.value) || null;
    }

    function enqueue(text, hint = "") {
        if (hint && !selectedTarget(hint)) {
            setStatus(`${hint} is not currently configured as an available JARVIS model. Configure it in Settings first.`, true);
            return 0;
        }
        const added = window.JARVISAIMessageQueueEngine.createItems(text);
        if (!added.length) return 0;
        const room = Math.max(0, MAX_ITEMS - items.length);
        items.push(...added.slice(0, room));
        persist(); render();
        setStatus(items.length >= MAX_ITEMS ? `Added ${Math.min(added.length, room)} message(s). The list is full; remove older items to add more.` : `Added ${Math.min(added.length, room)} message(s) to the queue.`);
        return Math.min(added.length, room);
    }

    async function sendMessage(message, target) {
        if (target.provider === "ollama") {
            const selected = unwrap(await window.jarvis?.ollama?.selectModel?.(target.model));
            if (selected.success === false) throw new Error(selected.error || `Could not select Ollama model ${target.model}.`);
            const enabled = unwrap(await window.jarvis?.ollama?.setConnected?.(true));
            if (enabled.success === false) throw new Error(enabled.error || "Could not connect to Ollama.");
        } else {
            const live = unwrap(await window.jarvis?.aiProvider?.get?.());
            const config = live.config || live;
            const actual = window.JARVISAIMessageQueueEngine.targetsFor(config, {}).find(candidate => candidate.id === target.id);
            if (!actual) throw new Error("The configured API model changed. The queue is paused so messages are not sent to a different model.");
        }
        const result = await window.jarvis?.askBrain?.(message, { source: "ai-message-queue" });
        const data = unwrap(result);
        if (data.success === false || data.error) throw new Error(data.error || "The model could not answer this message.");
        return data;
    }

    async function start(hint = "") {
        if (running) return false;
        running = true; paused = false; render();
        await refreshModels();
        const target = selectedTarget(hint);
        if (!target) { running = false; render(); setStatus(hint ? `The selected provider ${hint} is not currently configured in JARVIS Settings.` : "Select an available model before starting.", true); return false; }
        if (!items.some(item => item.status === "waiting")) { running = false; render(); setStatus("There are no messages waiting. Add a message first."); return false; }
        setStatus(`Sending the first waiting message to ${target.label}. Each next message waits for its reply.`);
        const result = await window.JARVISAIMessageQueueEngine.runSequential(items, target, sendMessage, {
            shouldPause: () => paused,
            onChange: async item => { persist(); render(); if (item.status === "sending") setStatus(`Waiting for ${target.label} to reply…`); },
            onReply: item => {
                setStatus(`Reply received for message ${items.indexOf(item) + 1}. Sending the next message in order…`);
                // A reply delivered by this queue counts for an armed
                // provider-reply action just like a reply in the chat panel.
                Promise.resolve(window.JARVISDeferredShutdown?.onReplyDelivered?.({
                    success: true,
                    response: item.answer,
                    aiProvider: target.provider,
                    aiModel: target.model,
                    aiProviderName: target.family,
                    source: target.remote ? "api/ai-message-queue" : "ollama/ai-message-queue"
                })).catch(error => console.warn("Deferred queue reply action failed:", error?.message || error));
            }
        });
        running = false;
        render();
        if (result.error) setStatus(result.error, true);
        else if (paused) setStatus("Paused after the current reply. Choose SEND IN ORDER to continue.");
        else setStatus("All waiting messages have received replies.");
        return !result.error;
    }

    function pause() { if (!running) return false; paused = true; setStatus("Pause requested. The current reply will finish before the next message is held."); return true; }
    function clear() { if (running) return false; items = []; persist(); render(); setStatus("The message list is clear."); return true; }
    function show() { const panel = byId("aiMessageQueuePanel"); if (panel) panel.hidden = false; }
    function hide() { const panel = byId("aiMessageQueuePanel"); if (panel) panel.hidden = true; }

    function init() {
        if (initialized) return;
        initialized = true;
        load(); render(); refreshModels();
        byId("aiQueueAdd")?.addEventListener("click", () => {
            const input = byId("aiQueueInput");
            const count = enqueue(input?.value || "");
            if (count && input) input.value = "";
        });
        byId("aiQueueInput")?.addEventListener("keydown", event => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); byId("aiQueueAdd")?.click(); }
        });
        byId("aiQueueTarget")?.addEventListener("change", () => { persist(); const target = selectedTarget(); if (target) setStatus(`Selected ${target.label}.`); });
        byId("aiQueueRefreshModels")?.addEventListener("click", refreshModels);
        byId("aiQueueStart")?.addEventListener("click", () => start().catch(error => { running = false; render(); setStatus(error?.message || "Queue failed.", true); }));
        byId("aiQueuePause")?.addEventListener("click", pause);
        byId("aiQueueClear")?.addEventListener("click", clear);
    }

    window.JARVISAIMessageQueue = Object.freeze({ init, show, hide, enqueue, start, pause, clear, refreshModels, open: show, getState: () => ({ items: items.map(item => ({ ...item })), paused, running, targets: targets.map(target => ({ ...target })) }) });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
