"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ConversationContextManager } = require("../renderer/js/context/ConversationContextManager.js");
const { PendingIntentManager, defaultResolver, isCancelPhrase, isAffirmative, isNegative } =
    require("../renderer/js/context/PendingIntentManager.js");
const { ReferenceResolver } = require("../renderer/js/context/ReferenceResolver.js");

/* ------------------------------------------------------------
   ConversationContextManager
------------------------------------------------------------ */

test("ConversationContextManager: pushTurn keeps a bounded rolling window", () => {
    const ctx = new ConversationContextManager({ maxTurns: 3 });

    ctx.pushTurn("user", "one");
    ctx.pushTurn("assistant", "two");
    ctx.pushTurn("user", "three");
    ctx.pushTurn("assistant", "four");

    const turns = ctx.getRecentTurns();
    assert.equal(turns.length, 3);
    assert.deepEqual(turns.map(t => t.text), ["two", "three", "four"]);
});

test("ConversationContextManager: pushTurn ignores empty text", () => {
    const ctx = new ConversationContextManager();
    ctx.pushTurn("user", "   ");
    ctx.pushTurn("user", "");
    assert.equal(ctx.getRecentTurns().length, 0);
});

test("ConversationContextManager: getLastUserTurn / getLastAssistantTurn", () => {
    const ctx = new ConversationContextManager();
    ctx.pushTurn("user", "hello");
    ctx.pushTurn("assistant", "hi there");
    ctx.pushTurn("user", "how are you");

    assert.equal(ctx.getLastUserTurn().text, "how are you");
    assert.equal(ctx.getLastAssistantTurn().text, "hi there");
});

test("ConversationContextManager: topic set/get/clear", () => {
    const ctx = new ConversationContextManager();
    assert.equal(ctx.getTopic(), null);

    ctx.setTopic("NASA");
    assert.equal(ctx.getTopic().subject, "NASA");

    ctx.clearTopic();
    assert.equal(ctx.getTopic(), null);
});

test("ConversationContextManager: pending intent storage round-trip", () => {
    const ctx = new ConversationContextManager();
    assert.equal(ctx.hasPendingIntent(), false);

    ctx.setPendingIntent({
        intent: "WEATHER",
        missingParameter: "city",
        prompt: "Which city?",
        resolver: (text) => text.trim()
    });

    assert.equal(ctx.hasPendingIntent(), true);

    const snapshot = ctx.getPendingIntent();
    assert.equal(snapshot.intent, "WEATHER");
    assert.equal(snapshot.missingParameter, "city");
    // The resolver function itself must never leak through the
    // debug-safe snapshot.
    assert.equal(snapshot.resolver, undefined);
    assert.equal(snapshot.hasCustomResolver, true);

    ctx.clearPendingIntent();
    assert.equal(ctx.hasPendingIntent(), false);
});

test("ConversationContextManager: setPendingIntent requires an intent", () => {
    const ctx = new ConversationContextManager();
    assert.equal(ctx.setPendingIntent({}), null);
    assert.equal(ctx.setPendingIntent(null), null);
});

test("ConversationContextManager: confirmation storage round-trip (Phase 6)", () => {
    const ctx = new ConversationContextManager();
    assert.equal(ctx.hasConfirmation(), false);

    ctx.setConfirmation({
        question: "Kya main YouTube khol doon?",
        onYes: () => "opened",
        onNo: () => "declined",
        meta: { site: "youtube" }
    });

    assert.equal(ctx.hasConfirmation(), true);

    const snapshot = ctx.getConfirmation();
    assert.equal(snapshot.question, "Kya main YouTube khol doon?");
    // onYes/onNo functions themselves must never leak through the
    // debug-safe snapshot — same treatment getPendingIntent() gives
    // its resolver function.
    assert.equal(snapshot.onYes, undefined);
    assert.equal(snapshot.onNo, undefined);
    assert.equal(snapshot.hasOnYes, true);
    assert.equal(snapshot.hasOnNo, true);

    ctx.clearConfirmation();
    assert.equal(ctx.hasConfirmation(), false);
});

test("ConversationContextManager: setConfirmation requires a question", () => {
    const ctx = new ConversationContextManager();
    assert.equal(ctx.setConfirmation({}), null);
    assert.equal(ctx.setConfirmation(null), null);
});

test("ConversationContextManager: clearContext keeps turns, clearAll wipes them", () => {
    const ctx = new ConversationContextManager();
    ctx.pushTurn("user", "hello");
    ctx.setTopic("NASA");
    ctx.setPendingIntent({ intent: "X", missingParameter: "y", prompt: "?" });

    ctx.clearContext();
    assert.equal(ctx.getTopic(), null);
    assert.equal(ctx.hasPendingIntent(), false);
    assert.equal(ctx.getRecentTurns().length, 1, "turns must survive clearContext()");

    ctx.clearAll();
    assert.equal(ctx.getRecentTurns().length, 0);
});

/* ------------------------------------------------------------
   PendingIntentManager
------------------------------------------------------------ */

test("PendingIntentManager: tryResolve with nothing pending", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    const result = pim.tryResolve("Delhi");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "no-pending");
});

test("PendingIntentManager: setPending requires intent/missingParameter/prompt", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    assert.equal(pim.setPending({ intent: "WEATHER" }), null);
    assert.equal(ctx.hasPendingIntent(), false);
});

test("PendingIntentManager: resolves a short follow-up with the default resolver", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    pim.setPending({
        intent: "WEATHER",
        skill: "data.weather",
        missingParameter: "city",
        originalRequest: "weather batao",
        prompt: "Kis city ka weather?"
    });

    const result = pim.tryResolve("Delhi");
    assert.equal(result.resolved, true);
    assert.equal(result.intent, "WEATHER");
    assert.equal(result.parameters.city, "Delhi");
    assert.equal(ctx.hasPendingIntent(), false, "pending intent must be cleared once resolved");
});

test("PendingIntentManager: rejects long, sentence-like replies via the default resolver", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    pim.setPending({
        intent: "WEATHER",
        missingParameter: "city",
        prompt: "Kis city ka weather?"
    });

    const result = pim.tryResolve("I honestly have no idea what city you mean here");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "no-match");
    assert.equal(ctx.hasPendingIntent(), true, "pending intent must be kept for a retry");
});

test("PendingIntentManager: an unrelated new command does not get swallowed", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    pim.setPending({
        intent: "WEATHER",
        missingParameter: "city",
        prompt: "Kis city ka weather?"
    });

    const result = pim.tryResolve("open youtube");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "no-match");
});

test("PendingIntentManager: cancel phrases clear the pending intent", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    pim.setPending({
        intent: "WEATHER",
        missingParameter: "city",
        prompt: "Kis city ka weather?"
    });

    const result = pim.tryResolve("cancel");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "cancelled");
    assert.equal(ctx.hasPendingIntent(), false);
});

test("PendingIntentManager: a skill-supplied custom resolver overrides the default", () => {
    const ctx = new ConversationContextManager();
    const pim = new PendingIntentManager(ctx);

    pim.setPending({
        intent: "CURRENCY",
        missingParameter: "amount",
        prompt: "How much?",
        resolver: (text) => {
            const n = Number(String(text).trim());
            return Number.isFinite(n) ? n : null;
        }
    });

    assert.equal(pim.tryResolve("not a number").resolved, false);
    assert.equal(ctx.hasPendingIntent(), true);

    const result = pim.tryResolve("500");
    assert.equal(result.resolved, true);
    assert.equal(result.parameters.amount, 500);
});

test("PendingIntentManager / helpers: yes-no + cancel word detection", () => {
    assert.equal(isAffirmative("Yes"), true);
    assert.equal(isAffirmative("haan"), true);
    assert.equal(isNegative("no thanks"), true);
    assert.equal(isNegative("nahi"), true);
    assert.equal(isCancelPhrase("cancel"), true);
    assert.equal(isCancelPhrase("cancel this please"), true);
    assert.equal(isCancelPhrase("Delhi"), false);
});

test("PendingIntentManager: isAffirmative/isNegative/isCancelPhrase are exposed on window for chat.js's Phase 6 confirmation route", () => {
    // This file's top-level `require("../renderer/js/context/PendingIntentManager.js")`
    // runs before `global.window` exists anywhere in this file (by
    // design — every other test above exercises the classes directly,
    // Node-only, with no browser mock needed), so the module's
    // `typeof window !== "undefined"` wiring block was skipped on
    // that first load and Node's require() cache means simply
    // require()-ing it again here would just return the same
    // already-skipped result. Force a fresh module evaluation (with
    // `global.window` now set) to actually exercise the wiring block
    // itself, the same way it runs for real in the browser/other test
    // files (see confirmation-integration.test.js, which sets
    // `global.window` BEFORE its own first require and therefore
    // never hits this ordering issue).
    global.window = global.window || {};
    delete require.cache[require.resolve("../renderer/js/context/PendingIntentManager.js")];
    require("../renderer/js/context/PendingIntentManager.js");

    assert.equal(typeof window.JARVISPendingIntentHelpers, "object");
    assert.equal(window.JARVISPendingIntentHelpers.isAffirmative("yes"), true);
    assert.equal(window.JARVISPendingIntentHelpers.isNegative("nahi"), true);
    assert.equal(window.JARVISPendingIntentHelpers.isCancelPhrase("cancel"), true);
});

test("defaultResolver: exported helper matches PendingIntentManager's own behavior", () => {
    assert.equal(defaultResolver("Mumbai"), "Mumbai");
    assert.equal(defaultResolver(""), null);
    assert.equal(defaultResolver("search for the best pizza place nearby"), null);
});

/* ------------------------------------------------------------
   chat.js: Delhi-only local TIME route (explicit user preference)
------------------------------------------------------------ */

test("chat.js always reports the live Delhi clock, regardless of a named city", async () => {
    global.window = global.window || {};
    window.jarvis = { ...(window.jarvis || {}), data: {} };
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    const result = await chat.processDataSourceCommand("time in Tokyo");
    assert.equal(result.handled, true);
    assert.match(result.response, /^दिल्ली में अभी \d{2}:\d{2}:\d{2} बजे हैं।$/);
});

/* ------------------------------------------------------------
   chat.js: _parseCurrencyQuery (Phase 3 — CURRENCY skill)
------------------------------------------------------------ */

test("chat.js _parseCurrencyQuery: parses ISO codes with an amount", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.deepEqual(chat._parseCurrencyQuery("100 usd to inr"), { amount: "100", from: "USD", to: "INR" });
});

test("chat.js _parseCurrencyQuery: parses ISO codes without an amount (defaults to 1)", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.deepEqual(chat._parseCurrencyQuery("usd to inr"), { amount: 1, from: "USD", to: "INR" });
});

test("chat.js _parseCurrencyQuery: parses common currency words/plurals, not just codes", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.deepEqual(chat._parseCurrencyQuery("50 dollars to rupees"), { amount: "50", from: "USD", to: "INR" });
    assert.deepEqual(chat._parseCurrencyQuery("euros to pounds"), { amount: 1, from: "EUR", to: "GBP" });
});

test("chat.js _parseCurrencyQuery: returns null when it can't find a currency pair", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.equal(chat._parseCurrencyQuery("please convert my dollars"), null);
    assert.equal(chat._parseCurrencyQuery(""), null);
});

/* ------------------------------------------------------------
   chat.js: PRODUCT_SEARCH helpers (Phase 4 — multi-parameter demo)
------------------------------------------------------------ */

test("chat.js _isProductSearchQuery: matches curated shopping categories only", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.equal(chat._isProductSearchQuery("search laptops"), true);
    assert.equal(chat._isProductSearchQuery("search for a good camera"), true);
    assert.equal(chat._isProductSearchQuery("search cat videos"), false);
    assert.equal(chat._isProductSearchQuery("weather batao"), false);
});

test("chat.js _resolveBudgetReply: parses plain numbers, commas, k, and lakh shorthand", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.equal(chat._resolveBudgetReply("80000"), 80000);
    assert.equal(chat._resolveBudgetReply("80,000"), 80000);
    assert.equal(chat._resolveBudgetReply("80k"), 80000);
    assert.equal(chat._resolveBudgetReply("1.5 lakh"), 150000);
});

test("chat.js _resolveBudgetReply: returns null for non-numeric replies", () => {
    const JARVISChat = require("../renderer/js/chat.js");
    const chat = new JARVISChat();

    assert.equal(chat._resolveBudgetReply("something expensive"), null);
    assert.equal(chat._resolveBudgetReply(""), null);
});

/* ------------------------------------------------------------
   ReferenceResolver (Phase 5 — reference resolution / topic
   continuity)
------------------------------------------------------------ */

test("ReferenceResolver: no active topic -> not resolved", () => {
    const ctx = new ConversationContextManager();
    const resolver = new ReferenceResolver(ctx);

    const result = resolver.resolve("When was it founded?");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "no-topic");
});

test("ReferenceResolver: substitutes a bare 'it' with the active topic subject", () => {
    const ctx = new ConversationContextManager();
    ctx.setTopic("NASA", { source: "wikipedia" });
    const resolver = new ReferenceResolver(ctx);

    const result = resolver.resolve("When was it founded?");
    assert.equal(result.resolved, true);
    assert.equal(result.text, "When was NASA founded?");
    assert.equal(result.matchedToken, "it");
    assert.equal(result.subject, "NASA");
});

test("ReferenceResolver: substitutes Hinglish reference words too", () => {
    const ctx = new ConversationContextManager();
    ctx.setTopic("NASA", { source: "wikipedia" });
    const resolver = new ReferenceResolver(ctx);

    const result = resolver.resolve("iske baare mein aur batao");
    assert.equal(result.resolved, true);
    assert.equal(result.text, "NASA baare mein aur batao");
});

test("ReferenceResolver: leaves a message with no reference word untouched", () => {
    const ctx = new ConversationContextManager();
    ctx.setTopic("NASA", { source: "wikipedia" });
    const resolver = new ReferenceResolver(ctx);

    // No curated reference word/phrase at all -> no-reference. (Note:
    // this deliberately avoids words like "weather"/"mausam", which
    // are their own self-contained-command guard tested separately
    // below.)
    const result = resolver.resolve("Give me the cricket score please");
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "no-reference");
});

test("ReferenceResolver: a long sentence containing 'it' is left alone (too-long guard)", () => {
    const ctx = new ConversationContextManager();
    ctx.setTopic("NASA", { source: "wikipedia" });
    const resolver = new ReferenceResolver(ctx);

    const longMessage =
        "I was thinking about it earlier today while walking to the store with my friend";
    const result = resolver.resolve(longMessage);
    assert.equal(result.resolved, false);
    assert.equal(result.reason, "too-long");
});

test("ReferenceResolver: self-contained commands are never hijacked even if they contain a reference word", () => {
    const ctx = new ConversationContextManager();
    ctx.setTopic("NASA", { source: "wikipedia" });
    const resolver = new ReferenceResolver(ctx);

    assert.equal(resolver.resolve("cancel that").reason, "self-contained");
    assert.equal(resolver.resolve("weather batao").reason, "self-contained");
    assert.equal(resolver.resolve("search laptops under this budget").reason, "self-contained");
});

test("ReferenceResolver: reads from the global JARVISConversationContext singleton by default", () => {
    global.window = global.window || {};
    window.JARVISConversationContext = new ConversationContextManager();
    window.JARVISConversationContext.setTopic("Wikipedia", { source: "test" });

    const resolver = new ReferenceResolver();
    const result = resolver.resolve("Tell me more about that");
    assert.equal(result.resolved, true);
    assert.equal(result.text, "Tell me more about Wikipedia");
});
