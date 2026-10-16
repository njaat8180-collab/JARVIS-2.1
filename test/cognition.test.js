"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryEngine } = require("../src/ai/memory");
const { ConsciousnessLayer } = require("../src/ai/consciousness");

function tempPath(name) {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-")), name);
}

/* ============================================================
   MEMORY ENGINE
============================================================ */

test("MemoryEngine extracts an explicitly stated name and recalls it", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const stored = memory.extractFromMessage("My name is Nakul.");

    assert.equal(stored.length, 1);
    assert.equal(stored[0].key, "user.name");
    assert.equal(memory.recall("user.name"), "Nakul");
});

test("MemoryEngine extracts Hinglish 'mera naam' pattern", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    memory.extractFromMessage("mera naam Nakul hai");

    assert.equal(memory.recall("user.name"), "Nakul");
});

test("MemoryEngine never invents a fact from a message that doesn't state one", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const stored = memory.extractFromMessage("What is the weather like today?");

    assert.equal(stored.length, 0);
    assert.equal(memory.recall("user.name"), null);
});

test("MemoryEngine persists facts to disk and reloads them", () => {
    const storagePath = tempPath("memory.json");

    const first = new MemoryEngine({ storagePath });
    first.remember("user.name", "Nakul", { source: "conversation", category: "identity" });

    const second = new MemoryEngine({ storagePath });
    assert.equal(second.recall("user.name"), "Nakul");
    assert.equal(second.recallEntry("user.name").source, "conversation");
});

test("MemoryEngine forget() removes a fact", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    memory.remember("user.name", "Nakul");
    assert.equal(memory.forget("user.name"), true);
    assert.equal(memory.recall("user.name"), null);
    assert.equal(memory.forget("user.name"), false);
});

test("MemoryEngine buildContextBlock is empty with no facts and non-empty once a fact exists", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    assert.equal(memory.buildContextBlock(), "");

    memory.remember("user.name", "Nakul");
    const block = memory.buildContextBlock();

    assert.match(block, /user\.name: Nakul/);
});

test("MemoryEngine working memory keeps only the most recent turns", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    for (let i = 0; i < 25; i++) {
        memory.pushTurn("user", `message ${i}`);
    }

    const working = memory.getWorkingMemory();
    assert.equal(working.length, 20);
    assert.equal(working[working.length - 1].text, "message 24");
});

test("MemoryEngine survives a corrupt storage file instead of crashing", () => {
    const storagePath = tempPath("memory.json");
    fs.writeFileSync(storagePath, "{ not valid json", "utf8");

    assert.doesNotThrow(() => {
        const memory = new MemoryEngine({ storagePath });
        assert.deepEqual(memory.allFacts(), {});
    });
});

/* ============================================================
   CONSCIOUSNESS LAYER
============================================================ */

test("ConsciousnessLayer detects English, Hindi, and Hinglish", () => {
    const layer = new ConsciousnessLayer();

    assert.equal(layer.detectLanguage("Hello Jarvis, how are you?"), "en");
    assert.equal(layer.detectLanguage("जार्विस तुम कैसे हो"), "hi");
    assert.equal(layer.detectLanguage("Jarvis, system ki health check karo"), "en");
    assert.equal(layer.detectLanguage("Jarvis तुम कैसे हो today"), "hinglish");
});

test("ConsciousnessLayer.update transitions mode and increments continuity", () => {
    const layer = new ConsciousnessLayer();
    const start = layer.getPublicState();

    const afterThinking = layer.update({ userMessage: "How is the system?" });
    assert.equal(afterThinking.mode, "THINKING");
    assert.equal(afterThinking.continuity, start.continuity + 1);

    const afterResponding = layer.update({ userMessage: "How is the system?", response: "All good." });
    assert.equal(afterResponding.mode, "RESPONDING");
    assert.equal(afterResponding.continuity, start.continuity + 2);
});

test("ConsciousnessLayer moves to ERROR mode explicitly and only on valid transitions", () => {
    const layer = new ConsciousnessLayer();

    assert.equal(layer.setMode("ERROR"), "ERROR");
    // Unknown/invalid mode names are rejected, not silently accepted.
    assert.equal(layer.setMode("NOT_A_REAL_MODE"), "ERROR");
});

test("ConsciousnessLayer persists state across instances", () => {
    const storagePath = tempPath("consciousness.json");

    const first = new ConsciousnessLayer({ storagePath });
    first.update({ userMessage: "test", response: "ok" });
    const continuityAfterFirst = first.getPublicState().continuity;

    const second = new ConsciousnessLayer({ storagePath });
    assert.equal(second.getPublicState().continuity, continuityAfterFirst);
});

test("ConsciousnessLayer.getHealthSummary reports the values the Health dashboard reads", () => {
    const layer = new ConsciousnessLayer();
    layer.setGoal("Repair JARVIS STT");

    const summary = layer.getHealthSummary({ memoryStatus: "ACTIVE", memoryFactCount: 3 });

    assert.equal(summary.activeGoal, "Repair JARVIS STT");
    assert.equal(summary.memoryStatus, "ACTIVE");
    assert.equal(summary.memoryFactCount, 3);
    assert.ok(summary.confidencePercent >= 0 && summary.confidencePercent <= 100);
});

test("ConsciousnessLayer never claims literal sentience in its system prompt", () => {
    const layer = new ConsciousnessLayer();
    const prompt = layer.buildSystemPrompt();

    assert.match(prompt, /NOT proof of biological or subjective consciousness/i);
    assert.doesNotMatch(prompt, /I am truly conscious/i);
});

test("ConsciousnessLayer.buildSystemPrompt includes injected memory context", () => {
    const layer = new ConsciousnessLayer();
    const prompt = layer.buildSystemPrompt("KNOWN FACTS ABOUT THE USER:\n- user.name: Nakul");

    assert.match(prompt, /user\.name: Nakul/);
});
