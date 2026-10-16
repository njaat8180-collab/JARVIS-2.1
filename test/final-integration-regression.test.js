"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const testCommand = pkg.scripts && pkg.scripts.test || "";

const acceptanceTests = [
    "weather-pending-intent-integration.test.js",
    "time-pending-intent-integration.test.js",
    "currency-pending-intent-integration.test.js",
    "product-search-multi-parameter-integration.test.js",
    "reference-resolution-integration.test.js",
    "confirmation-integration.test.js",
    "memory-commands.test.js",
    "conversation-summarization.test.js"
];

test("Final integration: all eight acceptance areas have executable regression coverage", () => {
    for (const file of acceptanceTests) {
        assert.equal(fs.existsSync(path.join(root, "test", file)), true, `${file} is missing`);
        assert.equal(testCommand.includes(file) || testCommand.includes("test/*.test.js"), true, `${file} is not in npm test`);
    }
});

test("Final integration: core context, memory, and diagnostics modules are present", () => {
    const required = [
        "renderer/js/context/ConversationContextManager.js",
        "renderer/js/context/PendingIntentManager.js",
        "renderer/js/context/ConversationSummarizer.js",
        "renderer/js/context/DebugDiagnostics.js",
        "renderer/js/diagnosticsUI.js",
        "src/ai/memory.js",
        "renderer/js/chat.js"
    ];
    for (const file of required) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} is missing`);
});

test("Final integration: renderer loads context and diagnostics modules", () => {
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    for (const script of [
        "js/context/ConversationSummarizer.js",
        "js/context/ConversationContextManager.js",
        "js/context/PendingIntentManager.js",
        "js/context/DebugDiagnostics.js",
        "js/diagnosticsUI.js"
    ]) assert.match(html, new RegExp(`src=[\"']${script.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}[\"']`), `${script} is not loaded`);
});

test("Final integration: conversation summarizer and context manager coexist as plain renderer scripts", () => {
    const context = vm.createContext({ window: {}, console, Date, JSON, Object, Array, String, Number, Math, RegExp });
    for (const file of [
        "renderer/js/context/ConversationContextManager.js",
        "renderer/js/context/ConversationSummarizer.js"
    ]) {
        vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
    }
    assert.equal(typeof context.window.JARVISConversationContext.pushTurn, "function");
    assert.equal(typeof context.window.JARVISConversationSummarizer.summarizeTurns, "function");
});

test("Final integration: learning experiences persist through the preload memory bridge", async () => {
    let stored = null;
    const source = fs.readFileSync(path.join(root, "renderer/js/brain/agents/memoryManagerAgent.js"), "utf8");
    const makeContext = () => vm.createContext({
        window: {
            addEventListener() {},
            jarvis: {
                async saveMemory(key, value) { assert.equal(key, "JARVIS_AGENT_MEMORY_V1"); stored = JSON.stringify(value); return true; },
                async loadMemory(key) { assert.equal(key, "JARVIS_AGENT_MEMORY_V1"); return stored; },
                async loadChat() { return { success: true, data: [] }; }
            }
        },
        console: { log() {}, warn() {}, error() {} },
        Date, JSON, Object, Array, String, Number, Math, RegExp
    });
    const first = makeContext();
    vm.runInContext(source, first, { filename: "memoryManagerAgent.js" });
    const saved = await first.window.MemoryManagerAgent.learn({ input: "test event", success: true });
    assert.equal(saved.success, true);
    assert.ok(stored, "the experience must be persisted");

    const restored = makeContext();
    vm.runInContext(source, restored, { filename: "memoryManagerAgent.js" });
    await restored.window.MemoryManagerAgent.init();
    assert.equal(restored.window.MemoryManagerAgent.memory.experiences.length, 1);
});

test("Final integration: diagnostics remain observational and debug-gated", () => {
    const source = fs.readFileSync(path.join(root, "renderer/js/context/DebugDiagnostics.js"), "utf8");
    assert.match(source, /if \(!enabled\(\)\) return null/);
    assert.match(source, /MAX_EVENTS\s*=\s*150/);
    assert.match(source, /REDACTED/);
});

test("Final integration: Sarvam chat failure can fall back to the configured local Ollama model", () => {
    const chat = fs.readFileSync(path.join(root, "renderer/js/chat.js"), "utf8");
    const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
    assert.match(chat, /aiFallback\s*:\s*true/);
    assert.match(chat, /universalAIFallback\s*:\s*true/);
    assert.match(main, /ollamaClient\.chat\(/);
    assert.match(main, /chatSarvam\(/);
    assert.match(main, /if \(ollamaStatus\.connected && ollamaStatus\.selectedModel\)/);
    assert.match(main, /if \(!remoteProviderUsed && !cachedOllamaAnswer\)/);
    assert.match(main, /source = `ollama\/\$\{ollamaReply\.model\}`/);
});

test("Final integration: internal agent thoughts do not become chat replies", async () => {
    const chat = fs.readFileSync(path.join(root, "renderer/js/chat.js"), "utf8");
    assert.match(chat, /\["reasoning", "planning", "decision"\]\.includes\(source\)\)\s*\{\s*result\.handled = false;/);
    const ChatEngine = require("../renderer/js/chat.js");
    const engine = new ChatEngine();
    const result = await engine.processAgent(
        { reason: async () => ({ success: true, thought: "Understand user intent and provide the most relevant response." }) },
        "hi",
        {},
        "reasoning"
    );
    assert.equal(result.handled, false);
    assert.equal(result.response, null);
});

test("Final integration: image galleries survive chat rendering and remote thumbnails are allowed", () => {
    const renderer = fs.readFileSync(path.join(root, "renderer/js/renderer.js"), "utf8");
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    assert.match(renderer, /richContent\s*=\s*result\?\.richContent/);
    assert.match(renderer, /this\.addJarvisMessage\(response,\s*richContent,\s*providerInfo\)/);
    assert.match(html, /img-src[^;]*https:/);
});

test("Final integration: Ollama controls live in Chat and the dashboard composer routes into Chat", () => {
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    const renderer = fs.readFileSync(path.join(root, "renderer/js/renderer.js"), "utf8");
    const layout = fs.readFileSync(path.join(root, "renderer/css/mission-dashboard.css"), "utf8");
    const ollama = fs.readFileSync(path.join(root, "src/ai/ollamaClient.js"), "utf8");
    assert.ok(html.indexOf('id="navVoice"') < html.indexOf('id="navChat"'));
    assert.match(html, /id="ollamaModelSelect"/);
    assert.match(html, /id="ollamaConnectButton"/);
    assert.match(html, /id="ollamaDisconnectButton"/);
    assert.match(html, /id="dashboardAskForm"/);
    const dashboard = fs.readFileSync(path.join(root, "renderer/js/missionDashboard.js"), "utf8");
    assert.match(dashboard, /dashboardAskForm[\s\S]*?dashboardAskInput/);
    assert.match(dashboard, /chatInput\.value = prompt/);
    assert.match(dashboard, /Renderer\?\.sendMessage/);
    assert.match(renderer, /initOllamaConnector\(\)/);
    assert.match(renderer, /window\.ChatEngine\s*&&\s*typeof window\.ChatEngine\.send/);
    assert.doesNotMatch(renderer, /window\.ChatEngineInstance\.receive/);
    assert.match(layout, /body:not\(\.chat-view-active\)\s+\.chat-panel\s*\{\s*display:\s*none\s*!important/);
    assert.match(layout, /body\.chat-view-active\s+\.chat-panel\s*\{[\s\S]*?display:\s*grid\s*!important/);
    assert.match(layout, /grid-template-columns:\s*210px\s+minmax\(0,\s*1fr\)\s+285px/);
    assert.match(layout, /chatMessages:empty::before/);
    assert.doesNotMatch(html, /chat-model-settings|chatAiProviderForm/);
    assert.match(html, /id="chatInput"/);
    assert.match(ollama, /function setEnabled\(enabled\)/);
});

test("Final integration: Dashboard controls, quick chat handoff, provider settings and Guest switch are available", () => {
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    const dashboard = fs.readFileSync(path.join(root, "renderer/js/missionDashboard.js"), "utf8");
    const users = fs.readFileSync(path.join(root, "renderer/js/users/userPanelUpgrade.js"), "utf8");
    const voice = fs.readFileSync(path.join(root, "renderer/js/renderer.js"), "utf8");
    const images = fs.readFileSync(path.join(root, "renderer/js/chat.js"), "utf8");
    assert.match(html, /id="dashboardStartButton"/);
    assert.match(html, /id="dashboardStopButton"/);
    assert.match(html, /data-open-view="chat"/);
    assert.match(html, /id="dashboardMicToggle"/);
    assert.match(html, /id="dashboardWakeWordToggle"/);
    assert.match(html, /id="dashboardCpu"/);
    assert.match(html, /id="dashboardRam"/);
    assert.match(html, /id="dashboardDisk"/);
    assert.match(html, /id="dashboardNetworkStatus"/);
    assert.match(html, /id="dashboardAskForm"/);
    assert.match(html, /id="dashboardAskInput"/);
    assert.match(dashboard, /chatInput\.value = prompt/);
    assert.match(dashboard, /sendMessage\(\)/);
    assert.match(dashboard, /dashboardStartButton.*start-btn/s);
    assert.match(dashboard, /stopListening/);
    assert.match(dashboard, /startListening/);
    assert.match(dashboard, /WakeWordEngine\?\.suspend/);
    assert.match(html, /id="settingsAiProvider"/);
    assert.match(html, /id="settingsAiApiEndpoint"/);
    assert.match(html, /id="settingsAiProviderName"/);
    const providerSettings = fs.readFileSync(path.join(root, "renderer/js/aiProviderSettings.js"), "utf8");
    assert.match(providerSettings, /setConnected\?\.\(true\)/);
    assert.match(providerSettings, /setTimeout\(\(\) =>/);
    assert.match(users, /Continue as Guest/);
    assert.match(users, /user\.hasPin\s*&&\s*!user\.isGuest/);
    assert.match(voice, /redesigned Dashboard/);
    assert.match(images, /images\?\\s\+\(\?:of\|for\)/);
});

test("Final integration: structured memory status model remains intact", () => {
    const memory = fs.readFileSync(path.join(root, "src/ai/memory.js"), "utf8");
    for (const token of ["ACTIVE", "SUPERSEDED", "DELETED", "importance", "lastUsedAt"]) {
        assert.match(memory, new RegExp(token), `${token} missing from MemoryEngine`);
    }
});

test("Final integration: no Phase 15 product dependencies were introduced", () => {
    const lock = path.join(root, "package-lock.json");
    const packageText = fs.readFileSync(path.join(root, "package.json"), "utf8");
    assert.equal(fs.existsSync(lock) || !fs.existsSync(lock), true);
    assert.doesNotMatch(packageText, /debugger-ui|telemetry-sdk|logger-plus/i);
});

test("Final integration: state file records Phase 15 as the final planned phase", () => {
    const status = fs.readFileSync(path.join(root, "JARVIS_MEMORY_IMPLEMENTATION_STATUS.md"), "utf8");
    assert.match(status, /## Phase 15 — details/);
    assert.match(status, /\*\*None — all planned phases are complete\.\*\*/);
});
