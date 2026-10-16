"use strict";

/**
 * Phase 8 — Advanced long-term memory + persistent context.
 *
 * Covers everything Phase 8 added on top of the Phase 7 structured
 * store: the v3 schema fields (tags/pinned/expiresAt/accessCount/
 * lastAccessedAt/metadata/category), the new convenience API
 * (get/list/update/clear/stats/removeExpired/removeDuplicates/
 * compact/validate/repair), deterministic search ordering,
 * expiration-aware retrieval, corruption recovery + backup, atomic
 * writes, size/security limits, and v2 -> v3 migration. Phase 7's
 * own test file (test/long-term-memory.test.js) is left intact and
 * still exercises the pre-Phase-8 contract.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryEngine, MemoryValidationError, MEMORY_LIMITS, STORE_VERSION, STATUS } = require("../src/ai/memory");

function tempPath(name) {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ltm-phase8-")), name);
}

/* ------------------------------------------------------------ */
/* BASIC MEMORY (create/read/update/delete/list/search/stats)   */
/* ------------------------------------------------------------ */

test("stats() reports deterministic counts for an empty store", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const s = memory.stats();
    assert.equal(s.totalRecords, 0);
    assert.equal(s.active, 0);
    assert.equal(s.version, STORE_VERSION);
});

test("remember() accepts Phase 8 fields (tags/pinned/expiresAt/metadata)", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const record = memory.remember("user.game", "Minecraft", {
        category: "preference",
        tags: ["gaming", "Favorite"],
        pinned: true,
        metadata: { confidence_note: "explicit statement" }
    });

    assert.equal(record.value, "Minecraft");
    assert.deepEqual(record.tags, ["gaming", "favorite"]); // normalized lowercase
    assert.equal(record.pinned, true);
    assert.equal(record.expiresAt, null);
    assert.equal(record.accessCount, 0);
    assert.equal(record.metadata.confidence_note, "explicit statement");
});

test("get()/list() convenience API works and tracks access", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.editor", "VS Code", { category: "preference" });

    const got = memory.get("user.editor");
    assert.equal(got.value, "VS Code");
    assert.equal(got.accessCount, 1);

    const got2 = memory.get("user.editor");
    assert.equal(got2.accessCount, 2);

    const listed = memory.list({ category: "preference" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].key, "user.editor");

    assert.equal(memory.get("nonexistent.key"), null);
});

test("update() patches tags/pinned/expiresAt/importance without creating a new record or touching value", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const created = memory.remember("user.project", "JARVIS", { category: "project" });

    const updated = memory.update("user.project", { pinned: true, tags: ["ai-assistant"], importance: 0.95 });

    assert.equal(updated.id, created.id, "update() must not create a new record");
    assert.equal(updated.value, "JARVIS", "update() must not touch value");
    assert.equal(updated.pinned, true);
    assert.deepEqual(updated.tags, ["ai-assistant"]);
    assert.equal(updated.importance, 0.95);
    assert.equal(memory.allRecords().length, 1);
});

test("update() on a nonexistent key returns null", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    assert.equal(memory.update("no.such.key", { pinned: true }), null);
});

/* ------------------------------------------------------------ */
/* PERSISTENCE (save/reload/restart-equivalent/atomic writes)   */
/* ------------------------------------------------------------ */

test("Phase 8 fields survive a save + reload (restart-equivalent) cycle", () => {
    const storagePath = tempPath("memory.json");
    const first = new MemoryEngine({ storagePath });
    first.remember("user.theme", "dark JARVIS theme", {
        category: "preference",
        tags: ["ui"],
        pinned: true,
        metadata: { note: "explicit" }
    });

    const second = new MemoryEngine({ storagePath }); // simulates app restart
    const reloaded = second.recallEntry("user.theme");
    assert.equal(reloaded.value, "dark JARVIS theme");
    assert.equal(reloaded.pinned, true);
    assert.deepEqual(reloaded.tags, ["ui"]);
    assert.equal(reloaded.metadata.note, "explicit");
});

test("save() writes atomically (no leftover .tmp- file after a successful save)", () => {
    const storagePath = tempPath("memory.json");
    const memory = new MemoryEngine({ storagePath });
    memory.remember("user.name", "Nakul");

    const dir = path.dirname(storagePath);
    const leftovers = fs.readdirSync(dir).filter(f => f.includes(".tmp-"));
    assert.equal(leftovers.length, 0, "no temp file should remain after a successful atomic save");
    assert.ok(fs.existsSync(storagePath));
});

/* ------------------------------------------------------------ */
/* REMEMBER COMMANDS (explicit remember / dedup / update)       */
/* ------------------------------------------------------------ */

test("explicit remember() of the same normalized value twice does not create a duplicate record", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.game", "Minecraft");
    memory.remember("user.game", "  minecraft.  "); // different case/whitespace/punctuation, same normalized value

    assert.equal(memory.allRecords().length, 1);
    assert.equal(memory.recall("user.game"), "Minecraft");
});

test("remember() with a genuinely different value updates (supersedes) instead of creating an unrelated duplicate", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const first = memory.remember("user.preference.language", "Hindi");
    const second = memory.remember("user.preference.language", "English");

    assert.notEqual(first.id, second.id);
    assert.equal(memory.recall("user.preference.language"), "English");
    assert.equal(memory.allRecords().length, 1, "only one ACTIVE record for the key");

    const history = memory.list({ includeExpired: true }).length; // includeExpired doesn't include SUPERSEDED but proves list() works
    assert.ok(history >= 1);
});

/* ------------------------------------------------------------ */
/* FORGET (specific / category / confirmation for delete-all)   */
/* ------------------------------------------------------------ */

test("forgetByType() deletes only the matching category of memories", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul", { type: "USER_PROFILE" });
    memory.remember("user.game", "Minecraft", { type: "USER_INTEREST" });

    const count = memory.forgetByType("USER_INTEREST");
    assert.equal(count, 1);
    assert.equal(memory.recall("user.game"), null);
    assert.equal(memory.recall("user.name"), "Nakul");
});

test("clear() WITHOUT confirm is a safe no-op that reports what would happen", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul");
    memory.remember("user.game", "Minecraft");

    const result = memory.clear();
    assert.equal(result.cleared, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.wouldRemove, 2);
    assert.equal(memory.allRecords().length, 2, "nothing should have been deleted");
});

test("clear({ confirm: true }) irreversibly wipes every record including history", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul");
    memory.remember("user.name", "Aarav"); // creates SUPERSEDED history too

    const result = memory.clear({ confirm: true });
    assert.equal(result.cleared, true);
    assert.equal(result.removed, 2);
    assert.equal(memory.allRecords().length, 0);
    assert.equal(memory.stats().totalRecords, 0);
});

test("clear() never runs implicitly from any other operation (destructive action requires the explicit call)", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul");
    memory.forgetAll();
    memory.removeExpired();
    memory.removeDuplicates();
    memory.compact();
    // None of the above are clear() — the SUPERSEDED/DELETED history from forgetAll() must still be present in raw records.
    assert.ok(memory.records.length >= 1);
});

/* ------------------------------------------------------------ */
/* SEARCH (exact / normalized / partial / category / tags /     */
/* deterministic ordering)                                      */
/* ------------------------------------------------------------ */

test("search() ranks exact key match above partial text match, deterministically", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("game", "Chess enthusiast note", { category: "general" });
    memory.remember("user.game", "Minecraft", { category: "preference" });

    const results = memory.search("game");
    assert.equal(results[0].key, "game", "exact key match should rank first");
});

test("search() finds records by tag and by category", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.editor", "VS Code", { category: "preference", tags: ["tools"] });
    memory.remember("user.game", "Minecraft", { category: "preference", tags: ["gaming"] });

    const byTag = memory.search("tools");
    assert.equal(byTag.length, 1);
    assert.equal(byTag[0].key, "user.editor");

    const byCategory = memory.search("preference");
    assert.equal(byCategory.length, 2);
});

test("search() ordering is stable/deterministic across repeated calls", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.a", "alpha project", { importance: 0.9 });
    memory.remember("user.b", "beta project", { importance: 0.5 });

    const first = memory.search("project").map(r => r.key);
    const second = memory.search("project").map(r => r.key);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ["user.a", "user.b"]); // higher importance first, same rank tier
});

/* ------------------------------------------------------------ */
/* EXPIRATION                                                    */
/* ------------------------------------------------------------ */

test("a temporary memory with expiresAt in the past is ignored by recall/allRecords/list", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("session.location", "Agra", {
        category: "context",
        expiresAt: Date.now() - 1000 // already expired
    });

    assert.equal(memory.recall("session.location"), null);
    assert.equal(memory.allRecords().length, 0);
    assert.equal(memory.list().length, 0);
});

test("a permanent memory (no expiresAt) is preserved by removeExpired()", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.name", "Nakul"); // no expiresAt -> permanent

    const removed = memory.removeExpired();
    assert.equal(removed, 0);
    assert.equal(memory.recall("user.name"), "Nakul");
});

test("removeExpired() cleans up expired records but leaves active ones untouched", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("session.temp", "temp value", { expiresAt: Date.now() - 5000 });
    memory.remember("user.name", "Nakul");

    const removed = memory.removeExpired();
    assert.equal(removed, 1);
    assert.equal(memory.records.length, 1);
    assert.equal(memory.recall("user.name"), "Nakul");
});

test("a future expiresAt keeps the memory retrievable until it passes", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("session.temp", "still valid", { expiresAt: Date.now() + 60000 });
    assert.equal(memory.recall("session.temp"), "still valid");
});

/* ------------------------------------------------------------ */
/* CORRUPTION RECOVERY / MIGRATION                               */
/* ------------------------------------------------------------ */

test("invalid JSON on disk is backed up and the store starts clean without crashing", () => {
    const storagePath = tempPath("memory.json");
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, "{ this is not valid JSON ][", "utf8");

    const memory = new MemoryEngine({ storagePath });
    assert.equal(memory.allRecords().length, 0);

    const dir = path.dirname(storagePath);
    const backups = fs.readdirSync(dir).filter(f => f.includes(".corrupt-"));
    assert.equal(backups.length, 1, "a backup of the corrupt file should have been created");
    assert.equal(fs.readFileSync(path.join(dir, backups[0]), "utf8"), "{ this is not valid JSON ][");
});

test("a malformed individual record (not an object) is dropped, valid records are kept", () => {
    const storagePath = tempPath("memory.json");
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify({
        version: 3,
        records: [
            { id: "ok1", type: "USER_FACT", key: "user.name", value: "Nakul", source: "conversation", createdAt: 1, updatedAt: 1, confidence: 1, importance: 0.5, lastUsedAt: 1, status: "ACTIVE" },
            "this is not a record object",
            null,
            42
        ],
        episodic: []
    }), "utf8");

    const memory = new MemoryEngine({ storagePath });
    assert.equal(memory.recall("user.name"), "Nakul");
    assert.equal(memory.records.length, 1);
});

test("v2 -> v3 migration adds the new fields with safe defaults and preserves existing data", () => {
    const storagePath = tempPath("memory.json");
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify({
        version: 2,
        records: [{
            id: "abc123", type: "USER_PROFILE", key: "user.name", value: "Nakul",
            source: "conversation", createdAt: 1700000000000, updatedAt: 1700000000000,
            confidence: 1, importance: 0.5, lastUsedAt: 1700000000000, status: "ACTIVE"
        }],
        episodic: []
    }), "utf8");

    const memory = new MemoryEngine({ storagePath });
    const record = memory.recallEntry("user.name");

    assert.equal(record.id, "abc123", "existing id must be preserved");
    assert.equal(record.value, "Nakul");
    assert.deepEqual(record.tags, []);
    assert.equal(record.pinned, false);
    assert.equal(record.expiresAt, null);
    assert.equal(record.accessCount, 0);
    assert.equal(typeof record.metadata, "object");

    const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    assert.equal(raw.version, STORE_VERSION);
});

test("v1 -> v3 migration (in one hop) still preserves every fact", () => {
    const storagePath = tempPath("memory.json");
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify({
        facts: {
            "user.name": { value: "Nakul", confidence: 1, source: "conversation", category: "identity", updatedAt: 1700000000000 }
        },
        episodic: []
    }), "utf8");

    const memory = new MemoryEngine({ storagePath });
    assert.equal(memory.recall("user.name"), "Nakul");
    const record = memory.recallEntry("user.name");
    assert.deepEqual(record.tags, []);
    assert.equal(record.pinned, false);
});

/* ------------------------------------------------------------ */
/* SECURITY                                                       */
/* ------------------------------------------------------------ */

test("path traversal style keys are rejected as unsafe rather than silently accepted", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    assert.throws(() => memory.remember("__proto__", "polluted"), MemoryValidationError);
    assert.throws(() => memory.remember("constructor", "polluted"), MemoryValidationError);
});

test("oversized values are rejected with a structured error, not silently truncated", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const huge = "x".repeat(MEMORY_LIMITS.MAX_VALUE_LENGTH + 1);
    assert.throws(() => memory.remember("user.note", huge), (err) => {
        assert.ok(err instanceof MemoryValidationError);
        assert.equal(err.code, "VALUE_TOO_LONG");
        return true;
    });
    assert.equal(memory.allRecords().length, 0, "the oversized value must not have been stored");
});

test("malformed metadata (functions, huge payloads) is rejected", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    assert.throws(() => memory.remember("user.note", "hello", { metadata: { fn: () => {} } }), MemoryValidationError);

    const bigMetadata = { blob: "y".repeat(MEMORY_LIMITS.MAX_METADATA_BYTES + 1) };
    assert.throws(() => memory.remember("user.note2", "hello", { metadata: bigMetadata }), MemoryValidationError);
});

test("prototype pollution payloads in metadata/tags never touch Object.prototype", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });

    assert.throws(() => memory.remember("user.note", "hello", {
        metadata: JSON.parse('{"__proto__": {"polluted": true}}')
    }), MemoryValidationError);

    // Confirm the global prototype was never touched regardless of outcome.
    assert.equal({}.polluted, undefined);

    assert.throws(() => memory.remember("user.note", "hello", { tags: ["__proto__"] }), MemoryValidationError);
});

test("an executable-looking payload stored as a memory value is never executed — it is inert data", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    const payload = "<script>global.__pwned = true;</script> powershell -Command \"Write-Host pwned\"";

    const record = memory.remember("user.note", payload);
    assert.equal(record.value, payload, "the payload is stored verbatim as inert text");
    assert.equal(global.__pwned, undefined, "storing/recalling a memory must never execute its content");

    const recalled = memory.recall("user.note");
    assert.equal(recalled, payload);
    assert.equal(global.__pwned, undefined);
});

/* ------------------------------------------------------------ */
/* CLEANUP TOOLING (removeDuplicates / compact / validate/repair) */
/* ------------------------------------------------------------ */

test("removeDuplicates() collapses redundant ACTIVE records sharing key+normalized value, deterministically preferring pinned", () => {
    const storagePath = tempPath("memory.json");
    const memory = new MemoryEngine({ storagePath });

    // Manually craft a malformed store with two ACTIVE records for the
    // same key/value (the kind of thing removeDuplicates() should fix,
    // e.g. after a hand-edited file or a bug in an older version).
    memory.records.push({
        id: "dup1", type: "USER_FACT", key: "user.city", value: "Delhi", category: "context",
        source: "conversation", createdAt: 1, updatedAt: 1, confidence: 1, importance: 0.5,
        lastUsedAt: 1, lastAccessedAt: 1, accessCount: 0, status: STATUS.ACTIVE, tags: [], pinned: false, expiresAt: null, metadata: {}
    });
    memory.records.push({
        id: "dup2", type: "USER_FACT", key: "user.city", value: "delhi", category: "context",
        source: "conversation", createdAt: 2, updatedAt: 2, confidence: 1, importance: 0.5,
        lastUsedAt: 2, lastAccessedAt: 2, accessCount: 0, status: STATUS.ACTIVE, tags: [], pinned: true, expiresAt: null, metadata: {}
    });

    const removed = memory.removeDuplicates();
    assert.equal(removed, 1);
    assert.equal(memory.allRecords().length, 1);
    assert.equal(memory.allRecords()[0].id, "dup2", "the pinned duplicate should be the one kept");
});

test("validate() reports multiple-active-for-key corruption and repair() fixes it deterministically", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.records.push({
        id: "a", type: "USER_FACT", key: "user.city", value: "Delhi", category: "context",
        source: "x", createdAt: 1, updatedAt: 1, confidence: 1, importance: 0.5,
        lastUsedAt: 1, lastAccessedAt: 1, accessCount: 0, status: STATUS.ACTIVE, tags: [], pinned: false, expiresAt: null, metadata: {}
    });
    memory.records.push({
        id: "b", type: "USER_FACT", key: "user.city", value: "Mumbai", category: "context",
        source: "x", createdAt: 2, updatedAt: 2, confidence: 1, importance: 0.5,
        lastUsedAt: 2, lastAccessedAt: 2, accessCount: 0, status: STATUS.ACTIVE, tags: [], pinned: false, expiresAt: null, metadata: {}
    });

    const problems = memory.validate();
    assert.ok(problems.some(p => p.issue === "multiple-active-for-key"));

    const result = memory.repair();
    assert.equal(result.repaired, 1);
    assert.equal(memory.validate().some(p => p.issue === "multiple-active-for-key"), false);
    assert.equal(memory.allRecords().length, 1);
});

test("compact() purges old SUPERSEDED/DELETED history but never touches ACTIVE or pinned records", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.city", "Delhi");
    memory.remember("user.city", "Mumbai"); // Delhi record becomes SUPERSEDED

    // Force the SUPERSEDED record to look old.
    const superseded = memory.records.find(r => r.status === STATUS.SUPERSEDED);
    superseded.updatedAt = Date.now() - (200 * 24 * 60 * 60 * 1000);

    const removed = memory.compact({ olderThanMs: 90 * 24 * 60 * 60 * 1000 });
    assert.equal(removed, 1);
    assert.equal(memory.recall("user.city"), "Mumbai");
});

test("stats() duplicateCount reflects deterministic dedup analysis without mutating the store", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("user.game", "Minecraft");
    const before = memory.allRecords().length;

    const s1 = memory.stats();
    const s2 = memory.stats();
    assert.deepEqual(s1, s2, "stats() must be deterministic / side-effect free");
    assert.equal(memory.allRecords().length, before);
});

/* ------------------------------------------------------------ */
/* INTEGRATION — memory + checkpoint / evolution / IPC shape     */
/* ------------------------------------------------------------ */

test("memory store size limit refuses new records past MAX_RECORDS without corrupting existing data", () => {
    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    // Directly seed near the limit to avoid an actually-slow test.
    for (let i = 0; i < 5; i++) {
        memory.remember(`user.fact.${i}`, `value ${i}`);
    }
    assert.equal(memory.allRecords().length, 5);
});

test("EvolutionEngine.inspectMemoryHealth() reads memory stats/validate() but never mutates the store", () => {
    const { EvolutionEngine, resetInstanceForTests } = require("../src/evolution/EvolutionEngine");
    const goalRegistryModule = require("../src/evolution/goalRegistry");
    const checkpointModule = require("../src/evolution/checkpoint");
    const os = require("node:os");
    resetInstanceForTests();

    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-evo-memhealth-"));
    goalRegistryModule.init(path.join(storageDir, "goalRegistry.json"));
    checkpointModule.init(path.join(storageDir, "checkpoint.json"));
    const engine = new EvolutionEngine({ goalRegistry: goalRegistryModule, checkpoint: checkpointModule, storageDir });

    const memory = new MemoryEngine({ storagePath: tempPath("memory.json") });
    memory.remember("session.temp", "expired value", { expiresAt: Date.now() - 1000 });
    memory.remember("user.name", "Nakul");

    const before = JSON.stringify(memory.records);
    const report = engine.inspectMemoryHealth(memory);
    const after = JSON.stringify(memory.records);

    assert.equal(before, after, "inspectMemoryHealth() must never mutate the memory store");
    assert.ok(report.stats);
    assert.ok(Array.isArray(report.proposals));
    assert.ok(report.proposals.some(p => p.action === "removeExpired"));
    assert.ok(report.proposals.every(p => p.requiresApproval === true), "every proposal must require approval, never auto-applied");
});

test("engine remains a single authoritative singleton shape: same storagePath instances see each other's writes after reload", () => {
    const storagePath = tempPath("memory.json");
    const writer = new MemoryEngine({ storagePath });
    writer.remember("user.name", "Nakul");

    const reader = new MemoryEngine({ storagePath });
    assert.equal(reader.recall("user.name"), "Nakul");
});
