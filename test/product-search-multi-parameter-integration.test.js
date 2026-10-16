"use strict";

// Integration checks for the current direct shopping workflow. A product
// lookup opens a search page immediately; JARVIS must never invent prices or
// wait for unrelated budget/use-case turns before showing the live results.

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};
window.jarvis = {};

require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");
const JARVISChat = require("../renderer/js/chat.js");

function freshChat({ browser = true } = {}) {
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    const chat = new JARVISChat();
    if (browser) {
        chat.engines = chat.engines || {};
        chat.engines.browser = {
            search: async (query) => ({ handled: true, response: `Opened browser search for: "${query}"` }),
            open: async (url) => ({ handled: true, response: `Opened browser URL: ${url}` })
        };
    }
    return chat;
}

test("a bare product search opens live shopping results immediately", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("search laptops");
    assert.equal(result.handled, true);
    assert.equal(result.source, "product-search");
    assert.equal(result.richContent?.type, "shoppingSearch");
    assert.match(result.richContent.url, /^https:\/\/www\.google\.com\/search\?tbm=shop&/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("product specs and lowest-price intent are preserved in the shopping query", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("Find DDR4 8 GB RAM 3400 MHz at the lowest price");
    assert.equal(result.source, "product-search");
    assert.equal(result.richContent?.type, "shoppingSearch");
    assert.match(result.richContent.url, /DDR4/);
    assert.match(result.richContent.url, /3400/);
    assert.match(result.richContent.url, /RAM/);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("marketplace requests produce a direct buy/search URL for the requested item", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("Find an RTX 5090 on Amazon");
    assert.equal(result.source, "product-search");
    assert.equal(result.richContent?.type, "shoppingSearch");
    assert.match(result.richContent.url, /^https:\/\/www\.amazon\.in\/s\?/);
    assert.match(decodeURIComponent(result.richContent.url), /RTX 5090/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("ordinary web searches do not enter the shopping flow", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("search cat videos");
    assert.equal(result.source, "browser");
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("an unavailable browser reports failure without fabricating price offers", async () => {
    const chat = freshChat({ browser: false });
    const result = await chat.processBrainRouter("find the cheapest laptop");
    assert.equal(result.handled, true);
    assert.equal(result.source, "product-search");
    assert.match(result.response, /could not open|unavailable/i);
    assert.equal(result.richContent, undefined);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});
