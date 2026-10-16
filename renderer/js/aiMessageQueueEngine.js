"use strict";

(function installAIMessageQueueEngine(root) {
    function unwrap(value) { return value?.data || value || {}; }

    function targetsFor(configValue, ollamaValue) {
        const config = unwrap(configValue);
        const ollama = unwrap(ollamaValue);
        const targets = [];
        const provider = String(config.provider || "sarvam").toLowerCase();
        if (["sarvam", "openai-compatible"].includes(provider)) {
            const name = String(config.providerName || "API model").trim();
            const model = String(config.model || "").trim();
            const credentialed = provider === "sarvam" ? Boolean(config.envKeyAvailable || config.hasApiKey) : Boolean(config.hasApiKey);
            const identity = `${name} ${model}`.toLowerCase();
            const family = /\bgemini\b/.test(identity) ? "Gemini" : /\bchat\s*gpt\b|\bopenai\b|\bgpt(?:[-\w.]*)\b/.test(identity) ? "ChatGPT" : name;
            if (name && model && credentialed) targets.push({ id: `api:${provider}:${model}`, provider, model, family, label: `${family} · ${model}`, remote: true });
        } else if (provider === "ollama") {
            const models = Array.isArray(ollama.models) ? ollama.models : [];
            for (const value of models) {
                const model = String(value?.name || value || "").trim();
                if (!model) continue;
                targets.push({ id: `ollama:${model}`, provider: "ollama", model, family: "Ollama", label: `Ollama · ${model}`, remote: false });
            }
        }
        return targets;
    }

    function matchesTarget(target, value) {
        if (!target || !value) return false;
        const result = unwrap(value);
        if (result.success === false || !(result.response || result.text || result.reply)) return false;
        if (String(result.aiProvider || "").toLowerCase() !== target.provider) return false;
        const actualModel = String(result.aiModel || result.model || "").trim();
        return !actualModel || actualModel.toLowerCase() === target.model.toLowerCase();
    }

    function createItems(messages, now = Date.now()) {
        return String(messages || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 20)
            .map((message, index) => ({ id: `q-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`, message: message.slice(0, 5000), status: "waiting", answer: "", error: "", createdAt: now }));
    }

    async function runSequential(items, target, send, hooks = {}) {
        for (const item of items) {
            if (hooks.shouldPause?.()) return { paused: true, completed: 0 };
            if (item.status !== "waiting") continue;
            item.status = "sending";
            item.error = "";
            await hooks.onChange?.(item);
            try {
                const result = unwrap(await send(item.message, target));
                if (!matchesTarget(target, result)) {
                    item.status = "error";
                    item.error = result.error || "The reply did not come from the selected provider/model. Check JARVIS AI Settings; the queue is paused.";
                    await hooks.onChange?.(item);
                    return { paused: true, error: item.error, item };
                }
                item.status = "complete";
                item.answer = String(result.response || result.text || result.reply || "");
                await hooks.onChange?.(item);
                hooks.onReply?.(item);
            } catch (error) {
                item.status = "error";
                item.error = String(error?.message || error || "AI request failed.");
                await hooks.onChange?.(item);
                return { paused: true, error: item.error, item };
            }
        }
        return { paused: false };
    }

    root.JARVISAIMessageQueueEngine = Object.freeze({ targetsFor, matchesTarget, createItems, runSequential, unwrap });
})(typeof window !== "undefined" ? window : globalThis);
