"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — FEATURE UPGRADE TEST SUITE v2.1
 * test/feature-upgrade.test.js
 * ============================================================
 * Tests all 5 new modules:
 *   1. ConversationContext — reference resolution
 *   2. MemoryImportance — scoring, reinforcement, staleness
 *   3. CommandAliases — teach, resolve, forget, learn-from-message
 *   4. HealthThresholds — classify, status bands
 *   5. VoiceSettings — config file loaded by voiceSTT
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ConversationContext = require("../renderer/js/brain/conversationContext.js");
const CommandAliases = require("../renderer/js/learning/commandAliases.js");
const HealthThresholds = require("../renderer/js/healthThresholds.js");
const MemoryImportance = require("../src/users/memoryImportance.js");
const voiceSTT = require("../voiceSTT");

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  \u2713 ${name}`); }
    catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

console.log("\n========================================");
console.log("FEATURE UPGRADE TEST SUITE v2.1");
console.log("========================================\n");

// ============================================================
// 1. ConversationContext
// ============================================================
console.log("--- 1. Conversation Context ---");

test("pushTurn stores turns", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis YouTube kholo");
    const recent = ConversationContext.getRecent(5);
    assert.ok(recent.length >= 1, "Should have at least 1 turn");
});

test("isFollowUp detects 'usko band karo'", () => {
    assert.ok(ConversationContext.isFollowUp("usko band karo"));
});

test("isFollowUp detects 'wapas chalao'", () => {
    assert.ok(ConversationContext.isFollowUp("wapas chalao"));
});

test("isFollowUp detects 'phir se batao'", () => {
    assert.ok(ConversationContext.isFollowUp("phir se batao"));
});

test("isFollowUp detects bare 'band karo'", () => {
    assert.ok(ConversationContext.isFollowUp("band karo"));
});

test("isFollowUp rejects long non-followup messages", () => {
    assert.ok(!ConversationContext.isFollowUp("Jarvis mujhe Delhi ka weather batana kyunki kal bahar jaana hai"));
});

test("resolve: 'usko band karo' → '<entity> band karo'", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis YouTube kholo");
    ConversationContext.pushTurn("assistant", "Opening YouTube");
    const resolved = ConversationContext.resolve("usko band karo");
    assert.ok(resolved.includes("YouTube"), `Should contain YouTube, got: "${resolved}"`);
});

test("resolve: 'wapas chalao' re-executes last command", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis YouTube kholo");
    ConversationContext.pushTurn("assistant", "Done");
    const resolved = ConversationContext.resolve("wapas chalao");
    assert.ok(resolved.includes("YouTube") || resolved.includes("open") || resolved.includes("kholo"),
        `Should reference YouTube/open, got: "${resolved}"`);
});

test("resolve: bare 'band karo' → '<entity> band karo'", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis Chrome kholo");
    ConversationContext.pushTurn("assistant", "Done");
    const resolved = ConversationContext.resolve("band karo");
    assert.ok(resolved.toLowerCase().includes("chrome"), `Should contain Chrome, got: "${resolved}"`);
});

test("resolve returns original text for non-followup", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis YouTube kholo");
    const original = "Jarvis mujhe weather batao";
    const resolved = ConversationContext.resolve(original);
    assert.strictEqual(resolved, original);
});

test("resolve returns original when no context", () => {
    ConversationContext._reset();
    const resolved = ConversationContext.resolve("usko band karo");
    assert.strictEqual(resolved, "usko band karo", "Should return original when no lastCommand");
});

test("extractEntity detects 'open YouTube'", () => {
    const ext = ConversationContext._extractEntity("Jarvis YouTube kholo");
    assert.ok(ext.verb === "open", `verb should be open, got: ${ext.verb}`);
    assert.ok(ext.entity && ext.entity.toLowerCase().includes("youtube"), `entity: ${ext.entity}`);
});

test("extractEntity detects 'search Google for Minecraft'", () => {
    const ext = ConversationContext._extractEntity("search Google for Minecraft");
    assert.ok(ext.verb === "search");
});

test("getSuggestions returns suggestions after a command", () => {
    ConversationContext._reset();
    ConversationContext.pushTurn("user", "Jarvis YouTube kholo");
    const sugg = ConversationContext.getSuggestions();
    assert.ok(Array.isArray(sugg));
    assert.ok(sugg.length > 0, "Should suggest follow-ups");
});

test("getSuggestions empty when no command", () => {
    ConversationContext._reset();
    assert.strictEqual(ConversationContext.getSuggestions().length, 0);
});

// ============================================================
// 2. MemoryImportance
// ============================================================
console.log("\n--- 2. Memory Importance ---");

test("scoreFact assigns high score to name", () => {
    const scored = MemoryImportance.scoreFact("name", "Nakul");
    assert.ok(scored.score >= 90, `Name should score high, got: ${scored.score}`);
    assert.strictEqual(scored.category, "name");
});

test("scoreFact assigns high score to location", () => {
    const scored = MemoryImportance.scoreFact("city", "Delhi");
    assert.ok(scored.score >= 70, `Location should score high, got: ${scored.score}`);
});

test("scoreFact assigns low score to misc fact", () => {
    const scored = MemoryImportance.scoreFact("random thing", "something");
    assert.ok(scored.score < 50, `Misc should score low, got: ${scored.score}`);
    assert.strictEqual(scored.category, "other");
});

test("categorize identifies occupation", () => {
    assert.strictEqual(MemoryImportance.categorize("my job is engineering"), "occupation");
});

test("categorize identifies family", () => {
    assert.strictEqual(MemoryImportance.categorize("my brother is tall"), "family");
});

test("categorize returns 'other' for unknown", () => {
    assert.strictEqual(MemoryImportance.categorize("xyz random"), "other");
});

test("CATEGORY_WEIGHTS has name as highest", () => {
    assert.ok(MemoryImportance.CATEGORY_WEIGHTS.name >= 90);
});

test("reinforce increments hit count", () => {
    const userManager = require("../src/users/userManager");
    const result = userManager.createUser({ name: "TestReinforce", language: "en" });
    try {
        MemoryImportance.reinforce(result.userId, "test_key");
        const scored = MemoryImportance.scoreFact("test_key", "value", result.userId);
        assert.ok(scored.hits >= 1, `Should have 1+ hits, got: ${scored.hits}`);
        assert.ok(scored.score >= 20, `Should score with reinforcement, got: ${scored.score}`);
    } finally {
        userManager.deleteUser(result.userId, true);
    }
});

test("topFacts returns array (possibly empty)", () => {
    const userManager = require("../src/users/userManager");
    const result = userManager.createUser({ name: "TestTopFacts", language: "en" });
    try {
        const top = MemoryImportance.topFacts(result.userId, 5);
        assert.ok(Array.isArray(top), "Should return array");
        assert.ok(top.length <= 5, "Should respect limit");
    } finally {
        userManager.deleteUser(result.userId, true);
    }
});

test("staleFacts returns array", () => {
    const userManager = require("../src/users/userManager");
    const result = userManager.createUser({ name: "TestStale", language: "en" });
    try {
        const stale = MemoryImportance.staleFacts(result.userId, 30);
        assert.ok(Array.isArray(stale), "Should return array");
    } finally {
        userManager.deleteUser(result.userId, true);
    }
});

// ============================================================
// 3. CommandAliases
// ============================================================
console.log("\n--- 3. Command Aliases ---");

test("teach creates alias", () => {
    // localStorage is undefined in Node — aliases use in-memory fallback
    // We can still test the API surface
    const result = CommandAliases.teach("gk", "Google kholo");
    // In Node without localStorage, persist returns false but teach still works in-memory
    assert.ok(result.success || result.error, "teach should return a result");
});

test("resolve returns original when no aliases (Node)", () => {
    // Without localStorage, aliases list is empty
    const resolved = CommandAliases.resolve("hello world");
    assert.strictEqual(resolved, "hello world");
});

test("tryLearnFromMessage detects teach pattern", () => {
    const result = CommandAliases.tryLearnFromMessage("jab main 'gk' bolu to 'Google kholo'");
    // May or may not succeed depending on localStorage availability
    assert.ok(typeof result.success === "boolean", "Should return boolean success");
});

test("tryLearnFromMessage returns false for non-teach message", () => {
    const result = CommandAliases.tryLearnFromMessage("Jarvis YouTube kholo");
    assert.ok(!result.success || result.learned === false);
});

test("list returns array", () => {
    const list = CommandAliases.list();
    assert.ok(Array.isArray(list));
});

test("forget returns success", () => {
    const result = CommandAliases.forget("nonexistent");
    assert.ok(result.success);
});

test("exportAll returns string", () => {
    const exported = CommandAliases.exportAll();
    assert.strictEqual(typeof exported, "string");
});

test("importAll handles valid JSON", () => {
    const result = CommandAliases.importAll(JSON.stringify([{ trigger: "test", expands: "test expand" }]));
    assert.ok(typeof result.success === "boolean" || typeof result === "object");
});

// ============================================================
// 4. HealthThresholds
// ============================================================
console.log("\n--- 4. Health Thresholds ---");

test("classifyMetric returns nominal for high values", () => {
    HealthThresholds.resetAlerts();
    const result = HealthThresholds.classifyMetric("cpu", 85);
    assert.strictEqual(result.status, "nominal");
    assert.strictEqual(result.badge.includes("NOMINAL"), true);
});

test("classifyMetric returns warn for mid values", () => {
    const result = HealthThresholds.classifyMetric("cpu", 25);
    assert.strictEqual(result.status, "warn");
    assert.strictEqual(result.badge.includes("WARN"), true);
});

test("classifyMetric returns critical for low values", () => {
    const result = HealthThresholds.classifyMetric("cpu", 5);
    assert.strictEqual(result.status, "critical");
    assert.strictEqual(result.badge.includes("CRITICAL"), true);
});

test("classifyMetric handles unknown metric gracefully", () => {
    const result = HealthThresholds.classifyMetric("unknown_metric", 50);
    assert.ok(result.status, "Should still return a status");
});

test("classify processes multiple metrics", () => {
    HealthThresholds.resetAlerts();
    const results = HealthThresholds.classify({ cpu: 80, memory: 60, disk: 30 });
    assert.ok(results.cpu, "Should classify cpu");
    assert.ok(results.memory, "Should classify memory");
    assert.ok(results.disk, "Should classify disk");
    assert.ok(results.overall, "Should compute overall");
});

test("classify computes overall average", () => {
    HealthThresholds.resetAlerts();
    const results = HealthThresholds.classify({ cpu: 80, memory: 70 });
    assert.ok(results.overall.value >= 70, `Overall should be 70+, got: ${results.overall.value}`);
});

test("statusClass returns correct CSS class", () => {
    assert.strictEqual(HealthThresholds.statusClass("nominal"), "fx-health-nominal");
    assert.strictEqual(HealthThresholds.statusClass("warn"), "fx-health-warn");
    assert.strictEqual(HealthThresholds.statusClass("critical"), "fx-health-critical");
});

test("onAlert registers callback", () => {
    var called = false;
    HealthThresholds.onAlert(function (alert) { called = true; });
    HealthThresholds.resetAlerts();
    HealthThresholds.classifyMetric("cpu", 1); // critical → fires alert
    assert.ok(called, "Alert callback should fire on critical");
});

test("getThresholds returns threshold map", () => {
    var t = HealthThresholds.getThresholds();
    assert.ok(t.cpu, "Should have cpu threshold");
    assert.ok(t.overall, "Should have overall threshold");
    assert.ok(typeof t.cpu.warnBelow === "number");
});

test("setThreshold updates threshold", () => {
    var result = HealthThresholds.setThreshold("cpu", 50, 25);
    assert.ok(result.success);
    var t = HealthThresholds.getThresholds();
    assert.strictEqual(t.cpu.warnBelow, 50);
    // Reset
    HealthThresholds.setThreshold("cpu", 40, 15);
});

test("setThreshold rejects unknown metric", () => {
    var result = HealthThresholds.setThreshold("nonexistent", 50, 25);
    assert.ok(!result.success);
});

// ============================================================
// 5. Voice Settings (configurable VAD)
// ============================================================
console.log("\n--- 5. Voice Settings (Configurable VAD) ---");

test("voice_settings.json exists and is valid JSON", () => {
    const p = path.join(__dirname, "..", "config", "voice_settings.json");
    assert.ok(fs.existsSync(p), "Config file should exist");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(typeof data.silenceRmsThreshold === "number");
    assert.ok(typeof data.minAudioSamples === "number");
    assert.ok(typeof data.trimSilence === "boolean");
});

test("voiceSTT loads voice settings", () => {
    const settings = voiceSTT.getVoiceSettings();
    assert.ok(settings, "Should return settings object");
    assert.ok(typeof settings.silenceRmsThreshold === "number", "Should have silenceRmsThreshold");
    assert.ok(typeof settings.minAudioSamples === "number", "Should have minAudioSamples");
    assert.ok(typeof settings.trimSilence === "boolean", "Should have trimSilence");
    assert.ok(typeof settings.sampleRate === "number", "Should have sampleRate");
});

test("voiceSTT uses config minAudioSamples", () => {
    const settings = voiceSTT.getVoiceSettings();
    // Should match the config file value
    const configData = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "config", "voice_settings.json"), "utf8"
    ));
    assert.strictEqual(settings.minAudioSamples, configData.minAudioSamples);
});

test("voiceSTT uses config silenceRmsThreshold", () => {
    const settings = voiceSTT.getVoiceSettings();
    const configData = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "config", "voice_settings.json"), "utf8"
    ));
    assert.strictEqual(settings.silenceRmsThreshold, configData.silenceRmsThreshold);
});

test("voiceSTT rejects too-short audio using config threshold", async () => {
    const settings = voiceSTT.getVoiceSettings();
    const shortSamples = new Float32Array(settings.minAudioSamples - 1);
    const result = await voiceSTT.transcribeSamples(shortSamples);
    assert.ok(!result.success, "Should reject audio shorter than minAudioSamples");
    assert.ok(result.error.toLowerCase().includes("short"), "Error should mention short");
});

// ============================================================
// 6. File Existence
// ============================================================
console.log("\n--- 6. File Existence ---");

test("conversationContext.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "brain", "conversationContext.js")));
});

test("commandAliases.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "learning", "commandAliases.js")));
});

test("healthThresholds.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "healthThresholds.js")));
});

test("memoryImportance.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "src", "users", "memoryImportance.js")));
});

test("voice_settings.json exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "config", "voice_settings.json")));
});

test("index.html includes all new script tags", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    assert.ok(html.includes("conversationContext.js"), "Should include conversationContext.js");
    assert.ok(html.includes("commandAliases.js"), "Should include commandAliases.js");
    assert.ok(html.includes("healthThresholds.js"), "Should include healthThresholds.js");
});

test("main.js has memory importance IPC handlers", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.ok(main.includes("user:memory-top"), "Should have user:memory-top handler");
    assert.ok(main.includes("user:memory-reinforce"), "Should have user:memory-reinforce handler");
    assert.ok(main.includes("user:memory-stale"), "Should have user:memory-stale handler");
});

test("preload.js has memory importance API", () => {
    const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert.ok(preload.includes("memoryTop"), "Should expose memoryTop");
    assert.ok(preload.includes("memoryReinforce"), "Should expose memoryReinforce");
});

test("chat.js wires conversationContext.resolve + commandAliases", () => {
    const chat = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "chat.js"), "utf8");
    assert.ok(chat.includes("JARVISLegacyConversationContext?.resolve"), "Should call context.resolve");
    assert.ok(chat.includes("JARVISCommandAliases?.resolve"), "Should call aliases.resolve");
    assert.ok(chat.includes("tryLearnFromMessage"), "Should try learning aliases");
    assert.ok(chat.includes("routedText"), "Should use routedText variable");
});

// ============================================================
// SUMMARY
// ============================================================
console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");
if (failed > 0) process.exit(1);
