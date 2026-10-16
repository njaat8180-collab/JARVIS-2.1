"use strict";

/**
 * Phase 3 — Persistent Checkpoint System.
 *
 * Uses a fresh temp file per test (via checkpoint.init(tempPath))
 * so tests never touch the real src/database/evolution/checkpoint.json
 * and can't interfere with each other through module singleton state.
 * The Final Goal Registry is also temp-initialized where goal
 * validation is exercised, so these tests don't depend on Phase 2's
 * test file having run first.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const checkpoint = require("../src/evolution/checkpoint");
const goalRegistry = require("../src/evolution/goalRegistry");

function tempPath(name) {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-checkpoint-test-")), name);
}

function tempCheckpointPath() {
    return tempPath("checkpoint.json");
}

function tempGoalRegistryPath() {
    return tempPath("goalRegistry.json");
}

test("first initialization creates a valid checkpoint", () => {
    const file = tempCheckpointPath();
    const result = checkpoint.init(file);

    assert.equal(result.success, true);
    assert.equal(result.created, true);
    assert.ok(fs.existsSync(file), "checkpoint file should be written to disk");

    const cp = checkpoint.getCheckpoint();
    assert.equal(cp.version, 1);
    assert.equal(cp.currentGoal, null);
    assert.equal(cp.currentPhase, "NOT_STARTED");
    assert.equal(cp.progress, 0);
    assert.equal(typeof cp.nextAction, "string");
    assert.equal(cp.status, "IDLE");
    assert.equal(typeof cp.checkpointId, "string");
    assert.equal(typeof cp.createdAt, "string");
    assert.equal(typeof cp.updatedAt, "string");
});

test("checkpoint updates persist to disk exactly", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);

    const result = checkpoint.updateCheckpoint({
        currentPhase: "RESEARCHING",
        progress: 44,
        nextAction: "Compare recovery approaches",
        status: "ACTIVE"
    });

    assert.equal(result.success, true);
    assert.equal(result.checkpoint.currentPhase, "RESEARCHING");
    assert.equal(result.checkpoint.progress, 44);
    assert.equal(result.checkpoint.status, "ACTIVE");

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(onDisk.currentPhase, "RESEARCHING");
    assert.equal(onDisk.progress, 44);
    assert.equal(onDisk.nextAction, "Compare recovery approaches");
    assert.equal(onDisk.status, "ACTIVE");
});

test("reloading restores the exact previous state (restart-equivalent)", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);

    checkpoint.updateCheckpoint({
        currentPhase: "ANALYZING",
        progress: 61,
        nextAction: "Evaluate compatibility",
        status: "PAUSED"
    });
    const before = checkpoint.getCheckpoint();

    // Simulate a JARVIS restart: re-init from the same file.
    const reload = checkpoint.init(file);
    assert.equal(reload.created, false, "an existing valid checkpoint must not be treated as freshly created");

    const after = checkpoint.getCheckpoint();
    assert.deepEqual(after, before);
});

test("existing checkpoint is never unnecessarily reset across repeated restarts", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);
    checkpoint.updateCheckpoint({ currentPhase: "PLANNING", progress: 77, status: "ACTIVE" });

    for (let i = 0; i < 5; i++) {
        checkpoint.init(file);
    }

    const cp = checkpoint.getCheckpoint();
    assert.equal(cp.currentPhase, "PLANNING");
    assert.equal(cp.progress, 77);
    assert.equal(cp.status, "ACTIVE");
});

test("progress is validated: out-of-range and non-numeric values are rejected", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);

    const tooHigh = checkpoint.updateCheckpoint({ progress: 101 });
    assert.equal(tooHigh.success, false);

    const negative = checkpoint.updateCheckpoint({ progress: -1 });
    assert.equal(negative.success, false);

    const notANumber = checkpoint.updateCheckpoint({ progress: "44%" });
    assert.equal(notANumber.success, false);

    // Nothing should have changed on disk.
    const cp = checkpoint.getCheckpoint();
    assert.equal(cp.progress, 0);

    const validEdgeLow = checkpoint.updateCheckpoint({ progress: 0 });
    assert.equal(validEdgeLow.success, true);
    const validEdgeHigh = checkpoint.updateCheckpoint({ progress: 100 });
    assert.equal(validEdgeHigh.success, true);
});

test("engine status is validated against the known ENGINE_STATUSES enum", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);

    const bad = checkpoint.updateCheckpoint({ status: "RUNNING_FOREVER" });
    assert.equal(bad.success, false);

    for (const validStatus of checkpoint.ENGINE_STATUSES) {
        const result = checkpoint.updateCheckpoint({ status: validStatus });
        assert.equal(result.success, true);
        assert.equal(result.checkpoint.status, validStatus);
    }
});

test("currentPhase is validated against goalRegistry.STATUSES (reused, not duplicated)", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);

    const bad = checkpoint.updateCheckpoint({ currentPhase: "DAYDREAMING" });
    assert.equal(bad.success, false);

    const good = checkpoint.updateCheckpoint({ currentPhase: "TESTING" });
    assert.equal(good.success, true);
    assert.ok(goalRegistry.STATUSES.includes(good.checkpoint.currentPhase));
});

test("currentGoal is validated against the 39-goal registry when it is initialized", () => {
    const checkpointFile = tempCheckpointPath();
    const registryFile = tempGoalRegistryPath();

    goalRegistry.init(registryFile);
    checkpoint.init(checkpointFile);

    const realGoal = goalRegistry.getAll()[3];

    const badGoal = checkpoint.updateCheckpoint({ currentGoal: "goal-99-does-not-exist" });
    assert.equal(badGoal.success, false);

    const goodGoal = checkpoint.updateCheckpoint({ currentGoal: realGoal.goalId });
    assert.equal(goodGoal.success, true);
    assert.equal(goodGoal.checkpoint.currentGoal, realGoal.goalId);

    // Explicitly clearing the current goal (null) must remain valid.
    const cleared = checkpoint.updateCheckpoint({ currentGoal: null });
    assert.equal(cleared.success, true);
    assert.equal(cleared.checkpoint.currentGoal, null);
});

test("goal transition: moving from one goal to another updates cleanly and persists", () => {
    const checkpointFile = tempCheckpointPath();
    const registryFile = tempGoalRegistryPath();

    goalRegistry.init(registryFile);
    checkpoint.init(checkpointFile);

    const goals = goalRegistry.getAll();
    checkpoint.updateCheckpoint({ currentGoal: goals[0].goalId, currentPhase: "RESEARCHING", progress: 20 });
    const afterFirst = checkpoint.getCheckpoint();
    assert.equal(afterFirst.currentGoal, goals[0].goalId);

    // Transition to a new goal — phase/progress reset by the caller
    // (the module itself doesn't assume what a transition should
    // reset; it just validates and stores what it's given).
    checkpoint.updateCheckpoint({ currentGoal: goals[1].goalId, currentPhase: "OBSERVING", progress: 0 });
    const afterSecond = checkpoint.getCheckpoint();

    assert.equal(afterSecond.currentGoal, goals[1].goalId);
    assert.equal(afterSecond.currentPhase, "OBSERVING");
    assert.equal(afterSecond.progress, 0);
    assert.notEqual(afterSecond.checkpointId, afterFirst.checkpointId, "each successful update stamps a new checkpointId");

    // Reload to confirm it actually persisted, not just held in memory.
    checkpoint.init(checkpointFile);
    assert.deepEqual(checkpoint.getCheckpoint(), afterSecond);
});

test("an invalid update is rejected atomically: partial fields are not applied", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);
    checkpoint.updateCheckpoint({ progress: 10, currentPhase: "RESEARCHING" });

    const before = checkpoint.getCheckpoint();
    const result = checkpoint.updateCheckpoint({ progress: 15, status: "NOT_A_REAL_STATUS" });

    assert.equal(result.success, false);
    const after = checkpoint.getCheckpoint();
    assert.deepEqual(after, before, "a failed validation must not partially apply other fields in the same call");
});

test("missing checkpoint file is safely created", () => {
    const file = tempCheckpointPath();
    assert.equal(fs.existsSync(file), false);

    const result = checkpoint.init(file);
    assert.equal(result.created, true);
    assert.equal(checkpoint.getCheckpoint().status, "IDLE");
});

test("corrupt checkpoint file is backed up, not destroyed, and safely re-seeded", () => {
    const file = tempCheckpointPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not valid json at all ]]]", "utf8");

    const result = checkpoint.init(file);

    assert.equal(result.success, true);
    assert.equal(result.recovered, true);
    assert.ok(result.corruptBackup, "a backup path should be reported");
    assert.ok(fs.existsSync(result.corruptBackup), "the corrupt file must be preserved on disk, not deleted");

    const backupContents = fs.readFileSync(result.corruptBackup, "utf8");
    assert.equal(backupContents, "{ not valid json at all ]]]");

    const cp = checkpoint.getCheckpoint();
    assert.equal(cp.status, "IDLE");
    assert.equal(cp.progress, 0);
});

test("checkpoint file with an unexpected shape is treated as corrupt, not crashed on", () => {
    const file = tempCheckpointPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ hello: "world" }), "utf8");

    const result = checkpoint.init(file);
    assert.equal(result.recovered, true);
    assert.equal(checkpoint.getCheckpoint().version, 1);
});

test("saving is atomic: no stray temp file is left behind after a successful update", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);
    checkpoint.updateCheckpoint({ progress: 33 });

    const dirEntries = fs.readdirSync(path.dirname(file));
    const tempLeftovers = dirEntries.filter((entry) => entry.includes(".tmp-"));
    assert.equal(tempLeftovers.length, 0, "no .tmp- file should remain after a successful persist");
    assert.ok(dirEntries.includes(path.basename(file)));
});

test("resetCheckpoint is an explicit action, distinct from init(), and is never called implicitly by reload", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);
    checkpoint.updateCheckpoint({ progress: 90, currentPhase: "TESTING", status: "ACTIVE" });

    // A plain reload must NOT reset anything (already covered above),
    // only an explicit resetCheckpoint() call may.
    checkpoint.init(file);
    assert.equal(checkpoint.getCheckpoint().progress, 90);

    const reset = checkpoint.resetCheckpoint();
    assert.equal(reset.success, true);
    assert.equal(reset.checkpoint.progress, 0);
    assert.equal(reset.checkpoint.status, "IDLE");
    assert.equal(reset.checkpoint.currentGoal, null);

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(onDisk.progress, 0);
});

test("checkpoint remains compatible with the Phase 2 registry: real goal IDs from a 39-goal registry round-trip correctly", () => {
    const checkpointFile = tempCheckpointPath();
    const registryFile = tempGoalRegistryPath();

    const registryResult = goalRegistry.init(registryFile);
    assert.equal(registryResult.goals, 39);

    checkpoint.init(checkpointFile);

    for (const goal of goalRegistry.getAll().slice(0, 5)) {
        const result = checkpoint.updateCheckpoint({ currentGoal: goal.goalId });
        assert.equal(result.success, true, `goalId ${goal.goalId} from the real registry should be accepted`);
    }
});

test("checkpoint persisted file is plain, human-readable JSON (no electron-store, no database)", () => {
    const file = tempCheckpointPath();
    checkpoint.init(file);
    checkpoint.updateCheckpoint({ progress: 5 });

    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed.version, "number");
    assert.equal(typeof parsed.checkpointId, "string");

    const dirEntries = fs.readdirSync(path.dirname(file));
    assert.ok(!dirEntries.some((entry) => entry.includes("electron-store")));
});
