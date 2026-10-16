"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createPCDoctor } = require("../src/system/pcDoctor");

test("PC Doctor scans offline and never applies without approval", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pc-doctor-"));
    const doctor = createPCDoctor({ userDataPath: root, homePath: root });
    const rejected = await doctor.apply(["clear-jarvis-cache"], false);
    assert.equal(rejected.success, false);
    assert.equal(rejected.requiresApproval, true);
    const report = await doctor.scan();
    assert.equal(report.success, true);
    assert.equal(report.offline, true);
    assert.ok(Array.isArray(report.issues));
    assert.ok(Array.isArray(report.safeFixes));
});

test("PC Doctor ignores unknown fix ids even after approval", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pc-doctor-"));
    const doctor = createPCDoctor({ userDataPath: root, homePath: root });
    await doctor.scan();
    const result = await doctor.apply(["delete-entire-drive"], true);
    assert.equal(result.success, false);
    assert.equal(result.results[0].success, false);
});
