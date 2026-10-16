"use strict";

/*
 * Phase 13 — Full API / Skill Integration.
 *
 * Verifies that the existing NaturalCommandEngine is connected to the
 * conversation-context/pending-intent/memory pipeline without replacing
 * any underlying API implementation.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};
window.jarvis = {
    ai: {
        searchMemory: async (query, limit) => ({
            success: true,
            data: {
                records: [
                    { key: "user.project", value: "JARVIS", type: "USER_PROJECT", importance: 0.9, status: "ACTIVE" },
                    { key: "user.preference", value: "concise answers", type: "USER_PREFERENCE", importance: 0.6, status: "ACTIVE" },
                    { key: "old.fact", value: "ignored", type: "USER_FACT", importance: 0.2, status: "DELETED" }
                ].slice(0, limit)
            }
        })
    }
};

require("../renderer/js/context/ConversationContextManager.js");
require("../renderer/js/context/PendingIntentManager.js");
const JARVISChat = require("../renderer/js/chat.js");

function installNaturalEngine() {
    window.JARVISNaturalCommandEngine = {
        detect(text) {
            const normalized = String(text || "").toLowerCase();
            if (normalized.includes("book")) {
                return { intent: "BOOK_SEARCH", confidence: 0.95, entities: normalized.includes("dune") ? { query: "dune" } : {}, normalizedText: normalized };
            }
            return { intent: "NEWS", confidence: 0.94, entities: { topic: "technology" }, normalizedText: normalized };
        },
        async process(text) {
            const normalized = String(text || "").toLowerCase();
            if (normalized === "book search") {
                return {
                    handled: true,
                    source: "natural-intent",
                    response: "Which books or author should I search for?",
                    intent: "BOOK_SEARCH",
                    confidence: 0.95,
                    entities: {},
                    clarification: true
                };
            }
            if (normalized.includes("book")) {
                return {
                    handled: true,
                    source: "natural-intent",
                    response: `Executed existing BOOK_SEARCH skill for: ${text}`,
                    intent: "BOOK_SEARCH",
                    confidence: 0.95,
                    entities: { query: "dune" }
                };
            }
            return {
                handled: true,
                source: "natural-intent",
                response: `Executed existing NEWS skill for: ${text}`,
                intent: "NEWS",
                confidence: 0.94,
                entities: { topic: "technology" }
            };
        }
    };
}

function freshChat() {
    window.JARVISConversationContext.clearAll();
    window.JARVISPendingIntent.clear();
    installNaturalEngine();
    return new JARVISChat();
}

test("Phase 13: resolved natural skill records active intent and bounded relevant memory", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("latest technology news");

    assert.equal(result.handled, true);
    assert.equal(result.intent, "NEWS");
    assert.equal(window.JARVISConversationContext.getActiveIntent().intent, "NEWS");
    assert.equal(result.memoryContext.length, 2, "only ACTIVE memory records should be exposed");
    assert.equal(result.memoryContext[0].key, "user.project");
});

test("Phase 13: natural skill clarification registers a pending intent", async () => {
    const chat = freshChat();
    const result = await chat.processBrainRouter("book search");

    assert.equal(result.handled, true);
    assert.equal(result.intent, "BOOK_SEARCH");
    assert.equal(result.clarification, true);

    const pending = window.JARVISConversationContext.getPendingIntent();
    assert.equal(pending.intent, "BOOK_SEARCH");
    assert.equal(pending.missingParameter, "query");
    assert.equal(pending.originalRequest, "book search");
});

test("Phase 13: pending natural skill re-enters the same API/skill engine", async () => {
    const chat = freshChat();
    await chat.processBrainRouter("book search");

    const result = await chat.processBrainRouter("Dune");

    assert.equal(result.handled, true);
    assert.equal(result.intent, "BOOK_SEARCH");
    assert.match(result.response, /book_search skill.*book search dune/i);
    assert.equal(window.JARVISPendingIntent.hasPending(), false);
});

test("Phase 13: integration is kill-switch safe", async () => {
    const chat = freshChat();
    chat.config.apiIntegrationFirst = false;

    const result = await chat.processBrainRouter("latest technology news");

    assert.equal(result.handled, true);
    assert.equal(result.intent, "NEWS");
    assert.equal(result.memoryContext, undefined);
    assert.equal(window.JARVISConversationContext.getActiveIntent(), null);
});
