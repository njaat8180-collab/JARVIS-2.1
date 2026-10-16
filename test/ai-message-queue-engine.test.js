"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/aiMessageQueueEngine.js"), "utf8"), sandbox);
const engine = sandbox.JARVISAIMessageQueueEngine;

test("queue lists only configured credentialed API models or installed Ollama models", () => {
    const remote = engine.targetsFor({ provider: "openai-compatible", providerName: "ChatGPT", model: "gpt-4o-mini", hasApiKey: true }, {});
    assert.equal(remote.length, 1);
    assert.equal(remote[0].family, "ChatGPT");
    assert.equal(engine.targetsFor({ provider: "openai-compatible", providerName: "ChatGPT", model: "gpt-4o-mini", hasApiKey: false }, {}).length, 0);
    const local = engine.targetsFor({ provider: "ollama" }, { models: [{ name: "qwen:1.8b" }, { name: "llama3" }] });
    assert.deepEqual(Array.from(local, target => target.model), ["qwen:1.8b", "llama3"]);
});

test("Sarvam is the default queue provider when configuration omits a provider", () => {
    const targets = engine.targetsFor({ hasSarvamApiKey: true, hasApiKey: true, providerName: "Sarvam AI", model: "sarvam-105b" }, {});
    assert.equal(targets.length, 1);
    assert.equal(targets[0].provider, "sarvam");
});

test("queue splits messages, validates actual provider replies, and waits before sending the next", async () => {
    const target = engine.targetsFor({ provider: "openai-compatible", providerName: "ChatGPT", model: "gpt-4o-mini", hasApiKey: true }, {})[0];
    const items = engine.createItems("First prompt\nSecond prompt", 100);
    const sent = [];
    const result = await engine.runSequential(items, target, async message => {
        sent.push(message);
        return { success: true, response: `Reply to ${message}`, aiProvider: "openai-compatible", aiModel: "gpt-4o-mini" };
    });
    assert.deepEqual(sent, ["First prompt", "Second prompt"]);
    assert.equal(items[0].status, "complete");
    assert.equal(items[1].status, "complete");
    assert.equal(result.paused, false);
});

test("a response from another model pauses the queue without sending later messages", async () => {
    const target = engine.targetsFor({ provider: "openai-compatible", providerName: "Gemini", model: "gemini-2.5-pro", hasApiKey: true }, {})[0];
    const items = engine.createItems("First\nSecond", 200);
    const sent = [];
    const result = await engine.runSequential(items, target, async message => {
        sent.push(message);
        return { success: true, response: "Fallback answer", aiProvider: "ollama", aiModel: "qwen" };
    });
    assert.deepEqual(sent, ["First"]);
    assert.equal(items[0].status, "error");
    assert.equal(items[1].status, "waiting");
    assert.equal(result.paused, true);
});
