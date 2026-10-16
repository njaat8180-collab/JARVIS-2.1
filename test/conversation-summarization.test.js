"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ConversationContextManager } = require("../renderer/js/context/ConversationContextManager.js");
const { summarizeTurns } = require("../renderer/js/context/ConversationSummarizer.js");

test("Phase 12 summarizer preserves decisions, tasks, technical context and user context", () => {
    const summary = summarizeTurns([
        { role: "user", text: "I decided to use Electron and Node for the JARVIS desktop app." },
        { role: "assistant", text: "That architecture keeps the renderer and main process separate." },
        { role: "user", text: "I am building a memory system and still need to implement summarization." },
        { role: "user", text: "My name is Nakul." }
    ]);

    assert.ok(summary.decisions.some((item) => /electron/i.test(item)));
    assert.ok(summary.unresolvedTasks.some((item) => /summarization/i.test(item)));
    assert.ok(summary.technicalContext.some((item) => /electron|node/i.test(item)));
    assert.ok(summary.userContext.some((item) => /my name is nakul/i.test(item)));
    assert.match(summary.text, /Decisions:/);
});

test("Phase 12 summarizer filters sensitive credentials", () => {
    const summary = summarizeTurns([
        { role: "user", text: "My API key is sk_test_1234567890abcdef" },
        { role: "user", text: "My password is super-secret" }
    ]);

    assert.equal(summary.decisions.length, 0);
    assert.equal(summary.userContext.length, 0);
    assert.equal(summary.technicalContext.length, 0);
    assert.equal(summary.text, "");
});

test("ConversationContextManager compresses older turns when the rolling window fills", () => {
    const ctx = new ConversationContextManager({ maxTurns: 6 });

    for (let i = 1; i <= 7; i++) {
        ctx.pushTurn("user", i === 1
            ? "I decided to use Electron for the JARVIS project."
            : `message ${i}`);
    }

    assert.equal(ctx.getRecentTurns().length, 6, "the configured recent-turn window remains intact after compaction");
    const summary = ctx.getConversationSummary();
    assert.ok(summary);
    assert.equal(summary.summarizedTurns, 1);
    assert.ok(summary.decisions.some((item) => /electron/i.test(item)));
});

test("ConversationContextManager merges later summaries instead of growing raw history", () => {
    const ctx = new ConversationContextManager({ maxTurns: 4 });

    ctx.pushTurn("user", "I decided to use JavaScript for the app.");
    ctx.pushTurn("assistant", "Okay.");
    ctx.pushTurn("user", "I still need to finish the memory context module.");
    ctx.pushTurn("assistant", "Continue when ready.");
    ctx.pushTurn("user", "I decided to use Electron too.");

    const firstSummary = ctx.getConversationSummary();
    assert.ok(firstSummary);

    ctx.pushTurn("assistant", "Good.");
    ctx.pushTurn("user", "I still need to test IPC.");
    ctx.pushTurn("assistant", "That remains on the task list.");
    ctx.pushTurn("user", "Another message.");
    ctx.pushTurn("assistant", "Another response.");
    ctx.pushTurn("user", "One more continuity message.");

    const secondSummary = ctx.getConversationSummary();
    assert.ok(secondSummary.summarizedTurns > firstSummary.summarizedTurns);
    assert.ok(secondSummary.decisions.some((item) => /javascript/i.test(item)));
    assert.ok(secondSummary.decisions.some((item) => /electron/i.test(item)));
    assert.ok(secondSummary.unresolvedTasks.some((item) => /ipc/i.test(item)));
    assert.ok(ctx.getRecentTurns().length <= 4);
});

test("clearAll removes both recent turns and the conversation summary", () => {
    const ctx = new ConversationContextManager({ maxTurns: 2 });
    ctx.pushTurn("user", "I decided to use Electron.");
    ctx.pushTurn("assistant", "Okay.");
    ctx.pushTurn("user", "I still need to test it.");

    assert.ok(ctx.getConversationSummary());
    ctx.clearAll();
    assert.equal(ctx.getRecentTurns().length, 0);
    assert.equal(ctx.getConversationSummary(), null);
});
