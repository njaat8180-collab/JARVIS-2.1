"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { WindowsVolumeController, POWERSHELL_SCRIPT } = require("../src/system/windowsVolume");

test("volume accepts only whole-number percentages in range and makes no process call otherwise", async () => {
    let calls = 0;
    const controller = new WindowsVolumeController({
        platform: "win32",
        execFile() { calls += 1; }
    });
    for (const value of [-1, 101, 25.5, "25; whoami", NaN]) {
        const result = await controller.setVolume(value);
        assert.equal(result.success, false);
    }
    assert.equal(calls, 0);
});

test("volume uses a fixed PowerShell program and a separate bounded argument, then verifies the returned level", async () => {
    let invocation;
    const controller = new WindowsVolumeController({
        platform: "win32",
        execFile(executable, args, options, callback) {
            invocation = { executable, args, options };
            callback(null, "50\r\n");
        }
    });
    const result = await controller.setVolume(50);
    assert.equal(result.success, true);
    assert.equal(result.volume, 50);
    assert.equal(invocation.executable, "powershell.exe");
    assert.equal(invocation.args.at(-1), "50");
    assert.equal(invocation.args.at(-2), POWERSHELL_SCRIPT);
    assert.equal(invocation.options.windowsHide, true);
    assert.equal(invocation.options.timeout, 8000);
});

test("volume reports endpoint errors and mismatched verification as failures", async () => {
    const failing = new WindowsVolumeController({
        platform: "win32",
        execFile(_exe, _args, _options, callback) { callback(new Error("endpoint unavailable"), ""); }
    });
    assert.match((await failing.setVolume(20)).error, /endpoint unavailable/);

    const mismatch = new WindowsVolumeController({
        platform: "win32",
        execFile(_exe, _args, _options, callback) { callback(null, "18"); }
    });
    const result = await mismatch.setVolume(20);
    assert.equal(result.success, false);
    assert.match(result.error, /Requested 20%/);
});

test("volume returns an honest unsupported-platform failure", async () => {
    const controller = new WindowsVolumeController({ platform: "linux" });
    const result = await controller.setVolume(50);
    assert.equal(result.success, false);
    assert.match(result.error, /only on Windows/);
});
