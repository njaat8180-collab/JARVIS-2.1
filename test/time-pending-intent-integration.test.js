"use strict";

/*
 * Integration test for Phase 2 of the memory + conversation context
 * upgrade: TIME follow-up resolution, plus the city-name -> IANA
 * timezone mapping needed to make a plain reply like "Delhi" actually
 * work against WorldTimeAPI (which requires "Area/City" zone names).
 *
 * Mirrors test/weather-pending-intent-integration.test.js: loads the
 * REAL renderer/js/chat.js (not a mock) with a fake
 * window.jarvis.data.timeForZone() standing in for the IPC bridge.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};

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
        }),
        timeForZone: async (zone) => ({
            success: true,
            data: {
                success: true,
                timezone: zone,
                datetime: "2026-09-13T21:00:00+05:30",
                utcOffset: "+05:30",
                dayOfWeek: 1,
                isDST: false
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

test("integration: 'time batao' immediately reports Delhi without opening a city follow-up", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("time batao");

    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: full router answers Delhi immediately and ignores a later city request", async () => {
    const chat = freshChat();

    const first = await chat.processBrainRouter("time batao");
    assert.equal(first.handled, true);
    assert.match(first.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);

    const second = await chat.processBrainRouter("time in London");
    assert.equal(second.handled, true);
    assert.match(second.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: 'time in Tokyo' is answered with Delhi time only", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("time in Tokyo");

    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: an explicit 'Area/City' zone still reports Delhi time", async () => {
    const chat = freshChat();

    const result = await chat.processDataSourceCommand("timezone Europe/Berlin");

    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
});

test("integration: an unrecognized city still receives the requested Delhi clock", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("time in Wakanda");

    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("integration: explicit English 'what's the time' local-device query is unaffected (still goes to offline route)", async () => {
    const chat = freshChat();

    const result = await chat.processBrainRouter("what's the time");

    assert.equal(result.handled, true);
    assert.equal(result.source, "offline", "generic Hinglish TIME triggers must not swallow the existing explicit local-time command");
});

test("integration: pendingIntentFirst=false still uses the Delhi-only TIME route", async () => {
    const chat = freshChat();
    chat.config.pendingIntentFirst = false;

    const result = await chat.processDataSourceCommand("time batao");

    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});
