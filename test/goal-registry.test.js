"use strict";

/**
 * Phase 2 — Final Goal Registry.
 *
 * Uses a fresh temp file per test (via goalRegistry.init(tempPath))
 * so tests never touch the real src/database/evolution/goalRegistry.json,
 * and can't interfere with each other through the module's singleton
 * in-memory state.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const goalRegistry = require("../src/evolution/goalRegistry");

function tempPath(name = "goalRegistry.json") {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-goal-registry-test-")), name);
}

test("first initialization creates exactly 39 goals", () => {
    const file = tempPath();
    const result = goalRegistry.init(file);

    assert.equal(result.success, true);
    assert.equal(result.seeded, true);
    assert.equal(result.goals, 39);
    assert.equal(goalRegistry.getAll().length, 39);
    assert.ok(fs.existsSync(file), "registry file should be written to disk");

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(onDisk.goals.length, 39);
});

test("reloading an existing valid registry does not create duplicates", () => {
    const file = tempPath();
    goalRegistry.init(file);

    const secondLoad = goalRegistry.init(file);
    assert.equal(secondLoad.seeded, false);
    assert.equal(secondLoad.goals, 39);
    assert.equal(goalRegistry.getAll().length, 39);

    const featureIds = goalRegistry.getAll().map((g) => g.featureId);
    const uniqueFeatureIds = new Set(featureIds);
    assert.equal(uniqueFeatureIds.size, 39, "no featureId should be duplicated");

    const thirdLoad = goalRegistry.init(file);
    assert.equal(thirdLoad.goals, 39);
});

test("goal updates persist across reload", () => {
    const file = tempPath();
    goalRegistry.init(file);

    const target = goalRegistry.getAll()[0];
    const update = goalRegistry.updateGoal(target.goalId, {
        status: "RESEARCHING",
        completionPercentage: 12,
        nextAction: "Compare recovery approaches"
    });

    assert.equal(update.success, true);
    assert.equal(update.goal.status, "RESEARCHING");
    assert.equal(update.goal.completionPercentage, 12);

    // Reload as if JARVIS restarted.
    goalRegistry.init(file);
    const reloaded = goalRegistry.getById(target.goalId);

    assert.equal(reloaded.status, "RESEARCHING");
    assert.equal(reloaded.completionPercentage, 12);
    assert.equal(reloaded.nextAction, "Compare recovery approaches");
});

test("completed goals remain completed after reload (no reset to zero)", () => {
    const file = tempPath();
    goalRegistry.init(file);

    const target = goalRegistry.getAll()[5];
    goalRegistry.updateGoal(target.goalId, {
        status: "COMPLETED",
        completionPercentage: 100
    });

    // Simulate several restarts in a row.
    goalRegistry.init(file);
    goalRegistry.init(file);
    goalRegistry.init(file);

    const stillCompleted = goalRegistry.getById(target.goalId);
    assert.equal(stillCompleted.status, "COMPLETED");
    assert.equal(stillCompleted.completionPercentage, 100);

    const allGoals = goalRegistry.getAll();
    assert.equal(allGoals.length, 39, "restart must not drop or duplicate goals");
});

test("missing registry file is safely (re)seeded", () => {
    const file = tempPath();
    // File does not exist yet at all.
    assert.equal(fs.existsSync(file), false);

    const result = goalRegistry.init(file);
    assert.equal(result.seeded, true);
    assert.equal(goalRegistry.getAll().length, 39);
});

test("corrupt registry file is backed up, not destroyed, and safely re-seeded", () => {
    const file = tempPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ this is not valid JSON ]]]", "utf8");

    const result = goalRegistry.init(file);

    assert.equal(result.success, true);
    assert.equal(result.recovered, true);
    assert.ok(result.corruptBackup, "a backup path should be reported");
    assert.ok(fs.existsSync(result.corruptBackup), "the corrupt file must be preserved on disk, not deleted");

    const backupContents = fs.readFileSync(result.corruptBackup, "utf8");
    assert.equal(backupContents, "{ this is not valid JSON ]]]", "backup must contain the original corrupt content untouched");

    assert.equal(goalRegistry.getAll().length, 39);
});

test("registry file with an unexpected shape (not an object with a goals array) is treated as corrupt, not crashed on", () => {
    const file = tempPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ notGoals: true }), "utf8");

    const result = goalRegistry.init(file);
    assert.equal(result.recovered, true);
    assert.equal(goalRegistry.getAll().length, 39);
});

test("goal IDs remain stable across many reloads", () => {
    const file = tempPath();
    goalRegistry.init(file);
    const idsFirst = goalRegistry.getAll().map((g) => g.goalId).sort();

    for (let i = 0; i < 5; i++) {
        goalRegistry.init(file);
    }

    const idsAfter = goalRegistry.getAll().map((g) => g.goalId).sort();
    assert.deepEqual(idsAfter, idsFirst);
});

test("every seeded goal has the required fields with correct types", () => {
    const file = tempPath();
    goalRegistry.init(file);

    for (const goal of goalRegistry.getAll()) {
        assert.equal(typeof goal.goalId, "string");
        assert.equal(typeof goal.featureId, "string");
        assert.equal(typeof goal.name, "string");
        assert.equal(typeof goal.category, "string");
        assert.equal(typeof goal.description, "string");
        assert.equal(typeof goal.priority, "number");
        assert.ok(goalRegistry.STATUSES.includes(goal.status));
        assert.equal(typeof goal.completionPercentage, "number");
        assert.ok(Array.isArray(goal.dependencies));
        assert.ok(Array.isArray(goal.knownProblems));
        assert.equal(typeof goal.researchStatus, "string");
        assert.equal(typeof goal.knowledgeStatus, "string");
        assert.equal(typeof goal.analysisStatus, "string");
        assert.equal(typeof goal.proposalStatus, "string");
        assert.equal(typeof goal.implementationStatus, "string");
        assert.equal(typeof goal.nextAction, "string");
        assert.equal(typeof goal.createdAt, "string");
        assert.equal(typeof goal.updatedAt, "string");
    }
});

test("updateGoal rejects an unknown goalId instead of throwing or silently creating one", () => {
    const file = tempPath();
    goalRegistry.init(file);

    const result = goalRegistry.updateGoal("goal-99-does-not-exist", { status: "COMPLETED" });
    assert.equal(result.success, false);
    assert.equal(goalRegistry.getAll().length, 39);
});

test("updateGoal rejects an invalid status value", () => {
    const file = tempPath();
    goalRegistry.init(file);
    const target = goalRegistry.getAll()[0];

    const result = goalRegistry.updateGoal(target.goalId, { status: "NOT_A_REAL_STATUS" });
    assert.equal(result.success, false);
    assert.equal(goalRegistry.getById(target.goalId).status, "NOT_STARTED");
});

test("getSummary reports overall progress and status counts consistent with getAll", () => {
    const file = tempPath();
    goalRegistry.init(file);

    const all = goalRegistry.getAll();
    goalRegistry.updateGoal(all[0].goalId, { status: "COMPLETED", completionPercentage: 100 });
    goalRegistry.updateGoal(all[1].goalId, { status: "RESEARCHING", completionPercentage: 20 });

    const summary = goalRegistry.getSummary();
    assert.equal(summary.totalGoals, 39);
    assert.equal(summary.byStatus.COMPLETED, 1);
    assert.equal(summary.byStatus.RESEARCHING, 1);
    assert.equal(summary.byStatus.NOT_STARTED, 37);

    const expectedAverage = Math.round((100 + 20) / 39);
    assert.equal(summary.overallProgress, expectedAverage);
});

test("registry is compatible with existing project architecture (no electron-store, plain JSON on disk)", () => {
    const file = tempPath();
    goalRegistry.init(file);

    // The persisted file must be plain, human-readable JSON — the
    // same convention as src/database/memory.json and
    // userData/jarvis_mistakes.json, not a binary/DB format.
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.goals));
    assert.equal(parsed.goals.length, 39);
    assert.equal(typeof parsed.version, "number");

    // No stray electron-store config/instance files should appear
    // next to it.
    const dirEntries = fs.readdirSync(path.dirname(file));
    assert.ok(!dirEntries.some((entry) => entry.includes("electron-store")));
});
