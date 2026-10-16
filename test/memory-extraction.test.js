"use strict";

/**
 * Phase 8 — explicit memory extraction and retention classification.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryEngine, RETENTION } = require("../src/ai/memory");

function tempPath(name = "memory.json") {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-extraction-test-")), name);
}

test("classifyMessage extracts an explicit project as long-term USER_PROJECT memory", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const result = memory.classifyMessage("I am building a JARVIS assistant.");

    assert.equal(result.retention, RETENTION.LONG_TERM);
    assert.equal(result.longTerm.length, 1);
    assert.equal(result.longTerm[0].key, "user.project");
    assert.equal(result.longTerm[0].type, "USER_PROJECT");
    assert.equal(result.longTerm[0].value, "a JARVIS assistant");
    assert.equal(result.longTerm[0].retention, RETENTION.LONG_TERM);
});

test("explicit preferences receive USER_PREFERENCE metadata without saving the whole sentence", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const stored = memory.extractFromMessage("I prefer concise answers.");

    assert.equal(stored.length, 1);
    assert.equal(stored[0].key, "user.preference.response_style");
    assert.equal(stored[0].type, "USER_PREFERENCE");
    assert.equal(stored[0].value, "concise answers");
    assert.equal(stored[0].importance, 0.8);
    assert.equal(memory.recall("user.preference.response_style"), "concise answers");
});

test("interest and workflow statements are classified into their structured types", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const interest = memory.extractFromMessage("I am interested in astronomy.");
    const workflow = memory.extractFromMessage("I usually review code before shipping.");

    assert.equal(interest[0].type, "USER_INTEREST");
    assert.equal(interest[0].key, "user.interest");
    assert.equal(workflow[0].type, "USER_WORKFLOW");
    assert.equal(workflow[0].key, "user.workflow");
});

test("one message can extract more than one explicit fact", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const stored = memory.extractFromMessage("My name is Nakul and I live in Delhi.");

    assert.deepEqual(
        stored.map(item => item.key).sort(),
        ["user.location", "user.name"]
    );
    assert.equal(memory.recall("user.name"), "Nakul");
    assert.equal(memory.recall("user.location"), "Delhi");
});

test("temporary current-location statements are classified but never persisted", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const result = memory.classifyMessage("Today I am in Mumbai.");
    const stored = memory.extractFromMessage("Today I am in Mumbai.");

    assert.equal(result.retention, RETENTION.TEMPORARY);
    assert.equal(result.temporary[0].key, "session.location");
    assert.equal(result.temporary[0].value, "Mumbai");
    assert.deepEqual(stored, []);
    assert.equal(memory.recall("session.location"), null);
    assert.equal(memory.allRecords().length, 0);
});

test("ordinary questions are temporary/no-memory and do not create records", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const result = memory.classifyMessage("What is 25 + 25?");

    assert.equal(result.retention, RETENTION.TEMPORARY);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.reason, "no-explicit-memory-statement");
    assert.deepEqual(memory.extractFromMessage("What is 25 + 25?"), []);
    assert.equal(memory.allRecords().length, 0);
});

test("credentials and payment details are blocked from extraction and persistence", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const apiKey = memory.classifyMessage("My API key is sk-test-secret-value.");
    const card = memory.extractFromMessage("My credit card is 4111 1111 1111 1111.");

    assert.equal(apiKey.blocked, true);
    assert.equal(apiKey.reason, "sensitive-content");
    assert.deepEqual(memory.extractFromMessage("My API key is sk-test-secret-value."), []);
    assert.deepEqual(card, []);
    assert.equal(memory.allRecords().length, 0);
});

test("Hinglish preference and project statements are supported", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    const preference = memory.extractFromMessage("Mujhe short answers pasand hai.");
    const project = memory.extractFromMessage("Mera project hai JARVIS voice assistant.");

    assert.equal(preference[0].type, "USER_PREFERENCE");
    assert.match(preference[0].value, /short answers/i);
    assert.equal(project[0].type, "USER_PROJECT");
    assert.equal(project[0].value, "JARVIS voice assistant");
});

test("extractCandidates is read-only and extraction metadata survives restart through records", () => {
    const storagePath = tempPath();
    const first = new MemoryEngine({ storagePath });

    const candidates = first.extractCandidates("I prefer a light UI.");
    assert.equal(candidates[0].retention, RETENTION.LONG_TERM);
    assert.equal(first.allRecords().length, 0);

    first.extractFromMessage("I prefer a light UI.", { source: "conversation" });
    const second = new MemoryEngine({ storagePath });
    const record = second.recallEntry("user.preference.ui_theme");

    assert.equal(record.type, "USER_PREFERENCE");
    assert.equal(record.value, "a light UI");
    assert.equal(record.status, "ACTIVE");
});


test("a later explicit preference supersedes the previous preference instead of leaving both active", () => {
    const storagePath = tempPath();
    const memory = new MemoryEngine({ storagePath });

    const first = memory.extractFromMessage("I prefer a dark UI.");
    const second = memory.extractFromMessage("I prefer a light UI now.");

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(second[0].status, "ACTIVE");
    assert.equal(memory.recall("user.preference.ui_theme"), "a light UI now");

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const records = raw.records.filter(r => r.key === "user.preference.ui_theme");
    assert.equal(records.length, 2);
    assert.equal(records.filter(r => r.status === "ACTIVE").length, 1);
    assert.equal(records.find(r => r.value === "a dark UI").status, "SUPERSEDED");
    assert.equal(records.find(r => r.value === "a light UI now").status, "ACTIVE");
});

test("superseded records stay out of active recall and legacy fact projections", () => {
    const memory = new MemoryEngine({ storagePath: tempPath() });

    memory.remember("user.preference.ui_theme", "dark", { type: "USER_PREFERENCE" });
    const oldId = memory.recallEntry("user.preference.ui_theme").id;
    memory.remember("user.preference.ui_theme", "light", { type: "USER_PREFERENCE" });

    assert.equal(memory.recall("user.preference.ui_theme"), "light");
    assert.equal(memory.allRecords().length, 1);
    assert.equal(memory.allRecords()[0].id === oldId, false);
    assert.equal(memory.allFacts()["user.preference.ui_theme"].value, "light");
});
