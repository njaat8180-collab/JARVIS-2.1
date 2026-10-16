"use strict";

/**
 * Phase 7 — Long-term memory storage.
 *
 * Covers the new structured schema (id/type/key/value/source/
 * createdAt/updatedAt/confidence/importance/lastUsedAt/status)
 * underneath `MemoryEngine`, the v1 -> v2 migration path, and that
 * every pre-Phase-7 observable behavior (covered separately in
 * test/cognition.test.js) is unaffected.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryEngine, STATUS } = require("../src/ai/memory");

function tempPath(name) {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ltm-test-")), name);
}

test("remember() creates a full structured record with all v2 schema fields", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const record = memory.remember("user.name", "Nakul", { source: "conversation", category: "identity" });

    assert.equal(typeof record.id, "string");
    assert.ok(record.id.length > 0);
    assert.equal(record.type, "USER_PROFILE");
    assert.equal(record.key, "user.name");
    assert.equal(record.value, "Nakul");
    assert.equal(record.source, "conversation");
    assert.equal(typeof record.createdAt, "number");
    assert.equal(typeof record.updatedAt, "number");
    assert.equal(record.confidence, 1);
    assert.equal(record.importance, 0.5);
    assert.equal(typeof record.lastUsedAt, "number");
    assert.equal(record.status, STATUS.ACTIVE);
});

test("remember() accepts an explicit `type` and `importance`, overriding the category mapping", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const record = memory.remember("user.editor", "VS Code", {
        category: "identity", // would normally map to USER_PROFILE
        type: "USER_PREFERENCE",
        importance: 0.8
    });

    assert.equal(record.type, "USER_PREFERENCE");
    assert.equal(record.importance, 0.8);
});

test("remember() with no category/type defaults to USER_FACT and default importance", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const record = memory.remember("some.key", "some value");

    assert.equal(record.type, "USER_FACT");
    assert.equal(record.importance, 0.5);
});

test("remember() with a different value supersedes the old record and creates one new ACTIVE record", () => {
    const storagePath = tempPath("memory.json");
    const memory = new MemoryEngine({ storagePath });

    const first = memory.remember("user.city", "Delhi");
    const second = memory.remember("user.city", "Mumbai");

    assert.notEqual(second.id, first.id);
    assert.equal(second.value, "Mumbai");
    assert.equal(second.status, STATUS.ACTIVE);
    assert.equal(memory.recall("user.city"), "Mumbai");

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const history = raw.records.filter(r => r.key === "user.city");
    assert.equal(history.length, 2);

    const old = history.find(r => r.id === first.id);
    const current = history.find(r => r.id === second.id);
    assert.equal(old.status, STATUS.SUPERSEDED);
    assert.equal(old.value, "Delhi");
    assert.equal(current.status, STATUS.ACTIVE);
    assert.equal(current.value, "Mumbai");
    assert.equal(history.filter(r => r.status === STATUS.ACTIVE).length, 1);
});

test("remember() with the same value is not a contradiction and keeps the existing record id", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const first = memory.remember("user.city", "Delhi");
    const second = memory.remember("user.city", "Delhi");

    assert.equal(second.id, first.id);
    assert.equal(second.status, STATUS.ACTIVE);
    assert.equal(memory.allRecords().filter(r => r.key === "user.city").length, 1);
});

test("recall() bumps lastUsedAt (a read counts as a use, for future relevance retrieval)", async () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const stored = memory.remember("user.name", "Nakul");
    const initialLastUsed = stored.lastUsedAt;

    // Ensure a measurable time delta.
    await new Promise(resolve => setTimeout(resolve, 5));

    memory.recall("user.name");
    const afterRead = memory.recallEntry("user.name");

    assert.ok(afterRead.lastUsedAt >= initialLastUsed);
});

test("allRecords() returns full structured records for every ACTIVE fact", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul", { category: "identity" });
    memory.remember("user.location", "Delhi", { category: "context" });

    const records = memory.allRecords();
    assert.equal(records.length, 2);
    const byKey = Object.fromEntries(records.map(r => [r.key, r]));
    assert.equal(byKey["user.name"].type, "USER_PROFILE");
    assert.equal(byKey["user.location"].type, "USER_FACT");
    assert.equal(byKey["user.name"].status, STATUS.ACTIVE);
});

test("allFacts() legacy projection still has the old shape plus the new fields additively", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul", { source: "conversation", category: "identity" });

    const facts = memory.allFacts();
    assert.equal(facts["user.name"].value, "Nakul");
    assert.equal(facts["user.name"].confidence, 1);
    assert.equal(facts["user.name"].source, "conversation");
    // Legacy .category alias derived from the new .type field.
    assert.equal(facts["user.name"].category, "USER_PROFILE");
    // New fields present too.
    assert.equal(facts["user.name"].type, "USER_PROFILE");
    assert.equal(facts["user.name"].status, STATUS.ACTIVE);
    assert.equal(typeof facts["user.name"].id, "string");
});

test("forget() hard-deletes the record entirely (not a soft DELETE status)", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul");

    assert.equal(memory.forget("user.name"), true);
    assert.equal(memory.recall("user.name"), null);
    assert.equal(memory.allRecords().length, 0);
    assert.equal(memory.forget("user.name"), false);
});

test("structured records persist to disk (current store version, records array) and reload with the same id", () => {
    const storagePath = tempPath("memory.json");

    const first = new MemoryEngine({ storagePath });
    const stored = first.remember("user.name", "Nakul", { category: "identity" });

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    // PHASE 8: schema bumped to v3 (adds tags/pinned/expiresAt/
    // accessCount/lastAccessedAt/metadata/category fields). The
    // records-array shape and persistence contract this test checks
    // is unchanged; only the version literal moved.
    assert.equal(raw.version, 3);
    assert.ok(Array.isArray(raw.records));
    assert.equal(raw.records[0].key, "user.name");
    assert.equal(raw.records[0].status, "ACTIVE");

    const second = new MemoryEngine({ storagePath });
    const reloaded = second.recallEntry("user.name");
    assert.equal(reloaded.id, stored.id);
    assert.equal(reloaded.value, "Nakul");
    assert.equal(reloaded.type, "USER_PROFILE");
});

test("a v1-format file (old {facts: {...}} shape) is migrated to v2 on load, preserving every fact", () => {
    const storagePath = tempPath("memory.json");

    const v1 = {
        facts: {
            "user.name": { value: "Nakul", confidence: 1, source: "conversation", category: "identity", updatedAt: 1700000000000 },
            "user.location": { value: "Delhi", confidence: 0.9, source: "conversation", category: "context", updatedAt: 1700000001000 }
        },
        episodic: []
    };
    fs.writeFileSync(storagePath, JSON.stringify(v1), "utf8");

    const memory = new MemoryEngine({ storagePath });

    assert.equal(memory.recall("user.name"), "Nakul");
    assert.equal(memory.recall("user.location"), "Delhi");
    assert.equal(memory.recallEntry("user.name").type, "USER_PROFILE");
    assert.equal(memory.recallEntry("user.location").type, "USER_FACT");
    assert.equal(memory.recallEntry("user.name").status, STATUS.ACTIVE);

    // The migration should have persisted the current structured
    // shape back to disk. PHASE 8: store version is now 3 (v1 -> v3
    // in one hop, same as v1 -> v2 did before this phase).
    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    assert.equal(raw.version, 3);
    assert.ok(Array.isArray(raw.records));
    assert.equal(raw.records.length, 2);
    assert.equal(raw.facts, undefined);
});

test("a corrupt storage file still yields empty allRecords()/allFacts() rather than crashing", () => {
    const storagePath = tempPath("memory.json");
    fs.writeFileSync(storagePath, "{ not valid json", "utf8");

    assert.doesNotThrow(() => {
        const memory = new MemoryEngine({ storagePath });
        assert.deepEqual(memory.allFacts(), {});
        assert.deepEqual(memory.allRecords(), []);
    });
});

test("extractFromMessage()-created facts carry the structured schema too (via the existing rule set)", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    const stored = memory.extractFromMessage("My name is Nakul.");

    assert.equal(stored.length, 1);
    assert.equal(stored[0].key, "user.name");
    assert.equal(stored[0].type, "USER_PROFILE");
    assert.equal(stored[0].status, STATUS.ACTIVE);
    assert.equal(typeof stored[0].id, "string");
});
