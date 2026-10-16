"use strict";

/*
 * Integration test for Phase 5 of the memory + conversation context
 * upgrade: exercises the REAL renderer/js/chat.js router together
 * with the REAL renderer/js/brain/naturalCommandEngine.js (not mocks)
 * to prove the brief's Test 7 scenario end to end:
 *
 *   User:  "Tell me about NASA."
 *   JARVIS: <Wikipedia summary of NASA> (and remembers NASA as the
 *            active topic)
 *   User:  "What is it?"
 *   JARVIS: resolves "it" -> "NASA" BEFORE routing, so this is
 *            answered exactly as if the user had typed "What is
 *            NASA?", instead of asking Wikipedia about the literal
 *            word "it".
 *
 * Same approach as test/weather-pending-intent-integration.test.js:
 * a minimal `global.window` with fake `window.jarvis` bridges, real
 * source files loaded via require(), no network/display required.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};
window.addEventListener = window.addEventListener || (() => {});

// Fake Wikipedia bridge (see src/services/wikipedia.js for the real
// shape this mimics) — keyed by the (lowercased) topic actually
// requested, so the test can tell whether the real subject ("nasa")
// or the literal, unresolved pronoun ("it") was looked up.
const WIKI_FIXTURES = {
    nasa: {
        success: true,
        title: "NASA",
        extract: "NASA is the space agency of the United States.",
        lang: "en"
    }
};

window.jarvis = {
    data: {},
    wikipedia: {
        summary: async (topic) => {
            const key = String(topic || "").trim().toLowerCase();
            const fixture = WIKI_FIXTURES[key];
            return {
                data: fixture || { success: false, error: `No page found for "${topic}".` }
            };
        }
    }
};

// Loading these attaches the same globals renderer/index.html wires
// up via <script defer> tags, just via require() instead.
require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");
require("../renderer/js/context/ReferenceResolver.js");
require("../renderer/js/brain/naturalCommandEngine.js");

const JARVISChat = require("../renderer/js/chat.js");

function freshChat() {
    // Isolated context per test, same pattern as the other
    // pending-intent integration test files.
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    return new JARVISChat();
}

test("integration: 'Tell me about NASA' sets the active topic to NASA", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("Tell me about NASA");

    assert.equal(result.handled, true);
    assert.equal(result.source, "natural-intent");
    assert.equal(result.intent, "KNOWLEDGE");
    assert.match(result.response, /NASA/);

    const topic = window.JARVISConversationContext.getTopic();
    assert.ok(topic, "expected an active topic to be set");
    assert.equal(topic.subject, "Nasa", "title-cased from the lowercased entity extraction");
});

test("integration: full round trip — NASA lookup, then 'What is it?' resolves to NASA, not the literal word 'it'", async () => {
    const chat = freshChat();

    const first = await chat.processBrainRouter("Tell me about NASA");
    assert.equal(first.handled, true);
    assert.match(first.response, /space agency/i);

    const second = await chat.processBrainRouter("What is it?");
    assert.equal(second.handled, true);
    assert.equal(second.intent, "KNOWLEDGE");
    // Proves the real Wikipedia fixture for "nasa" was hit (not a
    // "No page found" miss for the literal word "it").
    assert.match(second.response, /space agency/i);
});

test("integration: without any prior topic, 'What is it?' is NOT rewritten (no-topic guard) and just misses", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("What is it?");
    assert.equal(result.handled, true);
    assert.match(result.response, /couldn't find|No page found/i);
});

test("integration: an unrelated, self-contained command after a topic is set is NOT hijacked by reference resolution", async () => {
    const chat = freshChat();

    await chat.processBrainRouter("Tell me about NASA");
    assert.ok(window.JARVISConversationContext.getTopic());

    // "system status" contains no curated reference word at all, so
    // this must fall straight through to the existing offline route,
    // completely unaffected by the active NASA topic.
    const result = await chat.processBrainRouter("system status");
    assert.equal(result.handled, true);
    assert.equal(result.source, "offline");
});

test("integration: disabling referenceResolutionFirst restores old (unresolved) behavior", async () => {
    const chat = freshChat();
    chat.config.referenceResolutionFirst = false;

    await chat.processBrainRouter("Tell me about NASA");
    const result = await chat.processBrainRouter("What is it?");

    // With the kill switch off, "it" is never substituted, so the
    // literal (unresolvable) word is looked up and misses.
    assert.equal(result.handled, true);
    assert.match(result.response, /couldn't find|No page found/i);
});
