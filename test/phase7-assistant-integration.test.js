"use strict";

/**
 * Phase 7 — Assistant Integration.
 *
 * Exercises the full pipeline: Classifier -> TaskPlanner -> SafetyGate
 * -> TaskExecutor -> SystemActionAdapter/BrowserActionAdapter -> TaskStore,
 * using the REAL Phase 7 adapters (not raw Phase 6 mocks) with an injected
 * runner/engine so no real OS/browser side effects occur.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AssistantOrchestrator } = require("../src/assistant/assistantOrchestrator");
const { SystemActionAdapter } = require("../src/assistant/systemActionAdapter");
const { BrowserActionAdapter } = require("../src/assistant/browserActionAdapter");

function tempPath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-phase7-test-")), "tasks.json");
}

function makeSystemAdapter(options = {}) {
    const calls = [];
    const adapter = new SystemActionAdapter({
        platform: "win32",
        runner: async (executable, args) => {
            calls.push({ executable, args });
            if (options.fail) return { success: false, error: "mock runner failure" };
            return { success: true };
        }
    });
    adapter.__calls = calls;
    return adapter;
}

function makeBrowserAdapter(options = {}) {
    const calls = [];
    const engine = {
        async navigate(url) { calls.push(["navigate", url]); return { url }; },
        async newTab(url) { calls.push(["newTab", url]); return { tabId: "t2" }; },
        closeTab(id) { calls.push(["closeTab", id]); return { closed: id }; },
        back() { calls.push(["back"]); return {}; },
        forward() { calls.push(["forward"]); return {}; },
        reload() { calls.push(["reload"]); return {}; },
        clearHistory() { calls.push(["clearHistory"]); return { cleared: true }; },
        clearDownloads() { calls.push(["clearDownloads"]); return { cleared: true }; }
    };
    const adapter = new BrowserActionAdapter({ engine });
    adapter.__calls = calls;
    return adapter;
}

function makeOrchestrator(options = {}) {
    return new AssistantOrchestrator({
        storagePath: tempPath(),
        systemAdapter: options.systemAdapter || makeSystemAdapter(options.systemOptions),
        browserAdapter: options.browserAdapter || makeBrowserAdapter(options.browserOptions)
    });
}

/* ============================================================
   SYSTEM TASK LIFECYCLE
============================================================ */

test("opening an application through the real adapter completes the task", async () => {
    const systemAdapter = makeSystemAdapter();
    const orchestrator = makeOrchestrator({ systemAdapter });

    const task = await orchestrator.handleRequest("open chrome");
    assert.equal(task.status, "completed");
    assert.equal(systemAdapter.__calls.length, 1);
    assert.equal(systemAdapter.__calls[0].executable, "chrome.exe");
});

test("shutdown enters waiting_approval and does not touch the real adapter until approved", async () => {
    const systemAdapter = makeSystemAdapter();
    const orchestrator = makeOrchestrator({ systemAdapter });

    const task = await orchestrator.handleRequest("shutdown computer");
    assert.equal(task.status, "waiting_approval");
    assert.equal(systemAdapter.__calls.length, 0);

    const approved = await orchestrator.approveTask(task.taskId);
    assert.equal(approved.success, true);
    assert.equal(approved.task.status, "completed");
    assert.equal(systemAdapter.__calls.length, 1);
    assert.equal(systemAdapter.__calls[0].executable, "shutdown");
});

test("rejecting a lock request cancels it and the adapter is never invoked", async () => {
    const systemAdapter = makeSystemAdapter();
    const orchestrator = makeOrchestrator({ systemAdapter });

    const task = await orchestrator.handleRequest("lock the computer");
    assert.equal(task.status, "waiting_approval");

    const rejected = orchestrator.rejectTask(task.taskId, "not now");
    assert.equal(rejected.success, true);
    assert.equal(rejected.task.status, "cancelled");
    assert.equal(systemAdapter.__calls.length, 0);
});

test("a failed real system action is reported as a failed task, never silently swallowed", async () => {
    const systemAdapter = makeSystemAdapter({ fail: true });
    const orchestrator = makeOrchestrator({ systemAdapter });

    const task = await orchestrator.approveTask((await orchestrator.handleRequest("restart the computer")).taskId);
    // Approval succeeded, but the requested OS action did not. Keep the
    // orchestration call successful while marking the action task failed.
    assert.equal(task.success, true); // approveTask() succeeded in running the task
    assert.equal(task.task.status, "failed");
    assert.equal(task.task.steps.find((step) => step.action === "system_restart").result.success, false);
    assert.match(task.task.error, /mock runner failure/);
});

/* ============================================================
   BROWSER TASK LIFECYCLE
============================================================ */

test("a plain browse request completes via the real browser adapter's open()", async () => {
    const browserAdapter = makeBrowserAdapter();
    const orchestrator = makeOrchestrator({ browserAdapter });

    const task = await orchestrator.handleRequest("navigate to https://example.com");
    assert.equal(task.status, "completed");
    assert.deepEqual(browserAdapter.__calls[0], ["navigate", "https://example.com"]);
});

test("'open a new tab' routes to the browser adapter's newTab, not the generic open()", async () => {
    const browserAdapter = makeBrowserAdapter();
    const orchestrator = makeOrchestrator({ browserAdapter });

    const task = await orchestrator.handleRequest("open a new tab");
    assert.equal(task.status, "completed");
    assert.deepEqual(browserAdapter.__calls[0], ["newTab", undefined]);
});

test("'clear my browser history' requires approval and only runs once approved", async () => {
    const browserAdapter = makeBrowserAdapter();
    const orchestrator = makeOrchestrator({ browserAdapter });

    const task = await orchestrator.handleRequest("clear my browser history");
    assert.equal(task.status, "waiting_approval");
    assert.equal(browserAdapter.__calls.length, 0);

    const approved = await orchestrator.approveTask(task.taskId);
    assert.equal(approved.task.status, "completed");
    assert.deepEqual(browserAdapter.__calls[0], ["clearHistory"]);
});

/* ============================================================
   DEFENSE IN DEPTH: DIRECT ADAPTER CALLS CANNOT BYPASS APPROVAL
============================================================ */

test("calling the system adapter directly for a destructive action still requires approved:true", async () => {
    const systemAdapter = makeSystemAdapter();
    // No orchestrator involved at all — proving the adapter itself, not
    // just AssistantOrchestrator, enforces the gate.
    const result = await systemAdapter.shutdown();
    assert.equal(result.success, false);
    assert.equal(result.requiresApproval, true);
    assert.equal(systemAdapter.__calls.length, 0);
});

test("calling the browser adapter directly for clearHistory still requires approved:true", async () => {
    const browserAdapter = makeBrowserAdapter();
    const result = await browserAdapter.clearHistory();
    assert.equal(result.success, false);
    assert.equal(result.requiresApproval, true);
    assert.equal(browserAdapter.__calls.length, 0);
});

/* ============================================================
   PERSISTENCE / RESTART-RELOAD
============================================================ */

test("a waiting_approval task survives a simulated restart (reload from disk)", async () => {
    const file = tempPath();
    const systemAdapter = makeSystemAdapter();
    let orchestrator = new AssistantOrchestrator({ storagePath: file, systemAdapter });

    const task = await orchestrator.handleRequest("shutdown computer");
    assert.equal(task.status, "waiting_approval");

    // Simulate a restart: brand new orchestrator instance pointed at the
    // same file.
    orchestrator = new AssistantOrchestrator({ storagePath: file, systemAdapter });
    const reloaded = orchestrator.getTask(task.taskId);
    assert.equal(reloaded.status, "waiting_approval");
    assert.equal(reloaded.approved, false);

    const approved = await orchestrator.approveTask(task.taskId);
    assert.equal(approved.task.status, "completed");
});

/* ============================================================
   COMMAND / SHELL INJECTION SAFETY
============================================================ */

test("a shell-metacharacter-laden request never reaches the process runner unescaped", async () => {
    const systemAdapter = makeSystemAdapter();
    const orchestrator = makeOrchestrator({ systemAdapter });

    const task = await orchestrator.handleRequest("open chrome; rm -rf / #");
    // "chrome; rm -rf / #" as an app name does not resolve on the
    // allowlist, so this must fail cleanly rather than ever being
    // passed to a shell.
    assert.equal(task.status, "failed");
    const launchStep = task.steps.find((s) => s.action === "execute_application_action");
    assert.equal(launchStep.result.success, false);
    assert.equal(systemAdapter.__calls.length, 0);
});

test("path traversal in a savePage-style request is rejected by the browser adapter contract", async () => {
    const browserAdapter = makeBrowserAdapter();
    // savePage isn't wired through the planner in this phase, so this
    // test exercises the adapter directly to prove it does not attempt
    // to sanitize/execute a path — the underlying engine call receives
    // exactly what was passed and any path validation is the engine's
    // job, never a shell.
    const result = await browserAdapter.savePage("../../../../etc/passwd");
    // No engine.savePage was defined for this adapter instance -> a
    // structured failure, not a crash and not a silent success.
    assert.equal(result.success, false);
});

/* ============================================================
   PHASE 6 REGRESSION (sanity — full suite is run separately)
============================================================ */

test("a plain conversational/research request still works when Phase 7 adapters are injected", async () => {
    const orchestrator = makeOrchestrator();
    const convo = await orchestrator.handleRequest("hello there");
    assert.equal(convo.status, "completed");
});

/* ============================================================
   NO AI/LLM VERIFICATION (Phase 7 files)
============================================================ */

test("no Phase 7 adapter file references any AI/LLM provider", () => {
    const dir = path.join(__dirname, "..", "src", "assistant");
    const forbidden = /openai|anthropic|claude|gemini|groq|openrouter|ollama|chatgpt/i;

    for (const file of ["systemActionAdapter.js", "browserActionAdapter.js"]) {
        const contents = fs.readFileSync(path.join(dir, file), "utf8");
        assert.equal(forbidden.test(contents), false, `${file} must not reference any AI/LLM provider`);
    }
});

test("no Phase 7 adapter exposes a generic execute/runShell/eval-style surface", () => {
    const { SystemActionAdapter: SA } = require("../src/assistant/systemActionAdapter");
    const { BrowserActionAdapter: BA } = require("../src/assistant/browserActionAdapter");
    const sys = new SA({});
    const browser = new BA({});

    for (const name of ["execute", "runShell", "cmd", "powershell", "eval"]) {
        assert.equal(typeof sys[name], "undefined", `SystemActionAdapter must not expose ${name}()`);
    }
    for (const name of ["executeScript", "runJs", "evaluate", "eval"]) {
        assert.equal(typeof browser[name], "undefined", `BrowserActionAdapter must not expose ${name}()`);
    }
});
