"use strict";

/*
 * Integration test for Phase 1 of the memory + conversation context
 * upgrade: exercises the REAL renderer/js/chat.js router (not a mock),
 * the same way test/natural-command-engine.test.js exercises the real
 * naturalCommandEngine.js, to prove the "weather batao" -> "Kis city
 * ka weather?" -> "Delhi" -> real weather flow works end to end
 * through processBrainRouter(), not just through the isolated manager
 * unit tests in test/context-managers.test.js.
 *
 * chat.js is written for a browser (`window.jarvis`, `window.JARVIS*`)
 * so this test defines a minimal `global.window` before requiring it,
 * with a fake `window.jarvis.data.weather()` standing in for the real
 * IPC bridge to main.js (see src/services/dataSources.js) — no
 * network access is used or required.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};

// Fake IPC bridge — enough for processDataSourceCommand()'s weather
// branch, without touching the real Electron IPC / network layer.
window.jarvis = {
    data: {
        weather: async (place) => ({
            success: true,
            data: {
                success: true,
                place,
                temperature: 30,
                unit: "\u00b0C",
                feelsLike: 32,
                condition: "Clear",
                humidity: 40,
                windSpeed: 10
            }
        })
    }
};

// Loading these attaches window.JARVISConversationContext /
// window.JARVISPendingIntent, exactly as renderer/index.html does via
// <script defer> tags, just via require() instead of a <script> tag.
require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");

const JARVISChat = require("../renderer/js/chat.js");

function freshChat() {
    // Each test gets an isolated context so pending state from one
    // test can't leak into the next.
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    return new JARVISChat();
}

test("integration: 'weather batao' with no city asks a follow-up instead of guessing Delhi", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("weather batao");

    assert.equal(result.handled, true);
    assert.match(result.response, /kis city/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), true);
    assert.equal(window.JARVISConversationContext.getPendingIntent().intent, "WEATHER");
});

test("integration: a direct city still works with no follow-up needed", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("Mumbai weather batao");

    assert.equal(result.handled, true);
    assert.match(result.response, /mumbai/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: full router round-trip — 'weather batao' then 'Delhi' resolves via ROUTE -1", async () => {
    const chat = freshChat();

    const first = await chat.processBrainRouter("weather batao");
    assert.equal(first.handled, true);
    assert.match(first.response, /kis city/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), true);

    const second = await chat.processBrainRouter("Delhi");
    assert.equal(second.handled, true);
    assert.equal(second.source, "data", "resolved weather answers keep the same 'data' source as a direct weather query");
    assert.match(second.response, /delhi/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), false, "pending intent must be cleared after resolution");
});

test("integration: an unrelated command while a pending intent is open still falls through correctly", async () => {
    const chat = freshChat();

    const first = await chat.processBrainRouter("weather batao");
    assert.equal(first.handled, true);
    assert.equal(window.JARVISPendingIntent.hasPending(), true);

    // "current time" doesn't match the WEATHER pending intent's
    // default resolver's new-command guard, but IS a real, different,
    // already-existing offline command — ROUTE -1 must decline (no
    // match) and let ROUTE 3 (offline) answer it normally instead of
    // swallowing it as a city name.
    const second = await chat.processBrainRouter("current time");
    assert.equal(second.handled, true);
    assert.equal(second.source, "offline");
});

test("integration: saying 'cancel' clears the pending weather question", async () => {
    const chat = freshChat();

    await chat.processBrainRouter("weather batao");
    assert.equal(window.JARVISPendingIntent.hasPending(), true);

    const cancelResult = await chat.processBrainRouter("cancel");
    assert.equal(cancelResult.handled, true);
    assert.equal(cancelResult.source, "pending-intent");
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: disabling pendingIntentFirst restores the old (no-follow-up) behavior", async () => {
    const chat = freshChat();
    chat.config.pendingIntentFirst = false;

    await chat.processBrainRouter("weather batao");
    // With the feature flag off, ROUTE -1 never runs, so a bare
    // "Delhi" afterwards is just routed normally (not consumed as an
    // answer) — proving the kill switch actually disables the route.
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});
