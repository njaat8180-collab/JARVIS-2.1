"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeJsonAtomic } = require("../src/utils/atomicJson");

test("atomic JSON persistence falls back safely when Windows rename replacement is denied", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-atomic-json-"));
    const file = path.join(root, "state.json");
    fs.writeFileSync(file, JSON.stringify({ version: 1 }), "utf8");

    const originalRename = fs.renameSync;
    fs.renameSync = () => {
        const error = new Error("simulated Windows replacement lock");
        error.code = "EPERM";
        throw error;
    };
    try {
        const result = writeJsonAtomic(file, { version: 2, ready: true });
        assert.equal(result.fallback, true);
    } finally {
        fs.renameSync = originalRename;
    }

    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { version: 2, ready: true });
    assert.deepEqual(fs.readdirSync(root).filter(name => name.includes(".tmp-")), []);
    fs.rmSync(root, { recursive: true, force: true });
});

