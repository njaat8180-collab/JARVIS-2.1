"use strict";

/*
 * Regression test for the "favorite" memory extraction rule.
 *
 * Background: "remember that my favorite color is blue" (and the
 * Hinglish variant "mera favourite game hai chess") previously
 * matched NO extraction rule, so the memory command was refused
 * with "I could not find a safe, explicit fact to remember".
 *
 * See src/ai/memory.js EXTRACTION_RULES → user.favorite.
 */

const test = require("node:test");
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

const { MemoryEngine } = require("../src/ai/memory");

function tempStore() {
    return path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-favorite-test-")),
        "memory.json"
    );
}

test("extracts 'my favorite X is Y' as a long-term preference", () => {
    const engine = new MemoryEngine({ storagePath: tempStore() });
    const stored = engine.extractFromMessage(
        "Remember that my favorite color is blue",
        { source: "memory-command" }
    );

    assert.strictEqual(stored.length, 1, "should store exactly one fact");
    assert.strictEqual(stored[0].key, "user.favorite.color");
    assert.ok(String(stored[0].value).toLowerCase().includes("blue"));
    assert.strictEqual(stored[0].retention, "LONG_TERM");
});

test("extracts the Hinglish variant 'mera favourite X hai Y'", () => {
    const engine = new MemoryEngine({ storagePath: tempStore() });
    const stored = engine.extractFromMessage(
        "mera favourite game hai chess",
        { source: "memory-command" }
    );

    assert.strictEqual(stored.length, 1, "should store exactly one fact");
    assert.strictEqual(stored[0].key, "user.favorite.game");
    assert.ok(String(stored[0].value).toLowerCase().includes("chess"));
});

test("favorite rule does not disturb existing preference rules", () => {
    const engine = new MemoryEngine({ storagePath: tempStore() });
    const stored = engine.extractFromMessage(
        "remember that I like masala chai",
        { source: "memory-command" }
    );

    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].key, "user.preference");
    assert.strictEqual(stored[0].value, "masala chai");
});

test("favorite rule stays silent for vague statements", () => {
    const engine = new MemoryEngine({ storagePath: tempStore() });
    const stored = engine.extractFromMessage(
        "that movie was my favorite one so far",
        { source: "conversation" }
    );

    assert.strictEqual(stored.length, 0, "no structured fact — nothing to store");
});
