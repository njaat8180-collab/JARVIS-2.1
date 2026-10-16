"use strict";

/*
 * Integration test for Phase 3 of the memory + conversation context
 * upgrade: CURRENCY conversion. Pre-Phase-3, a request the outer
 * trigger regex accepted but the inner regex couldn't fully parse
 * (e.g. "convert dollars to rupees" — currency WORDS, not ISO codes)
 * silently fell through with no response at all. This tests the fix:
 * ask for the missing piece instead of dead-ending.
 *
 * Mirrors weather/time integration tests: loads the REAL
 * renderer/js/chat.js with a fake window.jarvis.data.currencyConvert()
 * standing in for the IPC bridge.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};

window.jarvis = {
    data: {
        currencyConvert: async (amount, from, to) => ({
            success: true,
            data: {
                success: true,
                amount: Number(amount),
                from: String(from).toUpperCase(),
                to: String(to).toUpperCase(),
                converted: Number(amount) * 2,
                rate: 2,
                date: "2026-09-13"
            }
        })
    }
};

require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");

const JARVISChat = require("../renderer/js/chat.js");

function freshChat() {
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    return new JARVISChat();
}

test("integration: '100 USD to INR' still works directly (ISO codes, unchanged behavior)", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("convert 100 usd to inr");

    assert.equal(result.handled, true);
    assert.match(result.response, /100 USD = 200 INR/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: currency WORDS ('dollars to rupees') now parse too, not just ISO codes", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("convert 50 dollars to rupees");

    assert.equal(result.handled, true);
    assert.match(result.response, /50 USD = 100 INR/);
});

test("integration: a currency pair with no amount defaults to 1 (unchanged from before)", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("convert usd to inr");

    assert.equal(result.handled, true);
    assert.match(result.response, /1 USD = 2 INR/);
});

test("integration: an unparseable convert request now asks, instead of silently dead-ending", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("please convert my dollars");

    assert.equal(result.handled, true, "pre-Phase-3 this returned undefined (silently dropped)");
    assert.match(result.response, /kis currency/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), true);
    assert.equal(window.JARVISConversationContext.getPendingIntent().intent, "CURRENCY");
});

test("integration: full router round-trip — unparseable convert, then a follow-up completes it", async () => {
    const chat = freshChat();

    const first = await chat.processBrainRouter("please convert my dollars");
    assert.equal(first.handled, true);
    assert.equal(window.JARVISPendingIntent.hasPending(), true);

    const second = await chat.processBrainRouter("200 usd to eur");
    assert.equal(second.handled, true);
    assert.equal(second.source, "data");
    assert.match(second.response, /200 USD = 400 EUR/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: pendingIntentFirst=false restores the old silent-dead-end behavior for CURRENCY", async () => {
    const chat = freshChat();
    chat.config.pendingIntentFirst = false;

    const result = await chat.processDataSourceCommand("please convert my dollars");

    // Pre-Phase-3, an unparseable convert request fell all the way
    // through processDataSourceCommand's if/else chain with no match,
    // landing on its final "nothing matched" fallback — never a real
    // answer. The kill switch must reproduce that exactly: no pending
    // intent, and no currency-specific response.
    assert.equal(result.handled, false);
    assert.equal(result.response, null);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});
