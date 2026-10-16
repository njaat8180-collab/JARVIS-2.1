"use strict";

/**
 * Phase 9 — long-term memory update / contradiction handling.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryEngine, STATUS } = require("../src/ai/memory");

function tempPath(name = "memory.json") {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-memory-update-test-")), name);
}

test("different values for the same key create a new ACTIVE record and SUPERSEDE the old one", () => {
    const storagePath = tempPath();
    const memory = new MemoryEngine({ storagePath });

    const oldRecord = memory.remember("user.preference.ui_theme", "dark", {
        type: "USER_PREFERENCE",
        source: "conversation",
        importance: 0.8
    });
    const newRecord = memory.remember("user.preference.ui_theme", "light", {
        type: "USER_PREFERENCE",
        source: "conversation",
        importance: 0.8
    });

    assert.notEqual(newRecord.id, oldRecord.id);
    assert.equal(newRecord.status, STATUS.ACTIVE);
    assert.equal(memory.recall("user.preference.ui_theme"), "light");

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const records = raw.records.filter(record => record.key === "user.preference.ui_theme");
    assert.equal(records.length, 2);
    assert.equal(records.find(record => record.id === oldRecord.id).status, STATUS.SUPERSEDED);
    assert.equal(records.find(record => record.id === newRecord.id).status, STATUS.ACTIVE);
});

test("multiple updates preserve the replacement history while keeping exactly one ACTIVE value", () => {
    const storagePath = tempPath();
    const memory = new MemoryEngine({ storagePath });

    const first = memory.remember("user.city", "Delhi");
    const second = memory.remember("user.city", "Mumbai");
    const third = memory.remember("user.city", "Dehradun");

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const records = raw.records.filter(record => record.key === "user.city");

    assert.equal(records.length, 3);
    assert.equal(records.filter(record => record.status === STATUS.ACTIVE).length, 1);
    assert.equal(records.find(record => record.id === first.id).status, STATUS.SUPERSEDED);
    assert.equal(records.find(record => record.id === second.id).status, STATUS.SUPERSEDED);
    assert.equal(records.find(record => record.id === third.id).status, STATUS.ACTIVE);
    assert.equal(memory.recall("user.city"), "Dehradun");
    assert.equal(memory.allRecords().length, 1);
});

test("repeating the same value is not treated as a contradiction", () => {
    const storagePath = tempPath();
    const memory = new MemoryEngine({ storagePath });

    const first = memory.remember("user.preference.ui_theme", "dark");
    const second = memory.remember("user.preference.ui_theme", "dark");

    assert.equal(second.id, first.id);

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const records = raw.records.filter(record => record.key === "user.preference.ui_theme");
    assert.equal(records.length, 1);
    assert.equal(records[0].status, STATUS.ACTIVE);
});

test("replacement status survives a restart and active recall returns only the newest value", () => {
    const storagePath = tempPath();
    const first = new MemoryEngine({ storagePath });

    const oldRecord = first.remember("user.name", "Nakul", { type: "USER_PROFILE" });
    const newRecord = first.remember("user.name", "Aarav", { type: "USER_PROFILE" });

    const second = new MemoryEngine({ storagePath });

    assert.equal(second.recall("user.name"), "Aarav");
    assert.equal(second.recallEntry("user.name").id, newRecord.id);

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    assert.equal(raw.records.find(record => record.id === oldRecord.id).status, STATUS.SUPERSEDED);
    assert.equal(raw.records.find(record => record.id === newRecord.id).status, STATUS.ACTIVE);
});

test("extracted explicit preference updates use the same contradiction-handling path", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const first = memory.extractFromMessage("I prefer a dark UI.");
    const second = memory.extractFromMessage("I prefer a light UI now.");

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(second[0].status, STATUS.ACTIVE);
    assert.equal(memory.recall("user.preference.ui_theme"), "a light UI now");
    assert.equal(memory.allRecords().filter(record => record.key === "user.preference.ui_theme").length, 1);
});
