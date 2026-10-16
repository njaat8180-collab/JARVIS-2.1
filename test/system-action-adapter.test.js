"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    SystemActionAdapter,
    APPLICATION_ALLOWLIST,
    resolveAppKey
} = require("../src/assistant/systemActionAdapter");

function makeRunner({ fail = false } = {}) {
    const calls = [];
    return {
        calls,
        async run(executable, args) {
            calls.push({ executable, args });
            if (fail) return { success: false, error: "mock runner failure" };
            return { success: true };
        }
    };
}

function makeAdapter(options = {}) {
    const runner = options.runnerObj || makeRunner(options.runner);
    const adapter = new SystemActionAdapter({
        platform: options.platform || "win32",
        runner: (exe, args) => runner.run(exe, args)
    });
    return { adapter, runner };
}

/* ---------------- application allowlist ---------------- */

test("application allowlist resolves known names and aliases deterministically", () => {
    assert.equal(resolveAppKey("chrome"), "chrome");
    assert.equal(resolveAppKey("Google Chrome"), "chrome");
    assert.equal(resolveAppKey("VS Code"), "vscode");
    assert.equal(resolveAppKey("totally-fake-app"), null);
});

test("openApplication launches an allowlisted app via a fixed executable/args pair", async () => {
    const { adapter, runner } = makeAdapter();
    const result = await adapter.openApplication("chrome");

    assert.equal(result.success, true);
    assert.equal(result.action, "openApplication");
    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].executable, APPLICATION_ALLOWLIST.chrome.win32.executable);
    assert.deepEqual(runner.calls[0].args, []);
});

test("an unavailable/unknown application returns a deterministic failure, never fabricated", async () => {
    const { adapter, runner } = makeAdapter();
    const result = await adapter.openApplication("some-app-that-does-not-exist");

    assert.equal(result.success, false);
    assert.match(result.error, /not on the allowlisted/);
    assert.equal(runner.calls.length, 0, "no process should ever be spawned for an unknown app");
});

test("openApplication never accepts or forwards a raw command string as the executable", async () => {
    const { adapter, runner } = makeAdapter();
    const result = await adapter.openApplication("chrome.exe & del C:\\Windows\\System32");
    assert.equal(result.success, false);
    assert.equal(runner.calls.length, 0);
});

/* ---------------- URL / folder / file opening ---------------- */

test("openUrl only accepts https:// URLs and delegates to a browser adapter", async () => {
    const { adapter } = makeAdapter();
    const opened = [];
    const browserAdapter = { async open(url) { opened.push(url); return { url }; } };

    const good = await adapter.openUrl("https://example.com", browserAdapter);
    assert.equal(good.success, true);
    assert.equal(opened.length, 1);

    const bad = await adapter.openUrl("javascript:alert(1)", browserAdapter);
    assert.equal(bad.success, false);
    assert.equal(opened.length, 1, "the unsafe scheme must never reach the browser adapter");
});

test("openUrl propagates browser failures instead of reporting success", async () => {
    const { adapter } = makeAdapter();
    const failed = await adapter.openUrl("https://example.com", {
        async open() { return { success: false, error: "navigation blocked" }; }
    });
    assert.equal(failed.success, false);
    assert.equal(failed.error, "navigation blocked");

    const rejected = await adapter.openUrl("https://example.com", {
        async open() { throw new Error("browser unavailable"); }
    });
    assert.equal(rejected.success, false);
    assert.equal(rejected.error, "browser unavailable");
});

/* ---------------- system information ---------------- */

test("getSystemInfo returns real, non-fabricated os-module values", () => {
    const { adapter } = makeAdapter();
    const info = adapter.getSystemInfo();

    assert.equal(info.success, true);
    assert.equal(typeof info.data.platform, "string");
    assert.equal(typeof info.data.totalMemoryBytes, "number");
    assert.ok(info.data.totalMemoryBytes > 0);
    assert.ok(info.data.cpuCount >= 1);
});

/* ---------------- destructive-action detection / approval ---------------- */

test("shutdown/restart/sleep/lock/logoff are all blocked without approved:true", async () => {
    const { adapter, runner } = makeAdapter();

    for (const action of ["shutdown", "restart", "sleep", "lock", "logoff"]) {
        const result = await adapter[action]();
        assert.equal(result.success, false, `${action} should be blocked`);
        assert.equal(result.requiresApproval, true);
    }
    assert.equal(runner.calls.length, 0, "nothing destructive should ever have actually run");
});

test("explicit approval allows a power command to run exactly once", async () => {
    const { adapter, runner } = makeAdapter();
    const result = await adapter.shutdown({ approved: true });

    assert.equal(result.success, true);
    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].executable, "shutdown");
});

test("a rejected/declined power command never runs even after being asked twice", async () => {
    const { adapter, runner } = makeAdapter();
    await adapter.shutdown({ approved: false });
    await adapter.shutdown();
    assert.equal(runner.calls.length, 0);
});

/* ---------------- terminateProcess ---------------- */

test("terminateProcess requires approval and rejects unsafe process names", async () => {
    const { adapter, runner } = makeAdapter();

    const unapproved = await adapter.terminateProcess("notepad.exe");
    assert.equal(unapproved.success, false);
    assert.equal(unapproved.requiresApproval, true);

    const unsafeName = await adapter.terminateProcess("notepad.exe; rm -rf /", { approved: true });
    assert.equal(unsafeName.success, false);
    assert.match(unsafeName.error, /plain executable name/);

    assert.equal(runner.calls.length, 0);

    const approved = await adapter.terminateProcess("notepad.exe", { approved: true });
    assert.equal(approved.success, true);
    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].executable, "taskkill");
});

/* ---------------- no generic command execution surface ---------------- */

test("SystemActionAdapter exposes no generic execute(command)/runShell()/cmd() method", () => {
    const { adapter } = makeAdapter();
    assert.equal(typeof adapter.execute, "undefined");
    assert.equal(typeof adapter.runShell, "undefined");
    assert.equal(typeof adapter.cmd, "undefined");
    assert.equal(typeof adapter.powershell, "undefined");
});

test("a runner failure is reported honestly, never claimed as success", async () => {
    const { adapter, runner } = makeAdapter({ runner: { fail: true } });
    const result = await adapter.shutdown({ approved: true });
    assert.equal(result.success, false);
    assert.match(result.error, /mock runner failure/);
});
