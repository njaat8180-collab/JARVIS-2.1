"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { RecoveryManager } = require("../src/recovery/RecoveryManager");
const { getSystemDiagnostics } = require("../src/diagnostics/SystemDiagnostics");

const root = path.resolve(__dirname, "..");

test("Phase 10: UI loads deterministic chat/history/voice modules", () => {
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    for (const script of ["js/history.js", "js/voice.js", "js/voiceUI.js"]) assert.match(html, new RegExp(script.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, /js\/ai\.js/);
});

test("Phase 10: browser SpeechRecognition is not an active voice fallback", () => {
    const voice = fs.readFileSync(path.join(root, "renderer/js/voice.js"), "utf8");
    const renderer = fs.readFileSync(path.join(root, "renderer/js/renderer.js"), "utf8");
    assert.match(voice, /const SpeechRecognition = null/);
    assert.doesNotMatch(renderer, /new\s+SpeechRecognition\s*\(/);
});

test("Phase 10: Edge/network TTS path is not exposed by the UI TTS adapter", () => {
    const tts = fs.readFileSync(path.join(root, "renderer/js/tts.js"), "utf8");
    assert.doesNotMatch(tts, /speakEdge|speakWithEdgeTTS|edge-tts/i);
});

test("Phase 11: corrupt JSON recovery preserves evidence and returns fallback", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-recovery-"));
    const file = path.join(dir, "state.json");
    fs.writeFileSync(file, "{broken", "utf8");
    const manager = new RecoveryManager({ maxBackups: 3 });
    const result = manager.repairJson(file, { repaired: true });
    assert.equal(result.recovered, true);
    assert.deepEqual(result.value, { repaired: true });
    assert.equal(result.backup.success, true);
    assert.equal(fs.existsSync(result.backup.backup), true);
});

test("Phase 11: diagnostics are real process data", () => {
    const d = getSystemDiagnostics();
    assert.ok(d.timestamp > 0);
    assert.ok(d.memory.totalBytes > 0);
    assert.ok(d.cpu.logicalCores > 0);
    assert.ok(d.uptimeSeconds >= 0);
});

test("Phase 11/12: renderer remains hardened", () => {
    const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
    assert.match(main, /contextIsolation:\s*true/);
    assert.match(main, /nodeIntegration:\s*false/);
    assert.match(main, /webSecurity:\s*true/);
});

test("Phase 12: final release contains no newly active AI renderer module", () => {
    const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.doesNotMatch(html, /js\/ai\.js/);
    assert.equal(Object.keys(pkg.dependencies || {}).some(k => /openai|anthropic|generative-ai/i.test(k)), false);
});
