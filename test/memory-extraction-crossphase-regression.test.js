"use strict";

/*
 * Regression test for a real cross-phase bug found while debugging a
 * user report that "memory isn't working."
 *
 * ROOT CAUSE: renderer/js/chat.js's fallback turn-recording call
 * (`window.jarvis.ai.recordTurn(...)`, which is what triggers
 * MemoryEngine.extractFromMessage() on the main-process side) is
 * skipped whenever a response came from ROUTE 7
 * (processConsciousness / consciousness:respond) — that route sets
 * `consciousnessRecorded: true` specifically to avoid double-pushing
 * the turn into working memory. But main.js's `consciousness:respond`
 * IPC handler itself never called `memory.extractFromMessage()`
 * either. Net effect: ANY plain, bare statement that doesn't match a
 * more specific route (e.g. "My name is Nakul." with no "remember
 * that" prefix — exactly the brief's Test 4 wording) fell all the way
 * through to ROUTE 7 and its fact was silently NEVER saved. This
 * wasn't caught by any of the 19 phase-specific tests because each
 * one mocks `window.jarvis.ai.consciousnessRespond`/`recordTurn`
 * directly rather than exercising the real main.js handler's
 * behavior end-to-end.
 *
 * FIX: main.js's `consciousness:respond` handler now also calls
 * `memory.extractFromMessage()` itself, so extraction happens at the
 * source regardless of which route ends up answering the message.
 *
 * This test (a) proves the source fix is present, and (b) runs a
 * real end-to-end simulation — real MemoryEngine, real
 * ConsciousnessLayer, real chat.js router, a simulated app "restart"
 * — of the brief's Test 4 and Test 5 scenarios.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

test("regression: main.js's consciousness:respond handler extracts memory facts (source-level fix)", () => {
    const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
    const handlerStart = mainSource.indexOf('registerHandler("consciousness:respond"');
    assert.notEqual(handlerStart, -1, "consciousness:respond handler not found");

    // Look only within this handler's body (up to the next
    // registerHandler call) so this assertion can't accidentally pass
    // because some OTHER handler happens to call extractFromMessage.
    const nextHandlerStart = mainSource.indexOf("registerHandler(", handlerStart + 1);
    const handlerBody = mainSource.slice(handlerStart, nextHandlerStart === -1 ? undefined : nextHandlerStart);

    assert.match(
        handlerBody,
        /memory\.extractFromMessage\(/,
        "consciousness:respond must call memory.extractFromMessage() itself, since renderer/js/chat.js deliberately skips its own fallback recordTurn() call for responses from this route (response.consciousnessRecorded === true)"
    );
});

test("regression: full end-to-end — 'My name is Nakul.' (no 'remember that' prefix) is saved and survives a simulated restart", async () => {
    global.window = global.window || {};

    const { MemoryEngine } = require(path.join(root, "src/ai/memory.js"));
    const { ConsciousnessLayer } = require(path.join(root, "src/ai/consciousness.js"));

    const memoryFile = path.join(
        require("os").tmpdir(),
        `jarvis-regression-memory-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    const consciousnessFile = path.join(
        require("os").tmpdir(),
        `jarvis-regression-consciousness-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );

    // Mirrors the FIXED main.js consciousness:respond handler exactly
    // (including the extractFromMessage() call) — not a shortcut mock.
    function makeBridge(memory, layer) {
        return {
            consciousnessRespond: async (text) => {
                const facts = Object.values(memory.allFacts ? memory.allFacts() : {})
                    .slice(0, 8)
                    .map((f) => ({ key: f.key, value: f.value }));
                const response = layer.respond(text, { memoryFacts: facts });
                if (!response) return { success: false };

                memory.extractFromMessage(text, { source: "conversation" });
                memory.pushTurn("user", text);
                memory.pushTurn("assistant", response);

                return { success: true, response, consciousness: layer.getPublicState() };
            },
            recordTurn: async () => ({ success: true }),
            getMemoryFacts: async () => ({ success: true, facts: memory.allFacts() })
        };
    }

    function freshChat() {
        delete require.cache[require.resolve(path.join(root, "renderer/js/chat.js"))];
        return require(path.join(root, "renderer/js/chat.js"));
    }

    try {
        // --- Session 1 ---
        let memory = new MemoryEngine({ storagePath: memoryFile });
        let layer = new ConsciousnessLayer({ storagePath: consciousnessFile });
        window.jarvis = { ai: makeBridge(memory, layer) };

        const JARVISChat1 = freshChat();
        const chat1 = new JARVISChat1();

        const turn1 = await chat1.sendMessage("My name is Nakul.");
        assert.equal(turn1.source, "consciousness", "this message must fall through to ROUTE 7, exactly reproducing the bug's trigger condition");

        const factsBeforeRestart = memory.allFacts();
        assert.equal(factsBeforeRestart["user.name"]?.value, "Nakul", "the fact must be saved immediately, not just after a later message");

        // --- Simulated restart: brand-new MemoryEngine/ConsciousnessLayer instances, same files ---
        memory = new MemoryEngine({ storagePath: memoryFile });
        layer = new ConsciousnessLayer({ storagePath: consciousnessFile });
        window.jarvis = { ai: makeBridge(memory, layer) };

        const JARVISChat2 = freshChat();
        const chat2 = new JARVISChat2();

        const turn2 = await chat2.sendMessage("What is my name?");
        assert.equal(turn2.source, "memory");
        assert.match(turn2.response, /Nakul/);
    } finally {
        for (const f of [memoryFile, consciousnessFile]) {
            try {
                fs.unlinkSync(f);
            } catch {
                /* already gone / never created — fine */
            }
        }
    }
});

test("regression: Test 5 from the brief — a preference stated as 'Remember that...' also survives a simulated restart", async () => {
    global.window = global.window || {};

    const { MemoryEngine } = require(path.join(root, "src/ai/memory.js"));

    const memoryFile = path.join(
        require("os").tmpdir(),
        `jarvis-regression-pref-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );

    function freshChat() {
        delete require.cache[require.resolve(path.join(root, "renderer/js/chat.js"))];
        return require(path.join(root, "renderer/js/chat.js"));
    }

    try {
        let memory = new MemoryEngine({ storagePath: memoryFile });

        // "Remember that ..." goes through the EXPLICIT memory-save
        // path (getMemorySaveMatch -> saveMemoryFact -> ai.rememberMemoryMessage),
        // a different code path from the bug above — included here so
        // this file covers both of the brief's persistence tests (4
        // and 5) together, end to end.
        window.jarvis = {
            ai: {
                rememberMemoryMessage: async (fact) => {
                    const stored = memory.remember(`preference.${Date.now()}`, fact, {
                        source: "explicit-remember",
                        type: "USER_PREFERENCE"
                    });
                    return { success: !!stored, record: stored };
                },
                searchMemory: async (query, limit) => ({ success: true, records: memory.search(query, { limit }) }),
                getMemoryFacts: async () => ({ success: true, facts: memory.allFacts() })
            }
        };

        const JARVISChat1 = freshChat();
        const chat1 = new JARVISChat1();

        const turn1 = await chat1.sendMessage("Remember that I prefer dark UI.");
        assert.equal(turn1.handled, true);

        // --- Simulated restart ---
        memory = new MemoryEngine({ storagePath: memoryFile });
        const records = memory.search("dark UI");
        assert.ok(
            records.some((r) => /dark UI/i.test(r.value)),
            "the preference must still be findable after a simulated restart"
        );
    } finally {
        try {
            fs.unlinkSync(memoryFile);
        } catch {
            /* fine */
        }
    }
});
