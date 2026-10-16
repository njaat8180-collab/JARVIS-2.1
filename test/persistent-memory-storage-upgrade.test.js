"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const userManager = require("../src/users/userManager");
const userMemory = require("../src/users/userMemory");

test("per-user memory survives engine reload in the configured writable database", () => {
    const dataDir = path.join(__dirname, ".persistent-memory-test-data");
    fs.rmSync(dataDir, { recursive: true, force: true });
    userMemory.evictAll();
    userManager.configureDataDirectory(dataDir);
    try {
        const { activeUserId } = userManager.initialize();
        const engine = userMemory.getEngine(activeUserId);
        assert.ok(engine);
        engine.remember("project.jarvis.progress", "Memory migration is verified", {
            source: "test", category: "project", type: "USER_PROJECT"
        });
        userMemory.evict(activeUserId);
        const reloaded = userMemory.getEngine(activeUserId);
        assert.equal(reloaded.recall("project.jarvis.progress"), "Memory migration is verified");
        assert.ok(fs.existsSync(path.join(userManager.userDir(activeUserId), "memory.json")));
    } finally {
        userMemory.evictAll();
        userManager.configureDataDirectory(path.join(__dirname, "..", "src", "database"));
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});

test("explicit memory permission is independent from automatic conversation capture", () => {
    const dataDir = path.join(__dirname, ".persistent-memory-privacy-test-data");
    fs.rmSync(dataDir, { recursive: true, force: true });
    userMemory.evictAll();
    userManager.configureDataDirectory(dataDir);
    try {
        const created = userManager.createUser({ name: "Memory Test" }, {}, {
            memoryEnabled: true,
            saveConversationMemory: false
        });
        assert.equal(userMemory.canWrite(created.userId), true);
        assert.equal(userMemory.canRecordConversation(created.userId), false);
    } finally {
        userMemory.evictAll();
        userManager.configureDataDirectory(path.join(__dirname, "..", "src", "database"));
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
});
