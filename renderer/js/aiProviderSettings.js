"use strict";

(() => {
    const $ = id => document.getElementById(id);
    const unwrap = result => result?.data || result || {};
    const api = () => window.jarvis?.aiProvider;
    const ollamaApi = () => window.jarvis?.ollama;
    const roots = () => [...document.querySelectorAll("[data-ai-provider-form]")];
    let savedConfig = { provider: "sarvam", providerName: "Sarvam AI", endpoint: "https://api.sarvam.ai/v1", model: "sarvam-105b", hasApiKey: false, hasSarvamApiKey: false };
    let ollamaStatus = { models: [], running: false };
    let saveTimer = null;

    function field(root, name) { return root.querySelector(`[data-provider-field="${name}"]`); }
    function status(root, text, isError = false) {
        const element = root.querySelector('[id$="AiProviderStatus"]');
        if (element) { element.textContent = String(text || ""); element.dataset.state = isError ? "error" : "ready"; }
    }
    function updateSummary(config = savedConfig) {
        const name = ["sarvam", "grok", "groq", "openai-compatible"].includes(config.provider)
            ? `${config.providerName || "API model"} · ${config.model || ""}`.trim()
            : `Ollama · ${ollamaStatus.selectedModel || "qwen:1.8b"}`;
        const summary = $("chatAiProviderSummary");
        if (summary) summary.textContent = name;
    }
    function fillOllamaOptions(root) {
        const select = root.querySelector("select[id$='OllamaModel']");
        if (!select) return;
        select.replaceChildren();
        for (const model of ollamaStatus.models || []) {
            const option = document.createElement("option");
            option.value = model.name; option.textContent = model.name; select.appendChild(option);
        }
        if (!select.options.length) {
            const option = document.createElement("option");
            option.value = ""; option.textContent = ollamaStatus.running ? "No installed model" : "Ollama is offline"; select.appendChild(option);
        }
        if (ollamaStatus.selectedModel) select.value = ollamaStatus.selectedModel;
        select.disabled = !(ollamaStatus.models || []).length;
    }
    function fillForm(root, config = savedConfig) {
        const provider = field(root, "provider");
        if (provider) provider.value = config.provider || "sarvam";
        for (const key of ["name", "endpoint", "model", "visionModel"]) {
            const control = field(root, key);
            const configKey = key === "name" ? "providerName" : key;
            if (control) control.value = config[configKey] || "";
        }
        const keyState = root.querySelector("[id$='AiApiKeyState']");
        if (keyState) keyState.textContent = config.apiKeySource === "environment"
            ? `${config.provider === "grok" ? "XAI_API_KEY" : "SARVAM_API_KEY"} found in environment (.env). The key is not shown here.`
            : config.hasApiKey ? "Encrypted key saved. Leave blank to keep it." : "No API key saved.";
        fillOllamaOptions(root);
        updateFields(root);
    }
    function setText(id, value) { const node = $(id); if (node) node.textContent = String(value || "—"); }
    async function refreshProviderHealth() {
        try {
            const response = unwrap(await api()?.health?.());
            if (response.success === false) throw new Error(response.error || "Provider health is unavailable.");
            const sarvam = response.sarvam || {};
            const ollama = response.ollama || {};
            const renderer = response.documentRenderer || {};
            const sarvamState = !sarvam.keyConfigured ? "API key not configured" : sarvam.internet ? "Key configured · internet reachable" : "Key configured · internet unavailable";
            setText("settingsSarvamHealth", sarvamState);
            setText("setupSarvamStep", !sarvam.keyConfigured ? "Needs API key" : sarvam.lastTest?.success ? "Connected · test passed" : sarvam.internet ? "Ready to test" : "Internet unavailable");
            setText("settingsSarvamCredits", sarvam.creditStatus || "Credit balance unavailable");
            setText("settingsOllamaHealth", ollama.running
                ? `${ollama.selectedModel || "Ollama running"} · ${ollama.modelCount} model(s)`
                : ollama.installed ? `Installed, server stopped${ollama.error ? ` · ${ollama.error}` : ""}` : "Not installed");
            setText("setupOllamaStep", ollama.running ? `${ollama.selectedModel || ollama.modelCount + " model(s)"} ready` : ollama.installed ? "Start Ollama" : "Install Ollama for local fallback");
            const lastTest = sarvam.lastTest;
            setText("settingsProviderLastTest", lastTest
                ? `Last test ${new Date(lastTest.at).toLocaleString()} · ${lastTest.success ? "connected" : lastTest.error}`
                : "No connection test yet. Select Test API to check the service.");
            const visionPattern = /llava|qwen(?:2\.5|3)(?:[-:]?vl)|gemma3|moondream|minicpm-v|bakllava/i;
            const visionModel = (ollama.visionModels || []).find(name => visionPattern.test(name)) ||
                (ollama.models || []).map(model => model.name).find(name => visionPattern.test(name));
            const hardware = response.hardware || {};
            const visionResourcesLimited = (Number(hardware.memoryGb) > 0 && Number(hardware.memoryGb) < 8) || (Number(hardware.logicalCores) > 0 && Number(hardware.logicalCores) < 4);
            setText("settingsVisionHealth", visionModel
                ? `Vision model ${visionResourcesLimited ? "detected" : "ready"} · ${visionModel}${visionResourcesLimited ? " · limited PC resources may slow analysis" : ""}`
                : ollama.running ? "No compatible vision model found." : "Ollama is not running.");
            setText("setupVisionStep", visionModel ? `${visionModel}${visionResourcesLimited ? " detected · limited RAM/CPU may slow analysis" : " ready"}` : ollama.running ? "Install a compatible vision model" : "Needs Ollama running");
            setText("setupDocumentRendererStep", renderer.powerPoint ? "Microsoft PowerPoint renderer ready" : "Not installed · using Chromium preview only");
            if (hardware.memoryGb || hardware.logicalCores) setText("settingsVisionHealth", `${visionModel ? `Vision model ${visionResourcesLimited ? "detected" : "ready"} · ${visionModel}${visionResourcesLimited ? " · limited resources may slow analysis" : ""}` : ollama.running ? "No compatible vision model found" : "Ollama is not running"} · ${hardware.memoryGb || "?"} GB RAM · ${hardware.logicalCores || "?"} CPU threads`);
        } catch (error) {
            setText("settingsSarvamHealth", error?.message || "Provider health unavailable");
            setText("settingsSarvamCredits", "Not checked");
            setText("settingsOllamaHealth", "Not checked");
            setText("settingsVisionHealth", "Open Ollama and refresh provider health.");
            setText("setupSarvamStep", "Status unavailable");
            setText("setupOllamaStep", "Status unavailable");
            setText("setupVisionStep", "Status unavailable");
            setText("setupDocumentRendererStep", "Status unavailable");
        }
    }
    function updateFields(root) {
        const selected = field(root, "provider")?.value || "sarvam";
        document.querySelectorAll("[data-provider-quick]").forEach(card => {
            const active = card.dataset.providerQuick === selected;
            card.classList.toggle("is-active", active);
            card.setAttribute("aria-pressed", active ? "true" : "false");
        });
        const useApi = selected !== "ollama";
        const local = root.querySelector("[data-provider-local]");
        const remote = root.querySelector("[data-provider-api]");
        const testButton = root.querySelector("[data-provider-test]");
        const keyField = field(root, "key");
        const keyLabel = root.querySelector('label[for="settingsAiApiKey"]');
        if (keyField) keyField.hidden = false;
        if (keyLabel) keyLabel.hidden = false;
        const keyState = root.querySelector("[id$='AiApiKeyState']");
        if (keyState && selected === "sarvam" && !savedConfig.hasApiKey) keyState.textContent = "Enter your Sarvam key here; it is encrypted on this device. You can also use SARVAM_API_KEY from .env.";
        if (keyState && selected === "grok" && !savedConfig.hasApiKey) keyState.textContent = "Enter your Grok key here; it is encrypted on this device. You can also use XAI_API_KEY from .env.";
        if (keyState && selected === "groq" && !savedConfig.hasApiKey) keyState.textContent = "Enter your Groq key here; it is encrypted on this device. You can also use GROQ_API_KEY from .env.";
        if (local) local.hidden = useApi;
        if (remote) remote.hidden = !useApi;
        if (testButton) testButton.hidden = !useApi && !savedConfig.hasSarvamApiKey;
        if (testButton && selected === "grok") testButton.hidden = !savedConfig.hasApiKey;
        if (testButton && selected === "groq") testButton.hidden = !savedConfig.hasApiKey;
    }
    function copyFormValues(source) {
        for (const root of roots()) {
            if (root === source) continue;
            for (const name of ["provider", "name", "endpoint", "model", "visionModel"]) {
                const from = field(source, name), to = field(root, name);
                if (from && to) to.value = from.value;
            }
            const fromOllama = source.querySelector("select[id$='OllamaModel']");
            const toOllama = root.querySelector("select[id$='OllamaModel']");
            if (fromOllama && toOllama && fromOllama.value) toOllama.value = fromOllama.value;
            updateFields(root);
        }
    }
    function useSarvamDefaults(root) {
        const name = field(root, "name")?.value || "";
        const selectedSarvam = field(root, "provider")?.value === "sarvam";
        if (!selectedSarvam && !/sarvam/i.test(name)) return;
        if (selectedSarvam && field(root, "name")) field(root, "name").value = "Sarvam AI";
        const endpoint = field(root, "endpoint"), model = field(root, "model");
        if (endpoint && (!endpoint.value.trim() || (selectedSarvam && !/api\.sarvam\.ai/i.test(endpoint.value)))) endpoint.value = "https://api.sarvam.ai/v1";
        if (model && (!model.value.trim() || (selectedSarvam && !/^sarvam-105b(?:-conversations)?$/i.test(model.value.trim())))) model.value = "sarvam-105b";
    }
    function useGrokDefaults(root) {
        if (field(root, "provider")?.value !== "grok") return;
        if (field(root, "name") && (!field(root, "name").value.trim() || /sarvam/i.test(field(root, "name").value))) field(root, "name").value = "Grok";
        if (field(root, "endpoint") && (!field(root, "endpoint").value.trim() || /api\.sarvam\.ai/i.test(field(root, "endpoint").value))) field(root, "endpoint").value = "https://api.x.ai/v1";
        if (field(root, "model") && (!field(root, "model").value.trim() || /^sarvam-/i.test(field(root, "model").value))) field(root, "model").value = "grok-4.1-fast";
    }
    function useGroqDefaults(root) {
        if (field(root, "provider")?.value !== "groq") return;
        if (field(root, "name") && (!field(root, "name").value.trim() || /sarvam|grok/i.test(field(root, "name").value))) field(root, "name").value = "Groq";
        if (field(root, "endpoint") && (!field(root, "endpoint").value.trim() || /api\.(sarvam\.ai|x\.ai)/i.test(field(root, "endpoint").value))) field(root, "endpoint").value = "https://api.groq.com/openai/v1";
        if (field(root, "model") && (!field(root, "model").value.trim() || /^(sarvam-|grok-)/i.test(field(root, "model").value))) field(root, "model").value = "openai/gpt-oss-120b";
    }
    async function refreshConfig() {
        const result = unwrap(await api()?.get());
        if (result.success === false) throw new Error(result.error || "Could not load provider settings.");
        savedConfig = result.config || result;
        ollamaStatus = unwrap(await ollamaApi()?.status?.()) || ollamaStatus;
        const historyTurns = $("settingsSarvamHistoryTurns");
        if (historyTurns) historyTurns.value = String(savedConfig.sarvamHistoryTurns ?? 8);
        for (const root of roots()) fillForm(root);
        updateSummary();
        await refreshProviderHealth();
    }
    async function save(root, { automatic = false } = {}) {
        const selected = field(root, "provider")?.value || "sarvam";
        let result;
        if (selected === "ollama") {
            const model = root.querySelector("select[id$='OllamaModel']")?.value || ollamaStatus.selectedModel || "";
            if (model) {
                const selectedResult = unwrap(await ollamaApi()?.selectModel?.(model));
                if (selectedResult.success === false) throw new Error(selectedResult.error || "Could not select the Ollama model.");
            }
            const connected = unwrap(await ollamaApi()?.setConnected?.(true));
            if (connected.success === false) throw new Error(connected.error || "Could not connect Ollama.");
            result = unwrap(await api()?.save({ provider: "ollama" }));
        } else {
            useSarvamDefaults(root);
            useGrokDefaults(root);
            useGroqDefaults(root);
            const providerName = field(root, "name")?.value.trim() || "API model";
            const endpoint = field(root, "endpoint")?.value.trim() || "";
            const model = field(root, "model")?.value.trim() || "";
            const hasKey = savedConfig.hasApiKey || savedConfig.hasSarvamApiKey || Boolean(field(root, "key")?.value.trim());
            if (!providerName || !endpoint || !model || !hasKey) {
                if (!automatic) status(root, "Enter the API key and choose Save and use.");
                return false;
            }
            result = unwrap(await api()?.save({
                provider: selected, providerName, endpoint, model,
                visionModel: field(root, "visionModel")?.value.trim() || "",
                apiKey: field(root, "key")?.value || ""
            }));
        }
        if (result?.success === false) throw new Error(result.error || "Could not save the model provider.");
        await refreshConfig();
        for (const form of roots()) {
            const key = field(form, "key"); if (key) key.value = "";
            status(form, selected === "ollama"
                ? `Now using Ollama · ${ollamaStatus.selectedModel || "local model"}.`
                : `Now using ${savedConfig.providerName} · ${savedConfig.model} for normal conversation.`);
        }
        copyFormValues(root);
        updateSummary();
        return true;
    }
    async function test(root) {
        const providerLabel = savedConfig.provider === "grok" ? "Grok" : savedConfig.hasSarvamApiKey ? "Sarvam AI" : savedConfig.providerName || "configured API";
        status(root, `Sending a short test request to ${providerLabel}…`);
        const result = unwrap(await api()?.test());
        status(root, result.success === false ? (result.error || "API test failed.") : `${result.provider === "sarvam" ? "Sarvam AI" : result.provider === "grok" ? "Grok" : providerLabel} connected · ${result.model || "model responded"}`, result.success === false);
        await refreshProviderHealth();
    }
    function wire(root) {
        const provider = field(root, "provider");
        document.querySelectorAll("[data-provider-quick]").forEach(card => card.addEventListener("click", () => {
            const next = card.dataset.providerQuick;
            if (!next || !provider) return;
            provider.value = next;
            provider.dispatchEvent(new Event("change", { bubbles: true }));
        }));
        provider?.addEventListener("change", () => {
            const vision = field(root, "visionModel");
            if (vision) vision.value = provider.value === savedConfig.provider ? savedConfig.visionModel || "" : provider.value === "groq" ? "qwen/qwen3.8-27b" : "";
            updateFields(root);
            copyFormValues(root);
            if (provider.value === "ollama") save(root).catch(error => status(root, error.message, true));
            else if (savedConfig.hasApiKey && field(root, "endpoint")?.value && field(root, "model")?.value) {
                save(root).catch(error => status(root, error.message, true));
            } else if (provider.value === "sarvam") {
                useSarvamDefaults(root);
                copyFormValues(root);
                status(root, "Enter your Sarvam API key, then choose Save and use.");
            } else if (provider.value === "grok") {
                useGrokDefaults(root);
                copyFormValues(root);
                status(root, "Enter your Grok API key, then choose Save and use.");
            } else if (provider.value === "groq") {
                useGroqDefaults(root);
                copyFormValues(root);
                status(root, "Enter your Groq API key, then choose Save and use.");
            } else status(root, "Enter the API details here, then Save and use.");
        });
        root.querySelector("[data-provider-save]")?.addEventListener("click", () => save(root).catch(error => status(root, error.message, true)));
        root.querySelector("[data-provider-test]")?.addEventListener("click", () => test(root).catch(error => status(root, error.message, true)));
        const ollamaSelect = root.querySelector("select[id$='OllamaModel']");
        ollamaSelect?.addEventListener("change", () => {
            if (field(root, "provider")?.value === "ollama") save(root).catch(error => status(root, error.message, true));
        });
        root.querySelectorAll('[data-provider-field="name"], [data-provider-field="endpoint"], [data-provider-field="model"], [data-provider-field="visionModel"], [data-provider-field="key"]').forEach(input => {
            input.addEventListener("input", () => {
                useSarvamDefaults(root);
                useGrokDefaults(root);
                useGroqDefaults(root);
                copyFormValues(root);
                status(root, "Model details changed. Saving automatically when the required fields are complete.");
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => {
                    if (["sarvam", "grok", "groq", "openai-compatible"].includes(field(root, "provider")?.value)) save(root, { automatic: true }).catch(error => status(root, error.message, true));
                }, 900);
            });
        });
    }
    async function init() {
        for (const root of roots()) wire(root);
        try { await refreshConfig(); }
        catch (error) { for (const root of roots()) status(root, error?.message || "Could not load AI model settings.", true); }
        $("settingsProviderHealthRefresh")?.addEventListener("click", () => refreshProviderHealth());
        $("settingsSetupRefresh")?.addEventListener("click", async () => {
            const button = $("settingsSetupRefresh");
            if (button) { button.disabled = true; button.textContent = "Checking…"; }
            try { ollamaStatus = unwrap(await ollamaApi()?.status?.()) || ollamaStatus; await refreshProviderHealth(); }
            finally { if (button) { button.disabled = false; button.textContent = "Check setup again"; } }
        });
        const focusSetupField = id => {
            const control = $(id);
            control?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            control?.focus?.({ preventScroll: true });
        };
        $("setupSarvamHelp")?.addEventListener("click", () => focusSetupField("settingsAiApiKey"));
        $("setupOllamaHelp")?.addEventListener("click", () => focusSetupField("settingsOllamaModel"));
        $("setupImageHelp")?.addEventListener("click", () => focusSetupField("settingsGoogleCseKey"));
        $("settingsBrowserDiagnostic")?.addEventListener("click", async event => {
            const button = event.currentTarget;
            const output = $("settingsBrowserDiagnosticStatus");
            const browser = window.jarvis?.browser;
            button.disabled = true;
            if (output) output.textContent = "Checking search, direct URL navigation and tab controls…";
            const runStep = async (label, url, expected) => {
                let tabId = "";
                try {
                    const opened = unwrap(await browser?.newTab?.(url));
                    if (opened.success === false || !opened.tabId) throw new Error(opened.error || "Could not open a browser tab.");
                    tabId = opened.tabId;
                    await new Promise(resolve => setTimeout(resolve, 1600));
                    const tabsResponse = unwrap(await browser?.getTabs?.());
                    const tab = (tabsResponse.tabs || []).find(item => item.id === tabId || item.tabId === tabId);
                    if (!tab) throw new Error("The tab did not appear in the browser tab list.");
                    const currentUrl = String(tab.url || tab.currentUrl || "");
                    if (!expected.test(currentUrl)) throw new Error(`Opened, but navigation was not confirmed · ${currentUrl || "URL unavailable"}`);
                    const closed = unwrap(await browser?.closeTab?.(tabId));
                    if (closed.success === false) throw new Error(closed.error || "The tab could not be closed.");
                    tabId = "";
                    return `${label}: passed`;
                } catch (error) {
                    return `${label}: failed · ${error?.message || "check failed"}`;
                } finally { if (tabId) { try { await browser?.closeTab?.(tabId); } catch (_) {} } }
            };
            try {
                const results = [];
                results.push(await runStep("Google search", "https://www.google.com/search?q=JARVIS+browser+diagnostic", /google\.[^/]+\/search/i));
                results.push(await runStep("Direct URL", "https://example.com/", /example\.com/i));
                if (output) { output.style.whiteSpace = "pre-line"; output.textContent = results.join("\n"); }
            } finally {
                button.disabled = false;
            }
        });
        $("settingsSarvamHistoryTurns")?.addEventListener("change", async event => {
            const statusNode = $("settingsSarvamPrivacyStatus");
            try {
                const saved = unwrap(await api()?.savePrivacy?.({ sarvamHistoryTurns: Number(event.target.value) }));
                if (saved.success === false) throw new Error(saved.error || "Could not save the history setting.");
                savedConfig = saved.config || savedConfig;
                if (statusNode) statusNode.textContent = event.target.value === "0" ? "Only the current message will go to Sarvam." : `Up to ${event.target.value} recent messages will go to Sarvam.`;
            } catch (error) {
                if (statusNode) statusNode.textContent = error?.message || "Could not save the history setting.";
            }
        });
        $("settingsClearSarvamHistory")?.addEventListener("click", async () => {
            const statusNode = $("settingsSarvamPrivacyStatus");
            try {
                const cleared = unwrap(await api()?.clearRecentHistory?.());
                if (cleared.success === false) throw new Error(cleared.error || "Could not clear recent context.");
                window.JARVISConversationContext?.clear?.();
                if (statusNode) statusNode.textContent = "Recent conversation context cleared from AI context. Saved facts and visible chat history remain available.";
            } catch (error) {
                if (statusNode) statusNode.textContent = error?.message || "Could not clear recent context.";
            }
        });
        const localRetention = $("settingsLocalHistoryRetention");
        if (localRetention) {
            localRetention.value = window.HistoryEngine?.getRetention?.() || "30";
            localRetention.addEventListener("change", event => {
                window.HistoryEngine?.setRetention?.(event.target.value);
                const statusNode = $("settingsLocalHistoryStatus");
                if (statusNode) statusNode.textContent = event.target.value === "0" ? "Local command history will be kept until you clear it." : `Local command history older than ${event.target.value} day(s) will be removed.`;
            });
        }
        $("settingsClearCommandHistory")?.addEventListener("click", () => {
            window.HistoryEngine?.clear?.();
            const statusNode = $("settingsLocalHistoryStatus");
            if (statusNode) statusNode.textContent = "Local command history cleared from this device.";
        });
        $("settingsPreviewSarvamContext")?.addEventListener("click", async event => {
            const output = $("settingsSarvamContextPreview");
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const preview = unwrap(await api()?.previewRecentHistory?.());
                if (preview.success === false) throw new Error(preview.error || "Context preview unavailable.");
                if (output) {
                    const rows = [`Selected recent messages: ${preview.historyTurns}`, ...((preview.messages || []).map(message => `${message.role.toUpperCase()}: ${message.content}`)), preview.currentPrompt, preview.systemInstruction];
                    output.textContent = rows.join("\n\n");
                    output.hidden = false;
                }
            } catch (error) {
                if (output) { output.textContent = error?.message || "Could not load context preview."; output.hidden = false; }
            } finally { button.disabled = false; }
        });
        $("settingsCopyVisionCommand")?.addEventListener("click", async () => {
            const command = "ollama pull gemma3:4b";
            try {
                await navigator.clipboard.writeText(command);
                setText("settingsVisionHealth", "Setup command copied. Run it in a terminal, then refresh this page.");
            } catch (_) {
                setText("settingsVisionHealth", command);
            }
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
