"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("../src/assistant/taskExecutor");
const makeTask = () => ({ taskId: "budget-test", currentStep: 0, steps: [{ action: "run_research", status: "pending", description: "research" }, { action: "record_result", status: "pending" }] });

test("a hung research adapter cannot exhaust the task budget or trigger a retry", async () => {
    let attempts = 0;
    let signal;
    const result = await run(makeTask(), { taskTimeoutMs: 20, research: { research: (_query, options) => { attempts++; signal = options.signal; return new Promise(() => {}); } } });
    assert.equal(result.status, "failed");
    assert.equal(attempts, 1);
    assert.equal(signal.aborted, true);
    assert.equal(result.steps[1].status, "pending");
    assert.match(result.error, /may still finish/);
});

test("cancellation interrupts waiting and stops subsequent steps", async () => {
    let state = "running";
    const result = await run(makeTask(), { taskTimeoutMs: 1000, getTaskState: () => ({ status: state }), research: { research: () => { state = "cancelled"; return new Promise(() => {}); } } });
    assert.equal(result.status, "cancelled");
    assert.equal(result.steps[1].status, "pending");
});

test("oversized and invalid continuation plans fail before any action", async () => {
    for (const task of [{ ...makeTask(), steps: Array(33).fill({ action: "record_result" }) }, { ...makeTask(), currentStep: -1 }]) {
        const result = await run(task);
        assert.equal(result.status, "failed");
        assert.match(result.error, /Invalid task plan/);
    }
});
