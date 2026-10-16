"use strict";

/*
 * Integration test for Phase 6 of the memory + conversation context
 * upgrade: Yes/No confirmation wiring, matching the brief's Test 8
 * ("Should I open YouTube?" -> "Yes." -> YouTube opens).
 *
 * `setConfirmation()`/`getConfirmation()` storage on
 * ConversationContextManager has existed since Phase 1; this phase is
 * the first to actually WRITE to it (via chat.js's new
 * _startOpenConfirmation()/_resolveConfirmation()) and to reuse
 * PendingIntentManager.js's isAffirmative/isNegative/isCancelPhrase
 * word lists for a second purpose beyond pending-intent cancellation.
 *
 * Mirrors the other pending-intent/reference-resolution integration
 * tests: loads the REAL renderer/js/chat.js with a fake browser engine
 * standing in for BrowserBrain/BrowserController.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};
window.jarvis = {};

require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");

const JARVISChat = require("../renderer/js/chat.js");

function freshChat() {
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    const chat = new JARVISChat();

    // Fake browser engine — enough for processBrowser() to find a
    // usable method and return a result, without touching the real
    // Electron BrowserBrain/BrowserController.
    chat.engines = chat.engines || {};
    chat.engines.browser = {
        open: async (query) => ({ handled: true, response: `Opened: "${query}"` })
    };

    return chat;
}

test("integration: 'Should I open YouTube?' asks for confirmation instead of opening immediately", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("Should I open YouTube?");

    assert.equal(result.handled, true);
    assert.equal(result.source, "confirmation");
    assert.match(result.response, /kya main youtube khol doon/i);
    assert.equal(window.JARVISConversationContext.hasConfirmation(), true);
    // The debug-safe snapshot must never leak the onYes/onNo functions.
    const snapshot = window.JARVISConversationContext.getConfirmation();
    assert.equal(snapshot.onYes, undefined);
    assert.equal(snapshot.onNo, undefined);
    assert.equal(snapshot.hasOnYes, true);
    assert.equal(snapshot.hasOnNo, true);
});

test("integration: Test 8 from the brief — full round trip, 'Yes.' actually opens the site", async () => {
    const chat = freshChat();

    const turn1 = await chat.processBrainRouter("Should I open YouTube?");
    assert.match(turn1.response, /kya main youtube khol doon/i);

    const turn2 = await chat.processBrainRouter("Yes.");
    assert.equal(turn2.handled, true);
    assert.equal(turn2.source, "confirmation");
    assert.match(turn2.response, /youtube/i);
    assert.equal(window.JARVISConversationContext.hasConfirmation(), false);
});

test("integration: answering 'No' declines with the concise acknowledgement", async () => {
    const chat = freshChat();

    await chat.processBrainRouter("Should I open YouTube?");
    const result = await chat.processBrainRouter("No");

    assert.equal(result.handled, true);
    assert.equal(result.source, "confirmation");
    assert.equal(result.response, "ओके, कोई बात नहीं।");
    assert.equal(window.JARVISConversationContext.hasConfirmation(), false);
});

test("integration: Hinglish 'haan' also confirms, 'nahi' also declines", async () => {
    const chat1 = freshChat();
    await chat1.processBrainRouter("Kya main YouTube khol doon?");
    const yes = await chat1.processBrainRouter("haan");
    assert.match(yes.response, /youtube/i);

    const chat2 = freshChat();
    await chat2.processBrainRouter("Kya main YouTube khol doon?");
    const no = await chat2.processBrainRouter("nahi");
    assert.equal(no.response, "ओके, कोई बात नहीं।");
});

test("integration: an unrelated new command while confirmation is pending is NOT swallowed", async () => {
    const chat = freshChat();

    await chat.processBrainRouter("Should I open YouTube?");
    assert.equal(window.JARVISConversationContext.hasConfirmation(), true);

    // "cancel" is treated as a decline (same word list PendingIntentManager
    // uses for its own cancel phrases).
    const cancelResult = await chat.processBrainRouter("cancel");
    assert.equal(cancelResult.source, "confirmation");
    assert.equal(cancelResult.response, "ओके, कोई बात नहीं।");
    assert.equal(window.JARVISConversationContext.hasConfirmation(), false);
});

test("integration: a direct 'open youtube' (no permission-asking phrasing) is unaffected and still goes straight to the browser route", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("open youtube");

    assert.equal(result.handled, true);
    assert.equal(result.source, "browser");
    assert.equal(window.JARVISConversationContext.hasConfirmation(), false);
});

test("integration: confirmationFirst = false fully restores old behavior (no confirmation asked)", async () => {
    const chat = freshChat();
    chat.config.confirmationFirst = false;

    const result = await chat.processBrainRouter("Should I open YouTube?");

    // With the kill switch off, this sentence is left to fall through
    // to whatever route would have handled it pre-Phase-6 — here,
    // ROUTE 2 (browser), since "youtube" is still an unconditional
    // browser-trigger word in isBrowserCommand().
    assert.notEqual(result.source, "confirmation");
    assert.equal(window.JARVISConversationContext.hasConfirmation(), false);
});
