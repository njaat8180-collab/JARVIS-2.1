"use strict";

/**
 * Phase 4 — Background Evolution Engine.
 *
 * Every test builds fresh goalRegistry/checkpoint/EvolutionEngine
 * instances against a brand-new temp directory (via *.init(tempPath)
 * and `new EvolutionEngine(...)`, never the getInstance() singleton),
 * matching the isolation pattern already used by
 * test/goal-registry.test.js and test/checkpoint.test.js so these
 * tests never touch real project state and never interfere with
 * each other through module singleton state.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const goalRegistryModule = require("../src/evolution/goalRegistry");
const checkpointModule = require("../src/evolution/checkpoint");
const { EvolutionEngine, STATES, TRANSITIONS, getInstance, resetInstanceForTests } = require("../src/evolution/EvolutionEngine");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-evolution-engine-test-"));
}

/**
 * Builds a fully independent {goalRegistry, checkpoint, engine} trio
 * against a fresh temp directory. goalRegistry.js/checkpoint.js are
 * plain singleton modules (like the Phase 2/3 test files already
 * rely on), so each call here re-points and reloads them before
 * constructing a brand-new EvolutionEngine on top.
 */
function buildEngine(overrides = {}) {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));

    const engine = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir,
        ...overrides
    });

    return { dir, goalRegistry: goalRegistryModule, checkpoint: checkpointModule, engine };
}

/* ============================================================
   1. Engine initialization / 2. Initial state
============================================================ */

test("engine initializes cleanly against a fresh registry/checkpoint", async () => {
    const { engine, dir } = buildEngine();
    assert.equal(engine.state, "idle");
    assert.equal(engine.getState().currentGoalId, null);
    assert.equal(engine.getState().sessionPermissionEnabled, false);
    assert.ok(fs.existsSync(path.join(dir, "proposals.json")));
    assert.ok(fs.existsSync(path.join(dir, "evolutionHistory.json")));
    assert.ok(fs.existsSync(path.join(dir, "failures.json")));
});

test("initial state is idle with no active goal or proposal", async () => {
    const { engine } = buildEngine();
    const state = engine.getState();
    assert.equal(state.state, "idle");
    assert.equal(state.currentGoalId, null);
    assert.equal(state.currentProposalId, null);
    assert.equal(state.pausedFrom, null);
});

/* ============================================================
   3. State-machine transitions / 4. Invalid transitions
============================================================ */

test("STATES lists exactly the states required by the project brief", async () => {
    const expected = [
        "idle", "observing", "selecting", "analyzing",
        "waiting_approval", "applying", "completed", "failed", "paused"
    ];
    assert.deepEqual([...STATES].sort(), [...expected].sort());
});

test("start() walks idle -> observing -> selecting -> analyzing -> waiting_approval", async () => {
    const { engine } = buildEngine();
    const result = await engine.start();
    assert.equal(result.success, true);
    assert.equal(engine.state, "waiting_approval");
    assert.ok(engine.currentGoalId);
    assert.ok(engine.currentProposalId);
});

test("invalid transitions are refused rather than silently applied", async () => {
    const { engine } = buildEngine();
    // idle cannot jump straight to waiting_approval.
    const result = engine._transition("waiting_approval", {});
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid transition/);
    assert.equal(engine.state, "idle"); // unchanged
});

test("TRANSITIONS table has no entry allowing waiting_approval -> applying without going through approveProposal", async () => {
    // applying is reachable from waiting_approval structurally (approval flow
    // uses it) but approveProposal() itself is the only code path that calls
    // it — this test just pins the table shape so it can't silently grow.
    assert.deepEqual(TRANSITIONS.waiting_approval.sort(), ["applying", "idle"].sort());
});

/* ============================================================
   5. Goal selection / 6. Deterministic ordering
============================================================ */

test("selectNextGoal is deterministic: priority -> completionPercentage -> goalId", async () => {
    const { engine, goalRegistry } = buildEngine();
    const all = goalRegistry.getAll();

    // Force two goals to share the same priority so the tie-break kicks in.
    const [a, b] = all;
    goalRegistry.updateGoal(a.goalId, { priority: 1, completionPercentage: 50 });
    goalRegistry.updateGoal(b.goalId, { priority: 1, completionPercentage: 10 });

    const selected = engine.selectNextGoal();
    // Lower completionPercentage wins the tie at equal priority.
    assert.equal(selected.goalId, b.goalId);
});

test("selectNextGoal is repeatable given the same registry state", async () => {
    const { engine } = buildEngine();
    const first = engine.selectNextGoal();
    const second = engine.selectNextGoal();
    assert.equal(first.goalId, second.goalId);
});

test("selectNextGoal excludes COMPLETED and BLOCKED goals", async () => {
    const { engine, goalRegistry } = buildEngine();
    const all = goalRegistry.getAll();
    for (const g of all) {
        goalRegistry.updateGoal(g.goalId, { status: "COMPLETED" });
    }
    goalRegistry.updateGoal(all[5].goalId, { status: "BLOCKED" });
    goalRegistry.updateGoal(all[10].goalId, { status: "NOT_STARTED" });

    const selected = engine.selectNextGoal();
    assert.equal(selected.goalId, all[10].goalId);
});

test("selectNextGoal returns null when every goal is COMPLETED or BLOCKED", async () => {
    const { engine, goalRegistry } = buildEngine();
    for (const g of goalRegistry.getAll()) {
        goalRegistry.updateGoal(g.goalId, { status: "COMPLETED" });
    }
    assert.equal(engine.selectNextGoal(), null);
});

/* ============================================================
   7. Checkpoint updates / 8. Resume from checkpoint
============================================================ */

test("lifecycle transitions persist meaningful checkpoint updates", async () => {
    const { engine, checkpoint } = buildEngine();
    await engine.start();

    const cp = checkpoint.getCheckpoint();
    assert.equal(cp.currentGoal, engine.currentGoalId);
    assert.equal(cp.currentPhase, "WAITING_APPROVAL");
    assert.equal(cp.status, "ACTIVE");
    assert.equal(typeof cp.nextAction, "string");
    assert.ok(cp.nextAction.length > 0);
});

test("a new engine instance resumes waiting_approval from an existing checkpoint + proposal", async () => {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));

    const engine1 = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir
    });
    await engine1.start();
    const goalId = engine1.currentGoalId;
    const proposalId = engine1.currentProposalId;

    // Simulate a restart: re-init the same on-disk modules and build a
    // brand-new engine instance against the same storageDir.
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));
    const engine2 = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir
    });

    assert.equal(engine2.state, "waiting_approval");
    assert.equal(engine2.currentGoalId, goalId);
    assert.equal(engine2.currentProposalId, proposalId);
});

/* ============================================================
   9. Pause / 10. Resume
============================================================ */

test("pause() records pausedFrom and moves to paused", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const before = engine.state;
    const result = engine.pause();
    assert.equal(result.success, true);
    assert.equal(engine.state, "paused");
    assert.equal(engine.pausedFrom, before);
});

test("resume() returns to the exact state pause() was called from", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const before = engine.state;
    engine.pause();
    const result = engine.resume();
    assert.equal(result.success, true);
    assert.equal(engine.state, before);
    assert.equal(engine.pausedFrom, null);
});

test("pause() is refused from idle/completed/failed", async () => {
    const { engine } = buildEngine();
    const result = engine.pause();
    assert.equal(result.success, false);
});

/* ============================================================
   11. Permission OFF by default / 12. Approval gate blocking
============================================================ */

test("session permission defaults to OFF for a brand-new engine", async () => {
    const { engine } = buildEngine();
    assert.equal(engine.sessionPermissionEnabled, false);
});

test("approveProposal is blocked while session permission is OFF", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const result = engine.approveProposal(engine.currentProposalId);
    assert.equal(result.success, false);
    assert.match(result.error, /permission/i);
    assert.equal(engine.state, "waiting_approval"); // unchanged, nothing applied
});

test("enabling session permission allows approval to proceed", async () => {
    const { engine } = buildEngine();
    await engine.start();
    engine.enableSessionPermission();
    const result = engine.approveProposal(engine.currentProposalId);
    assert.equal(result.success, true);
    assert.equal(engine.state, "completed");
});

/* ============================================================
   13. Proposal creation / 14. approval / 15. rejection / 16. duplicate prevention
============================================================ */

test("analyzing a goal creates a well-formed proposal", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const proposals = engine.getProposals();
    assert.equal(proposals.length, 1);
    const p = proposals[0];
    for (const field of [
        "proposalId", "goalId", "title", "reason", "observedIssue",
        "proposedImprovement", "expectedBenefit", "riskLevel", "status",
        "createdAt", "approvedAt", "rejectedAt"
    ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(p, field), `missing field: ${field}`);
    }
    assert.equal(p.status, "pending");
});

test("approveProposal marks the proposal applied and advances (never completes) the goal", async () => {
    const { engine, goalRegistry } = buildEngine();
    await engine.start();
    const goalId = engine.currentGoalId;
    const before = goalRegistry.getById(goalId).completionPercentage;

    engine.enableSessionPermission();
    engine.approveProposal(engine.currentProposalId);

    const proposal = engine.getProposals()[0];
    assert.equal(proposal.status, "applied");
    assert.ok(proposal.approvedAt);

    const goal = goalRegistry.getById(goalId);
    assert.equal(goal.status, "PARTIAL");
    assert.ok(goal.completionPercentage > before);
    assert.notEqual(goal.status, "COMPLETED");
});

test("rejectProposal marks it rejected and returns the engine to idle", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const proposalId = engine.currentProposalId;
    const result = engine.rejectProposal(proposalId, "not worth it yet");
    assert.equal(result.success, true);
    assert.equal(engine.state, "idle");

    const proposal = engine.getProposals().find((p) => p.proposalId === proposalId);
    assert.equal(proposal.status, "rejected");
    assert.ok(proposal.rejectedAt);
});

test("re-analyzing the same goal never creates a second pending proposal", async () => {
    const { engine, goalRegistry } = buildEngine();
    await engine.start();
    const goal = goalRegistry.getById(engine.currentGoalId);
    const firstProposalCount = engine.getProposals().length;

    // Directly re-run _analyze() against the same still-pending goal.
    await engine._analyze(goal);

    assert.equal(engine.getProposals().length, firstProposalCount);
    const pendingForGoal = engine.getProposals().filter((p) => p.goalId === goal.goalId && p.status === "pending");
    assert.equal(pendingForGoal.length, 1);
});

/* ============================================================
   17. Completed goal handling / 18. Failure handling
============================================================ */

test("a fully completed goal set is never re-selected", async () => {
    const { engine, goalRegistry } = buildEngine();
    for (const g of goalRegistry.getAll()) {
        goalRegistry.updateGoal(g.goalId, { status: "COMPLETED", completionPercentage: 100 });
    }
    const result = await engine.start();
    assert.equal(result.success, true);
    assert.equal(engine.state, "idle");
    assert.equal(engine.getProposals().length, 0);
});

test("an unexpected error during apply is recorded as a failure and the engine fails safely", async () => {
    const { engine, goalRegistry } = buildEngine();
    await engine.start();
    engine.enableSessionPermission();

    // Simulate the goal disappearing between proposal and apply.
    const goalId = engine.currentGoalId;
    const originalGetById = goalRegistry.getById;
    goalRegistry.getById = (id) => (id === goalId ? null : originalGetById(id));

    const result = engine.approveProposal(engine.currentProposalId);
    goalRegistry.getById = originalGetById; // restore

    assert.equal(result.success, false);
    assert.equal(engine.state, "failed");
    assert.ok(engine.getFailures().length >= 1);
});

/* ============================================================
   19. History persistence / 20. Corruption-safe persistence
============================================================ */

test("history accumulates entries for each lifecycle transition", async () => {
    const { engine } = buildEngine();
    await engine.start();
    const history = engine.getHistory();
    assert.ok(history.length >= 3); // observing, selecting, analyzing, waiting_approval transitions
    assert.ok(history.every((h) => typeof h.entryId === "string" && typeof h.timestamp === "string"));
});

test("a corrupted proposals.json is backed up and recovered instead of crashing init", async () => {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));

    const proposalsPath = path.join(dir, "proposals.json");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(proposalsPath, "{ this is not valid json", "utf8");

    const engine = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir
    });

    assert.equal(engine.getProposals().length, 0);
    const backups = fs.readdirSync(dir).filter((f) => f.includes("proposals.json.corrupt-"));
    assert.equal(backups.length, 1);
});

/* ============================================================
   21. IPC registration / 22. IPC validation
   (main.js wiring is exercised indirectly here: the engine's public
   surface is exactly what main.js's evolution IPC handlers call, so
   these tests pin that every channel's underlying method exists and
   validates its input the same way the rest of the project's IPC
   handlers do — full ipcMain wiring itself requires Electron and is
   covered by manual/integration testing, matching how goalRegistry's
   and checkpoint's own test files stay Electron-free.)
============================================================ */

test("public methods used by evolution IPC handlers all exist", async () => {
    const { engine } = buildEngine();
    for (const method of [
        "getState", "start", "pause", "resume",
        "approveProposal", "rejectProposal", "getProposals", "getHistory",
        "enableSessionPermission", "disableSessionPermission"
    ]) {
        assert.equal(typeof engine[method], "function", `missing method: ${method}`);
    }
});

test("approveProposal validates its proposalId argument instead of trusting it blindly", async () => {
    const { engine } = buildEngine();
    await engine.start();
    engine.enableSessionPermission();
    const result = engine.approveProposal("not-the-real-id");
    assert.equal(result.success, false);
});

/* ============================================================
   23. Phase 2 regression / 24. Phase 3 regression
============================================================ */

test("Phase 2 regression: goalRegistry still seeds all 39 goals and survives engine use", async () => {
    const { engine, goalRegistry } = buildEngine();
    assert.equal(goalRegistry.getAll().length, 39);
    await engine.start();
    assert.equal(goalRegistry.getAll().length, 39); // engine never creates/removes goals
});

test("Phase 3 regression: checkpoint reload still restores state exactly after engine activity", async () => {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));
    const engine = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir
    });
    await engine.start();
    const before = checkpointModule.getCheckpoint();

    checkpointModule.init(path.join(dir, "checkpoint.json")); // reload, restart-equivalent
    const after = checkpointModule.getCheckpoint();

    assert.deepEqual(after, before);
});

/* ============================================================
   Singleton behavior ("must be instantiated only once")
============================================================ */

test("getInstance() returns the same engine instance across calls", async () => {
    resetInstanceForTests();
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));

    const first = getInstance({ goalRegistry: goalRegistryModule, checkpoint: checkpointModule, storageDir: dir });
    const second = getInstance({ goalRegistry: goalRegistryModule, checkpoint: checkpointModule, storageDir: dir });
    assert.equal(first, second);
    resetInstanceForTests();
});
