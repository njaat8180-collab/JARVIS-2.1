"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHarness() {
    const values = new Map();
    const calls = [];
    const window = { jarvis: { system: { async shutdown() { calls.push("shutdown"); return { success: true }; } } } };
    const context = {
        window,
        localStorage: {
            getItem: key => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: key => values.delete(key)
        },
        console
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/deferredProviderShutdown.js"), "utf8"), context);
    return { api: window.JARVISDeferredShutdown, calls, values };
}

test("deferred shutdown waits for a matching remote ChatGPT reply and fires once", async () => {
    const { api, calls, values } = createHarness();
    assert.equal(api.arm("ChatGPT"), true);
    assert.ok(values.size);
    assert.equal(await api.onReplyDelivered({ success: true, response: "Local response", aiProvider: "ollama", aiModel: "gpt-like" }), false);
    assert.equal(await api.onReplyDelivered({ success: true, response: "Gemini response", aiProvider: "openai-compatible", aiProviderName: "Gemini", aiModel: "gemini-2.5" }), false);
    assert.equal(calls.length, 0);
    assert.equal(await api.onReplyDelivered({ success: true, response: "ChatGPT response", aiProvider: "openai-compatible", aiModel: "gpt-4o-mini", source: "api/gpt-4o-mini" }), true);
    assert.equal(calls.length, 1);
    assert.equal(values.size, 0);
    assert.equal(await api.onReplyDelivered({ success: true, response: "Second reply", aiProvider: "openai-compatible", aiModel: "gpt-4o", source: "api/gpt-4o" }), false);
    assert.equal(calls.length, 1);
});

test("deferred shutdown can be cancelled and matches Gemini provider labels", async () => {
    const { api, calls } = createHarness();
    assert.equal(api.arm("Gemini"), true);
    assert.equal(api.matchesReply({ success: true, text: "answer", aiProvider: "openai-compatible", aiProviderName: "Google Gemini", aiModel: "gemini-2.5-pro" }, "Gemini"), true);
    assert.equal(api.cancel(), true);
    assert.equal(api.getPending(), null);
    assert.equal(await api.onReplyDelivered({ success: true, response: "Gemini answer", aiProvider: "openai-compatible", aiProviderName: "Gemini", aiModel: "gemini-2.5-pro" }), false);
    assert.equal(calls.length, 0);
});
