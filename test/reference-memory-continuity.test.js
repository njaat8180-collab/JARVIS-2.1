"use strict";

/** Phase 11 — reference-aware memory/topic continuity. */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadChat(mockAI = {}, topic = null) {
    const source = fs.readFileSync(path.join(__dirname, "../renderer/js/chat.js"), "utf8");
    const context = {
        console,
        setTimeout,
        clearTimeout,
        window: {
            addEventListener() {},
            jarvis: { ai: mockAI },
            JARVISConversationContext: {
                getTopic: () => topic,
                setTopic() {},
                hasPending: () => false,
                hasConfirmation: () => false
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return new context.window.JARVISChat();
}

test("Phase 11: forget-this references are recognized without guessing a key", () => {
    const chat = loadChat({}, { subject: "NASA" });

    assert.equal(chat.getMemoryForgetMatch("forget this").action, "reference");
    assert.equal(chat.getMemoryForgetMatch("forget that").action, "reference");
    assert.equal(chat.getMemoryForgetMatch("forget it").action, "reference");
    assert.equal(chat.getMemoryForgetMatch("forget the previous one").action, "reference");
});

test("Phase 11: forget this deletes exactly one memory matching the active topic", async () => {
    const calls = [];
    const chat = loadChat({
        searchMemory: async (query, limit) => {
            calls.push(["search", query, limit]);
            return { success: true, records: [{ key: "user.project", value: "JARVIS", status: "ACTIVE" }] };
        },
        forgetMemoryKey: async key => {
            calls.push(["forget", key]);
            return { success: true, count: 1 };
        }
    }, { subject: "JARVIS" });

    const result = await chat.processMemoryCommand("forget this");

    assert.equal(result.handled, true);
    assert.match(result.response, /forgot/i);
    assert.deepEqual(calls, [
        ["search", "JARVIS", 10],
        ["forget", "user.project"]
    ]);
});

test("Phase 11: ambiguous topic references never delete multiple memories", async () => {
    let deleted = false;
    const chat = loadChat({
        searchMemory: async () => ({
            success: true,
            records: [
                { key: "user.project", value: "JARVIS", status: "ACTIVE" },
                { key: "user.interest", value: "JARVIS", status: "ACTIVE" }
            ]
        }),
        forgetMemoryKey: async () => { deleted = true; return { success: true, count: 2 }; }
    }, { subject: "JARVIS" });

    const result = await chat.processMemoryCommand("forget that");

    assert.equal(result.handled, true);
    assert.match(result.response, /multiple memories/i);
    assert.equal(deleted, false);
});

test("Phase 11: no active topic makes forget-this fail safely", async () => {
    const chat = loadChat({ forgetMemoryKey: async () => ({ success: true, count: 1 }) }, null);
    const result = await chat.processMemoryCommand("forget it");

    assert.equal(result.handled, true);
    assert.match(result.response, /active topic/i);
});

test("Phase 11: resolved topic memory queries return bounded matching memories", async () => {
    const chat = loadChat({
        searchMemory: async (query, limit) => ({
            success: true,
            records: [
                { key: "user.project", value: "JARVIS", status: "ACTIVE" },
                { key: "user.interest", value: "robotics", status: "ACTIVE" }
            ]
        })
    });

    const result = await chat.readMemoryTopic("JARVIS");

    assert.equal(result.handled, true);
    assert.match(result.response, /JARVIS/);
    assert.match(result.response, /robotics/);
});
