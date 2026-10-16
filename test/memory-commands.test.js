"use strict";

/** Phase 10 — natural-language memory commands. */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const { MemoryEngine, STATUS } = require("../src/ai/memory");

function tempPath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-memory-command-test-")), "memory.json");
}

function loadChat(mockAI = {}) {
    const source = fs.readFileSync(path.join(__dirname, "../renderer/js/chat.js"), "utf8");
    const context = {
        console,
        setTimeout,
        clearTimeout,
        window: {
            addEventListener() {},
            jarvis: { ai: mockAI },
            JARVISConversationContext: { setConfirmation(value) { this.pendingConfirmation = value; } }
        }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const chat = new context.window.JARVISChat();
    chat.__testWindow = context.window;
    return chat;
}

test("memory command detector recognizes remember, recall and forget forms", () => {
    const chat = loadChat();

    assert.equal(chat.isMemoryCommand("remember that my name is Nakul"), true);
    assert.equal(chat.getMemorySaveMatch("ye baat yaad rakhna: I prefer concise answers"), "I prefer concise answers");
    assert.equal(chat.isMemoryCommand("what do you remember"), true);
    assert.equal(chat.isMemoryReadCommand("where did I leave off?"), true);
    const updateMatch = chat.getMemoryUpdateMatch("update memory about my editor to VS Code");
    assert.equal(updateMatch.query, "my editor");
    assert.equal(updateMatch.value, "vs code");
    const keyMatch = chat.getMemoryForgetMatch("forget my name");
    assert.equal(keyMatch.action, "key");
    assert.equal(keyMatch.key, "user.name");

    const typeMatch = chat.getMemoryForgetMatch("forget everything about my preferences");
    assert.equal(typeMatch.action, "type");
    assert.equal(typeMatch.type, "USER_PREFERENCE");

    assert.equal(chat.getMemoryForgetMatch("forget everything").action, "all");

    const statementMatch = chat.getMemoryForgetMatch("forget that I prefer dark UI");
    assert.equal(statementMatch.action, "statement");
    assert.equal(statementMatch.statement, "i prefer dark ui");
});

test("memory update command edits exactly one matched record", async () => {
    const calls = [];
    const chat = loadChat({
        searchMemory: async query => ({ records: [{ key: "user.editor", value: "Notepad", status: "ACTIVE" }] }),
        updateMemory: async (key, patch) => { calls.push([key, patch.value]); return { success: true }; }
    });
    const result = await chat.processMemoryCommand("update memory about my editor to VS Code");
    assert.equal(result.handled, true);
    assert.deepEqual(calls, [["user.editor", "vs code"]]);
});

test("save memory command delegates the explicit statement to the main MemoryEngine", async () => {
    const calls = [];
    const chat = loadChat({
        rememberMemoryMessage: async message => {
            calls.push(message);
            return { success: true, stored: [{ key: "user.name", value: "Nakul" }] };
        }
    });

    const result = await chat.processMemoryCommand("remember that my name is Nakul");

    assert.equal(result.handled, true);
    assert.equal(result.source, "memory");
    assert.deepEqual(calls, ["my name is Nakul"]);
    assert.match(result.response, /Nakul/);
});

test("recall command reads active structured facts from the main MemoryEngine", async () => {
    const chat = loadChat({
        getMemoryFacts: async () => ({
            success: true,
            facts: {
                "user.name": { value: "Nakul" },
                "user.preference.ui_theme": { value: "dark" }
            }
        })
    });

    const result = await chat.processMemoryCommand("what do you remember");

    assert.equal(result.handled, true);
    assert.match(result.response, /Nakul/);
    assert.match(result.response, /dark/);
});

test("forget commands delegate to the correct main-process operation", async () => {
    const calls = [];
    const chat = loadChat({
        clearAllMemory: async () => { calls.push(["all"]); return { success: true, count: 2 }; },
        forgetMemoryType: async type => { calls.push(["type", type]); return { success: true, count: 1 }; },
        forgetMemoryKey: async key => { calls.push(["key", key]); return { success: true, count: 1 }; },
        forgetMemoryStatement: async statement => { calls.push(["statement", statement]); return { success: true, count: 1 }; }
    });
    // All-memory deletion waits for an explicit yes/no confirmation.
    const pending = await chat.processMemoryCommand("forget everything");
    assert.match(pending.response, /permanently delete/i);
    assert.deepEqual(calls, []);
    await chat.__testWindow.JARVISConversationContext.pendingConfirmation.onYes();
    await chat.processMemoryCommand("forget everything about my preferences");
    await chat.processMemoryCommand("forget my name");
    await chat.processMemoryCommand("forget that I prefer dark UI");

    assert.deepEqual(calls, [
        ["all"],
        ["type", "USER_PREFERENCE"],
        ["key", "user.name"],
        ["statement", "i prefer dark ui"]
    ]);
});

test("soft-deleted memory commands remove records from active recall while preserving audit history", () => {
    const storagePath = tempPath();
    const memory = new MemoryEngine({ storagePath });

    memory.remember("user.name", "Nakul", { type: "USER_PROFILE" });
    memory.remember("user.preference.ui_theme", "dark", { type: "USER_PREFERENCE" });
    memory.remember("user.project", "JARVIS", { type: "USER_PROJECT" });

    assert.equal(memory.forgetByKey("user.name"), true);
    assert.equal(memory.recall("user.name"), null);
    assert.equal(memory.search("Nakul").length, 0);

    assert.equal(memory.forgetByType("USER_PREFERENCE"), 1);
    assert.equal(memory.allRecords().length, 1);

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    assert.equal(raw.records.find(r => r.key === "user.name").status, STATUS.DELETED);
    assert.equal(raw.records.find(r => r.key === "user.preference.ui_theme").status, STATUS.DELETED);
    assert.equal(raw.records.find(r => r.key === "user.project").status, STATUS.ACTIVE);
});

test("forgetAll soft-deletes every active record and is restart-safe", () => {
    const storagePath = tempPath();
    const first = new MemoryEngine({ storagePath });
    first.remember("user.name", "Nakul");
    first.remember("user.city", "Delhi");

    assert.equal(first.forgetAll(), 2);

    const second = new MemoryEngine({ storagePath });
    assert.equal(second.allRecords().length, 0);
    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    assert.equal(raw.records.filter(r => r.status === STATUS.DELETED).length, 2);
});
