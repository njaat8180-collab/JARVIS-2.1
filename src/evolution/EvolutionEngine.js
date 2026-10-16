"use strict";

/**
 * ============================================================
 * JARVIS BACKGROUND EVOLUTION ENGINE (Phase 4)
 * ============================================================
 *
 * Orchestrates: observe -> select -> analyze -> decide/update -> checkpoint
 *
 * Consumes (does NOT duplicate):
 *   - the Phase 2 39-goal registry  (src/evolution/goalRegistry.js)
 *   - the Phase 3 checkpoint module (src/evolution/checkpoint.js)
 *
 * Hard constraints (see the Phase 4 project brief):
 *   - No AI / LLM calls of any kind.
 *   - Research is strictly read-only (src/evolution/researchProvider.js).
 *     The Phase 4 default (LocalDeterministicResearchProvider) makes no
 *     network requests at all. Phase 5 adds an injectable, real
 *     read-only research provider (MultiSourceResearchProvider) built
 *     entirely on the project's existing keyless services — see that
 *     file for the network-safety and security constraints it follows.
 *   - No execution of arbitrary/generated/downloaded code.
 *   - No autonomous application of changes: a per-session permission
 *     gate (default OFF, never persisted) plus an explicit approval on
 *     the specific proposal are BOTH required before "applying" runs.
 *   - Never marks a goal COMPLETED automatically — Phase 4 only ever
 *     advances a goal to PARTIAL; full completion remains a deliberate,
 *     separate action (e.g. via the existing evolution:update-goal IPC).
 *
 * Persistence (Phase 4, new files, same conventions as Phase 2/3 via
 * evolutionStore.js): proposals.json, evolutionHistory.json, failures.json.
 * ============================================================
 */

const path = require("path");
const { createRecordStore } = require("./evolutionStore");
const { LocalDeterministicResearchProvider } = require("./researchProvider");

/* ============================================================
   STATE MACHINE
============================================================ */

const STATES = Object.freeze([
    "idle",
    "observing",
    "selecting",
    "analyzing",
    "waiting_approval",
    "applying",
    "completed",
    "failed",
    "paused"
]);

/**
 * Explicit valid transitions. Anything not listed here is refused by
 * _transition() rather than silently allowed — "invalid transitions
 * must fail safely" per the project brief. Pause/resume are handled
 * separately (see pause()/resume()) because "paused" can be entered
 * from several different states and must remember which one to
 * return to; encoding that in this table would require one entry per
 * source state anyway, so pause/resume validate against PAUSABLE_FROM
 * instead.
 */
const TRANSITIONS = Object.freeze({
    idle: ["observing"],
    observing: ["selecting", "failed"],
    selecting: ["analyzing", "idle", "failed"],
    analyzing: ["waiting_approval", "failed"],
    waiting_approval: ["applying", "idle"], // applying = approved, idle = rejected
    applying: ["completed", "failed"],
    completed: ["idle"],
    failed: ["idle"],
    paused: [] // resume() exits this state explicitly, see resume()
});

const PAUSABLE_FROM = Object.freeze(["observing", "selecting", "analyzing", "waiting_approval", "applying"]);

/** Maps an engine state to the reused goalRegistry.STATUSES phase name
 *  persisted on the checkpoint's currentPhase field, per Phase 3's
 *  documented rule ("reuses goalRegistry.STATUSES instead of inventing
 *  a second, parallel phase enum"). */
const STATE_TO_GOAL_PHASE = Object.freeze({
    idle: "NOT_STARTED",
    observing: "OBSERVING",
    selecting: "PLANNING",
    analyzing: "ANALYZING",
    waiting_approval: "WAITING_APPROVAL",
    applying: "TESTING",
    completed: "COMPLETED",
    failed: "FAILED",
    paused: "PAUSED"
});

/** Maps an engine state to the checkpoint module's own coarser
 *  ENGINE_STATUSES (IDLE/ACTIVE/PAUSED/STOPPED). */
function engineStatusFor(state) {
    if (state === "paused") return "PAUSED";
    if (state === "idle" || state === "completed" || state === "failed") return "IDLE";
    return "ACTIVE";
}

/** Deterministic progress estimate shown on the checkpoint for a given
 *  engine state. Purely descriptive of lifecycle position — NOT the
 *  goal's own completionPercentage. */
const STATE_PROGRESS = Object.freeze({
    idle: 0,
    observing: 10,
    selecting: 20,
    analyzing: 40,
    waiting_approval: 60,
    applying: 80,
    completed: 100,
    failed: 0,
    paused: null // preserves whatever progress was last recorded
});

/* ============================================================
   HELPERS
============================================================ */

function nowIso() {
    return new Date().toISOString();
}

let idCounter = 0;
function generateId(prefix) {
    idCounter += 1;
    const datePart = new Date().toISOString().slice(0, 10);
    return `${prefix}-${datePart}-${String(idCounter).padStart(5, "0")}`;
}

/* ============================================================
   ENGINE
============================================================ */

class EvolutionEngine {
    /**
     * @param {object} deps
     * @param {object} deps.goalRegistry - the initialized Phase 2 goalRegistry module.
     * @param {object} deps.checkpoint - the initialized Phase 3 checkpoint module.
     * @param {string} deps.storageDir - directory for Phase 4's own JSON files (src/database/evolution).
     * @param {object} [deps.researchProvider] - defaults to LocalDeterministicResearchProvider; injectable for tests/Phase 5.
     */
    constructor({ goalRegistry, checkpoint, storageDir, researchProvider }) {
        if (!goalRegistry) throw new TypeError("EvolutionEngine requires a goalRegistry dependency.");
        if (!checkpoint) throw new TypeError("EvolutionEngine requires a checkpoint dependency.");
        if (!storageDir) throw new TypeError("EvolutionEngine requires a storageDir.");

        this.goalRegistry = goalRegistry;
        this.checkpoint = checkpoint;
        this.researchProvider = researchProvider || new LocalDeterministicResearchProvider();

        this.proposalsStore = createRecordStore({ label: "proposals.json", idField: "proposalId" });
        this.historyStore = createRecordStore({ label: "evolutionHistory.json", idField: "entryId" });
        this.failuresStore = createRecordStore({ label: "failures.json", idField: "failureId" });

        this.proposalsStore.init(path.join(storageDir, "proposals.json"));
        this.historyStore.init(path.join(storageDir, "evolutionHistory.json"));
        this.failuresStore.init(path.join(storageDir, "failures.json"));

        // Per-session permission gate. Deliberately in-memory only and
        // NEVER written to disk or seeded from a prior session — every
        // new engine instance (i.e. every app start) begins with this
        // OFF, per the project brief's "Default: OFF" requirement.
        this.sessionPermissionEnabled = false;

        this.currentGoalId = null;
        this.currentProposalId = null;
        this.pausedFrom = null;

        // Resume from whatever the Phase 3 checkpoint already recorded,
        // rather than resetting to idle just because the process restarted.
        const cp = this.checkpoint.getCheckpoint();
        this.currentGoalId = cp.currentGoal || null;
        this.state = this._stateFromCheckpoint(cp);

        // If resuming into (or paused at) waiting_approval, restore
        // currentProposalId from disk so approve/reject still work after
        // a restart — the checkpoint itself doesn't carry a proposalId.
        const resumedInto = this.state === "paused" ? this.pausedFrom : this.state;
        if (resumedInto === "waiting_approval" && this.currentGoalId) {
            const pending = this.proposalsStore
                .getAll()
                .find((p) => p.goalId === this.currentGoalId && p.status === "pending");
            this.currentProposalId = pending ? pending.proposalId : null;
        }
    }

    _stateFromCheckpoint(cp) {
        // A checkpoint left mid-flight ("ACTIVE"/"PAUSED") on a phase we
        // recognize resumes into the matching engine state; anything else
        // (including a brand-new checkpoint) safely resumes as idle. We
        // never resume directly into "applying" — applying a change is
        // never safe to silently continue after an unclean restart, so it
        // always resumes as "waiting_approval" instead (requires a fresh,
        // explicit approval).
        const phaseToState = {
            OBSERVING: "observing",
            PLANNING: "selecting",
            ANALYZING: "analyzing",
            WAITING_APPROVAL: "waiting_approval",
            TESTING: "waiting_approval"
        };
        if (cp.status === "PAUSED") {
            this.pausedFrom = phaseToState[cp.currentPhase] || null;
            return "paused";
        }
        if (cp.status === "ACTIVE" && phaseToState[cp.currentPhase]) {
            return phaseToState[cp.currentPhase];
        }
        return "idle";
    }

    /* --------------------------------------------------------
       STATE MACHINE
    -------------------------------------------------------- */

    _transition(nextState, { goalId = this.currentGoalId, nextAction = "" } = {}) {
        const allowed = TRANSITIONS[this.state] || [];
        if (!allowed.includes(nextState)) {
            return { success: false, error: `Invalid transition: ${this.state} -> ${nextState}` };
        }

        const previousState = this.state;
        this.state = nextState;
        this._recordHistory("transition", { from: previousState, to: nextState, goalId });
        this._saveCheckpoint(goalId, nextAction);
        return { success: true, state: this.state };
    }

    _saveCheckpoint(goalId, nextAction) {
        const progress = STATE_PROGRESS[this.state];
        const updates = {
            currentGoal: goalId || null,
            currentPhase: STATE_TO_GOAL_PHASE[this.state],
            status: engineStatusFor(this.state),
            nextAction: nextAction || this.checkpoint.getCheckpoint().nextAction || ""
        };
        if (progress !== null && progress !== undefined) {
            updates.progress = progress;
        }
        this.checkpoint.updateCheckpoint(updates);
    }

    _recordHistory(event, details = {}) {
        this.historyStore.add({
            entryId: generateId("EVH"),
            event,
            state: this.state,
            timestamp: nowIso(),
            ...details
        });
    }

    _recordFailure(reason, details = {}) {
        this.failuresStore.add({
            failureId: generateId("FAIL"),
            reason,
            state: this.state,
            timestamp: nowIso(),
            ...details
        });
    }

    getState() {
        return {
            state: this.state,
            currentGoalId: this.currentGoalId,
            currentProposalId: this.currentProposalId,
            sessionPermissionEnabled: this.sessionPermissionEnabled,
            pausedFrom: this.pausedFrom
        };
    }

    /* --------------------------------------------------------
       GOAL SELECTION
       Deterministic rule (documented per project brief step 5):
         1. priority ascending (registry's own field; lower number
            = higher priority, per goalRegistry.js's own docs)
         2. completionPercentage ascending (least-progressed first)
         3. goalId ascending (stable tie-break, never random)
       Goals with status COMPLETED or BLOCKED are not eligible.
    -------------------------------------------------------- */

    selectNextGoal() {
        const eligible = this.goalRegistry
            .getAll()
            .filter((g) => g.status !== "COMPLETED" && g.status !== "BLOCKED");

        if (eligible.length === 0) return null;

        eligible.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.completionPercentage !== b.completionPercentage) {
                return a.completionPercentage - b.completionPercentage;
            }
            return a.goalId < b.goalId ? -1 : a.goalId > b.goalId ? 1 : 0;
        });

        return eligible[0];
    }

    /* --------------------------------------------------------
       LIFECYCLE: observe -> select -> analyze -> propose
       A single bounded pass (no loop). It stops as soon as it
       reaches "waiting_approval", "idle" (nothing eligible), or
       "failed" (an unexpected error) — it never loops back on
       itself, so there is no hidden infinite loop.
    -------------------------------------------------------- */

    async start() {
        if (this.state === "completed" || this.state === "failed") {
            // Explicit, single documented transition back to idle before
            // starting a new cycle — matches lifecycle step 13 ("Return to
            // idle") rather than silently re-using a terminal state.
            const back = this._transition("idle", { goalId: null, nextAction: "Awaiting next start()." });
            if (!back.success) return back;
        }

        if (this.state !== "idle") {
            return { success: false, error: `Cannot start from state: ${this.state}` };
        }

        const observed = this._transition("observing", {
            goalId: null,
            nextAction: "Reading current goal registry and checkpoint state."
        });
        if (!observed.success) return observed;

        const selecting = this._transition("selecting", {
            goalId: null,
            nextAction: "Selecting next eligible goal (priority -> progress -> goalId)."
        });
        if (!selecting.success) return selecting;

        const goal = this.selectNextGoal();
        if (!goal) {
            this._transition("idle", { goalId: null, nextAction: "No eligible goal found; idle." });
            return { success: true, state: this.state, message: "No eligible goal found." };
        }

        this.currentGoalId = goal.goalId;

        const analyzing = this._transition("analyzing", {
            goalId: goal.goalId,
            nextAction: `Analyzing goal ${goal.goalId} (${goal.name}).`
        });
        if (!analyzing.success) return analyzing;

        return this._analyze(goal);
    }

    async _analyze(goal) {
        try {
            // Duplicate-proposal prevention: reuse an existing pending
            // proposal for this goal instead of creating a second one.
            const existingPending = this.proposalsStore
                .getAll()
                .find((p) => p.goalId === goal.goalId && p.status === "pending");

            let proposal = existingPending;
            if (!proposal) {
                // researchProvider.research() may return a plain object
                // (the Phase 4 LocalDeterministicResearchProvider default)
                // or a Promise (Phase 5's real, read-only research
                // providers). Awaiting works for both without the engine
                // needing to know which kind of provider it was given.
                const research = await this.researchProvider.research(goal);
                proposal = this._buildProposal(goal, research);
                const added = this.proposalsStore.add(proposal);
                if (!added.success) {
                    this._recordFailure("Failed to persist proposal.", { goalId: goal.goalId });
                    this._transition("failed", { goalId: goal.goalId, nextAction: "Proposal persistence failed." });
                    return { success: false, error: "Failed to persist proposal." };
                }
            }

            this.currentProposalId = proposal.proposalId;
            this.goalRegistry.updateGoal(goal.goalId, {
                status: "WAITING_APPROVAL",
                proposalStatus: "PROPOSAL_READY",
                analysisStatus: "COMPLETED",
                lastActivity: nowIso(),
                nextAction: `Awaiting approval for proposal ${proposal.proposalId}.`
            });

            const waiting = this._transition("waiting_approval", {
                goalId: goal.goalId,
                nextAction: `Proposal ${proposal.proposalId} ready; awaiting session approval.`
            });
            if (!waiting.success) return waiting;

            return { success: true, state: this.state, proposal };
        } catch (error) {
            this._recordFailure(error.message || String(error), { goalId: goal.goalId });
            this._transition("failed", { goalId: goal.goalId, nextAction: "Analysis raised an unexpected error." });
            return { success: false, error: error.message || String(error) };
        }
    }

    _buildProposal(goal, research) {
        const riskLevel = goal.category === "Safety & Control" ? "high" : goal.completionPercentage >= 50 ? "low" : "medium";

        // research is normally { source, generatedAt, findings, results?,
        // succeededSources?, failedSources? }. results/succeededSources/
        // failedSources are only present for Phase 5's real research
        // providers (LocalDeterministicResearchProvider does not produce
        // per-source evidence), so every field below is defaulted rather
        // than assumed present — a proposal must never fabricate
        // provenance for evidence that was never actually retrieved.
        const results = Array.isArray(research.results) ? research.results : [];
        const provenance = results.map((r) => ({
            source: r.source,
            sourceTitle: r.title || null,
            query: r.query || null,
            sourceUrl: r.url || null,
            retrievedAt: r.retrievedAt || null,
            evidenceSummary: r.summary || null,
            success: !!r.success,
            error: r.error || null
        }));

        return {
            proposalId: generateId("PR"),
            goalId: goal.goalId,
            title: `Advance "${goal.name}"`,
            reason: `Goal is at ${goal.completionPercentage}% (${goal.status}) and is next in priority order.`,
            observedIssue: research.findings[0],
            proposedImprovement: `Address the observed issue for "${goal.name}" and record verifiable progress.`,
            expectedBenefit: `Incremental, evidence-backed progress toward the "${goal.name}" goal.`,
            riskLevel,
            status: "pending",
            createdAt: nowIso(),
            approvedAt: null,
            rejectedAt: null,
            research: {
                source: research.source || null,
                generatedAt: research.generatedAt || null,
                succeededSources: Array.isArray(research.succeededSources) ? research.succeededSources : [],
                failedSources: Array.isArray(research.failedSources) ? research.failedSources : []
            },
            provenance
        };
    }

    /* --------------------------------------------------------
       SESSION APPROVAL GATE
    -------------------------------------------------------- */

    enableSessionPermission() {
        this.sessionPermissionEnabled = true;
        this._recordHistory("permission-enabled");
        return { success: true, sessionPermissionEnabled: true };
    }

    disableSessionPermission() {
        this.sessionPermissionEnabled = false;
        this._recordHistory("permission-disabled");
        return { success: true, sessionPermissionEnabled: false };
    }

    approveProposal(proposalId) {
        if (this.state !== "waiting_approval") {
            return { success: false, error: `No proposal awaiting approval (state: ${this.state}).` };
        }
        if (proposalId !== this.currentProposalId) {
            return { success: false, error: `proposalId ${proposalId} does not match the active proposal.` };
        }
        if (!this.sessionPermissionEnabled) {
            return { success: false, error: "Self-Improvement permission is OFF for this session." };
        }

        const proposal = this.proposalsStore.getById(proposalId);
        if (!proposal || proposal.status !== "pending") {
            return { success: false, error: `Proposal ${proposalId} is not pending.` };
        }

        this.proposalsStore.updateById(proposalId, { status: "approved", approvedAt: nowIso() });

        const applying = this._transition("applying", {
            goalId: this.currentGoalId,
            nextAction: `Applying approved proposal ${proposalId}.`
        });
        if (!applying.success) return applying;

        return this._apply(proposal);
    }

    rejectProposal(proposalId, reason = "") {
        if (this.state !== "waiting_approval") {
            return { success: false, error: `No proposal awaiting approval (state: ${this.state}).` };
        }
        if (proposalId !== this.currentProposalId) {
            return { success: false, error: `proposalId ${proposalId} does not match the active proposal.` };
        }

        this.proposalsStore.updateById(proposalId, {
            status: "rejected",
            rejectedAt: nowIso(),
            rejectionReason: String(reason || "")
        });

        if (this.currentGoalId) {
            this.goalRegistry.updateGoal(this.currentGoalId, {
                status: "PLANNING",
                proposalStatus: "REJECTED",
                lastActivity: nowIso(),
                nextAction: "Proposal rejected; will be reconsidered on a future cycle."
            });
        }

        const goalId = this.currentGoalId;
        this.currentGoalId = null;
        this.currentProposalId = null;

        const transitioned = this._transition("idle", { goalId: null, nextAction: "Proposal rejected; idle." });
        if (!transitioned.success) return transitioned;

        this._recordHistory("proposal-rejected", { goalId, proposalId, reason });
        return { success: true, state: this.state };
    }

    /**
     * "Applying" in Phase 4 never executes generated/downloaded code and
     * never marks a goal COMPLETED on its own — see the safety notes at
     * the top of this file. It records that the approved proposal was
     * applied and nudges the goal's own recorded progress forward by a
     * small, fixed, deterministic amount (capped so it can never reach
     * 100% by itself), leaving true completion to a separate, deliberate
     * evolution:update-goal call.
     */
    _apply(proposal) {
        try {
            const goal = this.goalRegistry.getById(proposal.goalId);
            if (!goal) {
                throw new Error(`Goal ${proposal.goalId} no longer exists in the registry.`);
            }

            const APPLY_INCREMENT = 10;
            const CAP = 95;
            const nextPercentage = Math.min(CAP, (Number(goal.completionPercentage) || 0) + APPLY_INCREMENT);

            this.goalRegistry.updateGoal(goal.goalId, {
                status: "PARTIAL",
                completionPercentage: nextPercentage,
                implementationStatus: "PARTIAL",
                proposalStatus: "APPLIED",
                lastActivity: nowIso(),
                nextAction: "Re-evaluate on the next evolution cycle."
            });

            this.proposalsStore.updateById(proposal.proposalId, { status: "applied" });

            this._recordHistory("proposal-applied", { goalId: goal.goalId, proposalId: proposal.proposalId });

            const completed = this._transition("completed", {
                goalId: goal.goalId,
                nextAction: `Applied proposal ${proposal.proposalId}; cycle complete.`
            });
            if (!completed.success) return completed;

            return { success: true, state: this.state, goal: this.goalRegistry.getById(goal.goalId) };
        } catch (error) {
            this._recordFailure(error.message || String(error), {
                goalId: proposal.goalId,
                proposalId: proposal.proposalId
            });
            this.proposalsStore.updateById(proposal.proposalId, { status: "failed" });
            this._transition("failed", {
                goalId: proposal.goalId,
                nextAction: "Applying the approved proposal raised an unexpected error."
            });
            return { success: false, error: error.message || String(error) };
        }
    }

    /* --------------------------------------------------------
       PAUSE / RESUME
    -------------------------------------------------------- */

    pause() {
        if (!PAUSABLE_FROM.includes(this.state)) {
            return { success: false, error: `Cannot pause from state: ${this.state}` };
        }
        this.pausedFrom = this.state;
        this.state = "paused";
        this._recordHistory("paused", { pausedFrom: this.pausedFrom, goalId: this.currentGoalId });
        this._saveCheckpoint(this.currentGoalId, `Paused while ${this.pausedFrom}.`);
        return { success: true, state: this.state };
    }

    resume() {
        if (this.state !== "paused" || !this.pausedFrom) {
            return { success: false, error: `Cannot resume from state: ${this.state}` };
        }
        const target = this.pausedFrom;
        this.state = target;
        this.pausedFrom = null;
        this._recordHistory("resumed", { resumedTo: target, goalId: this.currentGoalId });
        this._saveCheckpoint(this.currentGoalId, `Resumed into ${target}.`);
        return { success: true, state: this.state };
    }

    /* --------------------------------------------------------
       READ ACCESS
    -------------------------------------------------------- */

    getProposals() {
        return this.proposalsStore.getAll();
    }

    getHistory() {
        return this.historyStore.getAll();
    }

    getFailures() {
        return this.failuresStore.getAll();
    }

    /**
     * PHASE 8 — read-only memory health inspection.
     *
     * Evolution is allowed to *inspect* the long-term memory store
     * (duplicate/corrupted-record counts, expired-but-not-yet-cleaned
     * records) and *propose* cleanup, but it must never autonomously
     * delete or rewrite memory records. This method never calls any
     * mutating MemoryEngine method (removeDuplicates/removeExpired/
     * compact/repair/clear/forget*) — it only reads validate()/
     * stats(), and returns a set of proposals for a human (or the
     * existing goal/approval flow) to act on, exactly like Evolution's
     * other proposals. No AI is used to generate these proposals —
     * they are simple deterministic thresholds on the numbers
     * MemoryEngine already reports.
     *
     * @param {object} memoryEngine - a MemoryEngine instance (or
     *   anything exposing the same validate()/stats() read API).
     */
    inspectMemoryHealth(memoryEngine) {
        if (!memoryEngine || typeof memoryEngine.stats !== "function" || typeof memoryEngine.validate !== "function") {
            return { healthy: true, problems: [], proposals: [] };
        }

        const stats = memoryEngine.stats();
        const problems = memoryEngine.validate();
        const proposals = [];

        if (stats.duplicateCount > 0) {
            proposals.push({
                type: "memory_cleanup",
                action: "removeDuplicates",
                reason: `${stats.duplicateCount} duplicate memory record(s) detected.`,
                requiresApproval: true
            });
        }
        if (stats.expired > 0) {
            proposals.push({
                type: "memory_cleanup",
                action: "removeExpired",
                reason: `${stats.expired} expired memory record(s) are still on disk.`,
                requiresApproval: true
            });
        }
        if (problems.length > 0) {
            proposals.push({
                type: "memory_repair",
                action: "repair",
                reason: `${problems.length} structural issue(s) found in the memory store.`,
                requiresApproval: true
            });
        }

        return {
            healthy: problems.length === 0 && stats.duplicateCount === 0,
            stats,
            problems,
            proposals
        };
    }
}

/* ============================================================
   SINGLETON ACCESS
   The engine "must be instantiated only once" per the project
   brief. main.js should always go through getInstance(); direct
   `new EvolutionEngine(...)` is exported mainly for tests, which
   need independent instances against temp directories.
============================================================ */

let singleton = null;

function getInstance(deps) {
    if (!singleton) {
        singleton = new EvolutionEngine(deps);
    }
    return singleton;
}

/** Test-only: clears the singleton so each test file/suite can build a
 *  fresh engine against its own temp storageDir without cross-talk. */
function resetInstanceForTests() {
    singleton = null;
}

module.exports = {
    EvolutionEngine,
    getInstance,
    resetInstanceForTests,
    STATES,
    TRANSITIONS
};
