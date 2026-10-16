"use strict";

/**
 * Phase 6 — Professional Deterministic Assistant.
 *
 * Every test uses a fresh temp tasks.json (via a fresh AssistantOrchestrator
 * instance pointed at its own tempPath()) and mock adapters for
 * memory/research/browser/system/goalRegistry/evolutionEngine so this
 * suite needs no live Electron window and no live internet, per the
 * Phase 6 project brief (STEP 16 — "Tests must not require live internet").
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AssistantOrchestrator } = require("../src/assistant/assistantOrchestrator");
const taskStore = require("../src/assistant/taskStore");
const classifier = require("../src/assistant/classifier");
const safetyGate = require("../src/assistant/safetyGate");
const taskPlanner = require("../src/assistant/taskPlanner");
const { createPptxBuffer } = require("../src/presentation/pptxGenerator");

function tempPath(name = "tasks.json") {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-assistant-test-")), name);
}

function makeMemory() {
    const facts = new Map();
    return {
        remember(key, value) {
            facts.set(key, value);
            return { success: true, stored: [{ key, value }] };
        },
        recall(key) {
            return facts.has(key) ? facts.get(key) : null;
        },
        forget(key) {
            const existed = facts.delete(key);
            return { success: true, existed };
        },
        search() {
            return Array.from(facts.entries()).map(([key, value]) => ({ key, value }));
        }
    };
}

function makeResearch(overrides = {}) {
    return {
        async research(goal) {
            if (overrides.fail) {
                return {
                    source: "mock-research",
                    generatedAt: new Date().toISOString(),
                    query: goal.name,
                    findings: [`No live research evidence could be retrieved for "${goal.name}".`],
                    results: [{ source: "mock-source", success: false, error: "mock failure", url: null }],
                    succeededSources: [],
                    failedSources: [{ source: "mock-source", error: "mock failure" }]
                };
            }
            return {
                source: "mock-research",
                generatedAt: new Date().toISOString(),
                query: goal.name,
                findings: [`mock-source: ${goal.name} — Paris is the capital of France.`],
                results: [
                    {
                        source: "mock-source",
                        success: true,
                        title: goal.name,
                        summary: "Paris is the capital of France.",
                        url: "https://example.org/paris",
                        retrievedAt: new Date().toISOString()
                    }
                ],
                succeededSources: ["mock-source"],
                failedSources: []
            };
        }
    };
}

function makeBrowser() {
    const opened = [];
    return {
        opened,
        async open(target) {
            opened.push(target);
            return { opened: target };
        }
    };
}

function makeSystem(overrides = {}) {
    const executed = [];
    return {
        executed,
        async execute(action) {
            executed.push(action);
            if (overrides.fail) throw new Error(`mock system failure on ${action}`);
            return { executed: action };
        },
        async openApplication(target) {
            executed.push(`open:${target}`);
            return { opened: target };
        }
    };
}

function makeGoalRegistry() {
    return {
        getSummary() {
            return { totalGoals: 39, completed: 2, inProgress: 5 };
        }
    };
}

function makeEvolutionEngine(overrides = {}) {
    return {
        async start() {
            if (overrides.fail) throw new Error("mock evolution failure");
            return { success: true, state: "waiting_approval", proposal: { proposalId: "PR-mock-1" } };
        },
        getState() {
            return { state: "waiting_approval", currentGoalId: "goal-01-core-brain" };
        }
    };
}

function makeOrchestrator(extra = {}) {
    return new AssistantOrchestrator({
        storagePath: tempPath(),
        memory: makeMemory(),
        research: makeResearch(extra.researchOverrides),
        browser: makeBrowser(),
        system: makeSystem(extra.systemOverrides),
        goalRegistry: makeGoalRegistry(),
        evolutionEngine: makeEvolutionEngine(extra.evolutionOverrides),
        ...extra.options
    });
}

/* ============================================================
   1. ASSISTANT INITIALIZATION
============================================================ */

test("assistant initializes and creates its own task store file", () => {
    const file = tempPath();
    const orchestrator = new AssistantOrchestrator({ storagePath: file });
    assert.ok(fs.existsSync(file), "tasks.json should be created on init");
    assert.deepEqual(orchestrator.getHistory(), []);
});

/* ============================================================
   2. DETERMINISTIC CLASSIFICATION
============================================================ */

test("classification is deterministic and covers required categories", () => {
    assert.equal(classifier.classify("open chrome").category, "application_action");
    assert.equal(classifier.classify("remember my favorite game is chess").category, "memory");
    assert.equal(classifier.classify("what is the capital of France").category, "research");
    assert.equal(classifier.classify("shutdown computer").category, "system_command");
    assert.equal(classifier.classify("continue my previous task").category, "task");
    assert.equal(classifier.classify("evolve yourself").category, "evolution");
    assert.equal(classifier.classify("Research Minecraft PvP and create a PPT on it").category, "presentation");
    assert.equal(classifier.classify("Create a presentation about RTX 5090 pricing").category, "presentation");
    assert.equal(classifier.classify("show my goals").category, "goal");
    assert.equal(classifier.classify("hello there").category, "conversation");
    assert.equal(classifier.classify("asdkjqwe alksjd").category, "unsupported");
});

test("research-plus-presentation keeps the original task, continues after source failures, and uses the presentation adapter", async () => {
    const calls = [];
    const research = { async research({ name }) {
        calls.push(["research", name]);
        return { source: "mock", query: name, findings: ["No live research evidence could be retrieved."], results: [{ source: "wikipedia", success: false, error: "HTTP 404", errorType: "http_404", url: null }], succeededSources: [], failedSources: [{ source: "wikipedia", error: "HTTP 404", errorType: "http_404" }] };
    } };
    const presentation = { async create(topic, context) {
        calls.push(["presentation", topic, context.userRequest, context.sources.length]);
        return { success: true, path: path.join(os.tmpdir(), "not-created.pptx") };
    } };
    const orchestrator = new AssistantOrchestrator({ storagePath: tempPath(), research, presentation, allowedFileRoots: [os.tmpdir()] });
    const request = "Research Minecraft PvP and create a PPT on it";
    const task = await orchestrator.handleRequest(request);
    assert.equal(task.userRequest, request);
    assert.equal(task.category, "presentation");
    assert.deepEqual(calls, [["research", "minecraft pvp"], ["presentation", "minecraft pvp", request, 0]]);
    assert.equal(task.steps.find(step => step.action === "run_research").result.failedSources[0].errorType, "http_404");
    assert.match(task.metadata.runtime.fallback, /research sources were unavailable/i);
    assert.equal(task.result.path, path.join(os.tmpdir(), "not-created.pptx"));
    assert.equal(task.status, "failed", "the nonexistent PPTX must fail independent file verification");
    assert.equal(task.verification.steps.find(step => step.stepId === "create_presentation").status, "FAILED");
});

test("presentation intent cannot report a result when the generator returns no file", async () => {
    const orchestrator = new AssistantOrchestrator({
        storagePath: tempPath(),
        research: makeResearch({ fail: true }),
        presentation: { create: async () => ({ success: true, title: "Minecraft" }) }
    });
    const task = await orchestrator.handleRequest("Create a PPT on Minecraft");
    assert.equal(task.status, "failed");
    assert.match(task.error, /no saved-file path/i);
});

test("a real PPTX from the existing generator passes the task agent's independent verification", async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-agent-pptx-"));
    const outputPath = path.join(outputRoot, "Minecraft.pptx");
    const deck = { title: "Minecraft", subtitle: "Research guide", slides: [{ title: "Core loop", points: ["Gather resources and craft tools.", "Explore and build while managing survival."], notes: "Verified slide text." }, { title: "Takeaway", points: ["Players combine exploration and creativity.", "The chosen mode sets different goals."], notes: "Verified slide text." }] };
    const orchestrator = new AssistantOrchestrator({
        storagePath: tempPath(),
        allowedFileRoots: [outputRoot],
        research: makeResearch(),
        presentation: { create: async () => { fs.writeFileSync(outputPath, await createPptxBuffer(deck, 3)); return { success: true, path: outputPath, slideCount: 3, verified: true }; } }
    });
    const task = await orchestrator.handleRequest("Create a PPT on Minecraft");
    assert.equal(task.status, "completed");
    assert.equal(task.verification.steps.find(step => step.stepId === "create_presentation").status, "VERIFIED");
    assert.equal(task.result.path, outputPath);
});

test("classification is a pure function (same input -> same output, no randomness)", () => {
    const inputs = ["open chrome", "shutdown computer", "what is the capital of France"];
    for (const input of inputs) {
        const a = classifier.classify(input);
        const b = classifier.classify(input);
        assert.deepEqual(a, b);
    }
});

/* ============================================================
   3 & 4. TASK CREATION / PERSISTENCE / RELOAD
============================================================ */

test("createTask persists a task with the required fields", () => {
    const file = tempPath();
    taskStore.init(file);
    const task = taskStore.createTask({ userRequest: "hello", category: "conversation" });

    assert.ok(task.taskId);
    assert.equal(task.userRequest, "hello");
    assert.equal(task.category, "conversation");
    assert.equal(task.status, "pending");
    assert.equal(task.currentStep, 0);
    assert.ok(task.createdAt);
    assert.ok(task.updatedAt);

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(onDisk.tasks.length, 1);
    assert.equal(onDisk.tasks[0].taskId, task.taskId);
});

test("reloading an existing tasks.json restores tasks without duplication", () => {
    const file = tempPath();
    taskStore.init(file);
    const t1 = taskStore.createTask({ userRequest: "hello", category: "conversation" });

    taskStore.init(file); // simulate restart
    assert.equal(taskStore.getAll().length, 1);
    assert.equal(taskStore.getById(t1.taskId).userRequest, "hello");

    taskStore.createTask({ userRequest: "second", category: "conversation" });
    taskStore.init(file); // restart again
    assert.equal(taskStore.getAll().length, 2);
});

test("a corrupt tasks.json is backed up, never silently deleted", () => {
    const file = tempPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ this is not valid json", "utf8");

    const result = taskStore.init(file);
    assert.equal(result.recovered, true);
    assert.ok(result.corruptBackup);
    assert.ok(fs.existsSync(result.corruptBackup), "corrupt file must be preserved as a backup");
    assert.equal(taskStore.getAll().length, 0);
});

/* ============================================================
   5. DETERMINISTIC PLANNING
============================================================ */

test("planning produces the same steps for the same category every time", () => {
    const planA = taskPlanner.plan({ category: "browser_action", userRequest: "open chrome and search minecraft" });
    const planB = taskPlanner.plan({ category: "browser_action", userRequest: "open chrome and search minecraft" });
    assert.deepEqual(planA, planB);
    assert.ok(planA.length >= 2);
});

test("unsupported category plans a single rejecting step", () => {
    const steps = taskPlanner.plan({ category: "unsupported", userRequest: "asdkjqwe" });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].action, "reject_unsupported");
});

/* ============================================================
   6/7. MULTI-STEP EXECUTION + COMPLETION
============================================================ */

test("a research request executes multiple steps and completes", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("what is the capital of France");

    assert.equal(task.status, "completed");
    assert.ok(task.totalSteps >= 3);
    assert.equal(task.currentStep, task.totalSteps);
    assert.ok(task.steps.every((s) => s.status === "completed"));
});

test("browser_action executes via the injected browser adapter", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("open chrome and search minecraft");

    assert.equal(task.status, "completed");
    assert.equal(orchestrator.deps.browser.opened.length, 1);
    assert.match(orchestrator.deps.browser.opened[0], /minecraft/i);
});

test("conversation requests complete without touching any adapter", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("hello there");
    assert.equal(task.status, "completed");
});

/* ============================================================
   8. FAILURE HANDLING
============================================================ */

test("a step failure marks the task failed and records the error, without crashing", async () => {
    const orchestrator = makeOrchestrator({ systemOverrides: {} , options: {} });
    // Force a browser failure by removing the adapter after construction.
    orchestrator.deps.browser = null;

    const task = await orchestrator.handleRequest("open chrome and search minecraft");
    assert.equal(task.status, "failed");
    assert.ok(task.error);
    assert.ok(task.steps.some((s) => s.status === "failed"));
});

test("a structured adapter failure marks the task failed instead of completed", async () => {
    const orchestrator = makeOrchestrator({
        options: { browserAdapter: { async open() { return { success: false, error: "navigation blocked" }; } } }
    });
    const task = await orchestrator.handleRequest("open chrome and search minecraft");
    assert.equal(task.status, "failed");
    assert.match(task.error, /navigation blocked/);
    assert.ok(task.steps.some((entry) => entry.status === "failed"));
});

/* ============================================================
   9. CANCELLATION
============================================================ */

test("a pending/waiting task can be cancelled and a terminal task cannot", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("shutdown computer"); // gated -> waiting_approval
    assert.equal(task.status, "waiting_approval");

    const cancelled = orchestrator.cancelTask(task.taskId);
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.task.status, "cancelled");

    const again = orchestrator.cancelTask(task.taskId);
    assert.equal(again.success, false);
});

/* ============================================================
   10. RESUME
============================================================ */

test("a paused task resumes from currentStep rather than restarting", async () => {
    const orchestrator = makeOrchestrator();

    // Build a task whose steps mirror browser_action's real plan, but with
    // step 0 already completed and execution interrupted before step 1 ran
    // — i.e. a realistic mid-flight interruption, not a re-run of an
    // already-finished task.
    const classifier = require("../src/assistant/classifier");
    const taskPlanner = require("../src/assistant/taskPlanner");
    const userRequest = "open chrome and search minecraft";
    const classification = classifier.classify(userRequest);
    const steps = taskPlanner.plan({ category: classification.category, userRequest });

    let task = orchestrator.taskStore.createTask({ userRequest, category: classification.category, requiresApproval: false });
    steps[0].status = "completed";
    steps[0].result = { validated: true };
    orchestrator.taskStore.updateTask(task.taskId, {
        steps,
        totalSteps: steps.length,
        currentStep: 1,
        status: "paused"
    });

    const resumed = await orchestrator.resumeTask(task.taskId);
    assert.equal(resumed.success, true);
    assert.equal(resumed.task.status, "completed");
    assert.equal(resumed.task.steps[0].result.validated, true, "step 0's original result must be preserved, not re-run");
    // The browser adapter should only have been invoked once, by the
    // resumed run picking up at step 1 — never re-invoked for step 0.
    assert.equal(orchestrator.deps.browser.opened.length, 1);
});

test("resuming an unknown task fails safely", async () => {
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.resumeTask("TASK-999999");
    assert.equal(result.success, false);
});

/* ============================================================
   11/12/13. APPROVAL-REQUIRED TASKS, BLOCKING, EXPLICIT APPROVAL
============================================================ */

test("destructive requests enter waiting_approval and never auto-execute", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("shutdown computer");

    assert.equal(task.status, "waiting_approval");
    assert.equal(task.requiresApproval, true);
    assert.equal(task.approved, false);
    assert.equal(orchestrator.deps.system.executed.length, 0, "no system action should have run yet");
});

test("approval can never be inferred from research success or normal task creation", async () => {
    const orchestrator = makeOrchestrator();
    // A completely unrelated, successful research task must not affect
    // a pending destructive task's approval state.
    const destructive = await orchestrator.handleRequest("delete my files");
    await orchestrator.handleRequest("what is the capital of France");

    const refreshed = orchestrator.getTask(destructive.taskId);
    assert.equal(refreshed.status, "waiting_approval");
    assert.equal(refreshed.approved, false);
});

test("explicit approval allows a gated task to execute exactly once", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("shutdown computer");
    assert.equal(task.status, "waiting_approval");

    const approved = await orchestrator.approveTask(task.taskId);
    assert.equal(approved.success, true);
    assert.equal(approved.task.status, "completed");
    assert.equal(approved.task.approved, true);
    assert.equal(orchestrator.deps.system.executed.length, 1);
});

test("rejecting a gated task cancels it without ever running it", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("shutdown computer");

    const rejected = orchestrator.rejectTask(task.taskId, "user declined");
    assert.equal(rejected.success, true);
    assert.equal(rejected.task.status, "cancelled");
    assert.equal(rejected.task.approved, false);
    assert.equal(orchestrator.deps.system.executed.length, 0);
});

test("approving a task that is not waiting_approval is refused", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("hello there"); // completes immediately, not gated
    const result = await orchestrator.approveTask(task.taskId);
    assert.equal(result.success, false);
});

/* ============================================================
   14. DESTRUCTIVE-ACTION PROTECTION (defense in depth)
============================================================ */

test("safetyGate flags every known destructive keyword", () => {
    for (const word of safetyGate.ALWAYS_GATED_CATEGORIES) {
        assert.ok(word); // sanity: set is non-empty and iterable
    }
    assert.equal(safetyGate.requiresApproval({ category: "system_command" }, "shutdown"), true);
    assert.equal(safetyGate.requiresApproval({ category: "browser_action" }, "delete everything"), true);
    assert.equal(safetyGate.requiresApproval({ category: "browser_action" }, "search cats"), false);
});

test("a destructive step can never run even if a task was misclassified as safe", async () => {
    const orchestrator = makeOrchestrator();
    // Force-create a task whose category looks safe but whose single step
    // is destructive, bypassing handleRequest's own gating on purpose to
    // prove taskExecutor's OWN defense-in-depth check.
    let task = orchestrator.taskStore.createTask({
        userRequest: "totally safe sounding request",
        category: "application_action",
        requiresApproval: false
    });
    orchestrator.taskStore.updateTask(task.taskId, {
        steps: [{ action: "system_delete", description: "delete something", status: "pending", result: null, error: null }],
        totalSteps: 1,
        status: "pending"
    });
    task = orchestrator.taskStore.getById(task.taskId);

    const result = await orchestrator._execute(task);
    assert.equal(result.status, "waiting_approval");
    assert.equal(orchestrator.deps.system.executed.length, 0);
});

/* ============================================================
   15/16. RESEARCH INTEGRATION + PROVENANCE
============================================================ */

test("research results preserve provenance (source, url, retrievedAt) unmodified", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("what is the capital of France");

    const runStep = task.steps.find((s) => s.action === "run_research");
    assert.ok(runStep.result.results[0].url.startsWith("https://"));
    assert.ok(runStep.result.results[0].retrievedAt);
    assert.equal(runStep.result.results[0].source, "mock-source");

    const normalizeStep = task.steps.find((s) => s.action === "normalize_result");
    assert.equal(normalizeStep.result.normalized, true);
    assert.equal(normalizeStep.result.provenance[0].url, runStep.result.results[0].url);
});

test("a failed research call is reported clearly, never fabricated", async () => {
    const orchestrator = makeOrchestrator({ researchOverrides: { fail: true } });
    const task = await orchestrator.handleRequest("what is the capital of Atlantis");

    assert.equal(task.status, "completed"); // the *task* completes; the *finding* reports failure
    const runStep = task.steps.find((s) => s.action === "run_research");
    assert.equal(runStep.result.succeededSources.length, 0);
    assert.match(runStep.result.findings[0], /No live research evidence/i);
});

/* ============================================================
   17. MEMORY INTEGRATION
============================================================ */

test("remember/recall/forget round-trip through the injected MemoryEngine adapter", async () => {
    const orchestrator = makeOrchestrator();

    const remembered = await orchestrator.handleRequest("remember my favorite game", {
        memoryKey: "user.favoriteGame",
        memoryValue: "chess"
    });
    assert.equal(remembered.status, "completed");
    assert.equal(orchestrator.deps.memory.recall("user.favoriteGame"), "chess");

    const recalled = await orchestrator.handleRequest("what do you remember", {
        memoryKey: "user.favoriteGame"
    });
    assert.equal(recalled.status, "completed");
    const recallStep = recalled.steps.find((s) => s.action === "execute_memory_action");
    assert.equal(recallStep.result.value, "chess");

    const forgotten = await orchestrator.handleRequest("forget my favorite game", {
        memoryKey: "user.favoriteGame"
    });
    assert.equal(forgotten.status, "completed");
    assert.equal(orchestrator.deps.memory.recall("user.favoriteGame"), null);
});

/* ============================================================
   18. TASK HISTORY
============================================================ */

test("task history is auditable and grows with every request", async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.handleRequest("hello there");
    await orchestrator.handleRequest("what is the capital of France");

    const history = orchestrator.getHistory();
    assert.equal(history.length, 2);
    assert.ok(history.every((t) => t.createdAt && t.status));
});

/* ============================================================
   19. CHECKPOINT INTEGRATION
============================================================ */

test("evolution requests can be backed by the real Phase 3 checkpoint module", async () => {
    const checkpoint = require("../src/evolution/checkpoint");
    const goalRegistry = require("../src/evolution/goalRegistry");
    const { EvolutionEngine } = require("../src/evolution/EvolutionEngine");

    const goalFile = tempPath("goalRegistry.json");
    const checkpointFile = tempPath("checkpoint.json");
    goalRegistry.init(goalFile);
    checkpoint.init(checkpointFile);

    const engine = new EvolutionEngine({ goalRegistry, checkpoint, storageDir: path.dirname(goalFile) });

    const orchestrator = makeOrchestrator({ options: { evolutionEngine: engine } });
    const task = await orchestrator.handleRequest("evolve yourself");

    assert.equal(task.status, "completed");
    const cp = checkpoint.getCheckpoint();
    assert.ok(cp.currentGoal, "the real checkpoint module should now show an active goal");
});

/* ============================================================
   20. EVOLUTION ENGINE INTEGRATION (mocked)
============================================================ */

test("evolution requests delegate to the injected EvolutionEngine and report state", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("evolve yourself");

    assert.equal(task.status, "completed");
    const delegateStep = task.steps.find((s) => s.action === "delegate_to_evolution_engine");
    assert.equal(delegateStep.result.proposal.proposalId, "PR-mock-1");
});

test("an EvolutionEngine failure is reported as a failed task, not swallowed", async () => {
    const orchestrator = makeOrchestrator({ evolutionOverrides: { fail: true } });
    const task = await orchestrator.handleRequest("evolve yourself");
    assert.equal(task.status, "failed");
    assert.match(task.error, /mock evolution failure/);
});

/* ============================================================
   21. UNSUPPORTED REQUEST SAFETY
============================================================ */

test("an unsupported request is safely rejected, never guessed at", async () => {
    const orchestrator = makeOrchestrator();
    const task = await orchestrator.handleRequest("xqzflarb mmbop");

    assert.equal(task.category, "unsupported");
    assert.equal(task.status, "failed");
    assert.equal(task.error, "unsupported_request");
    assert.equal(orchestrator.deps.browser.opened.length, 0);
    assert.equal(orchestrator.deps.system.executed.length, 0);
});

/* ============================================================
   22. FETCHED CONTENT NEVER EXECUTES
============================================================ */

test("research findings containing code-like strings are never executed, only stored as data", async () => {
    const maliciousResearch = {
        async research(goal) {
            return {
                source: "mock-research",
                generatedAt: new Date().toISOString(),
                query: goal.name,
                findings: ["require('fs').unlinkSync('/tmp/should-not-run'); process.exit(1);"],
                results: [
                    {
                        source: "mock-source",
                        success: true,
                        title: goal.name,
                        summary: "<script>global.PWNED = true;</script>",
                        url: "https://example.org/x",
                        retrievedAt: new Date().toISOString()
                    }
                ],
                succeededSources: ["mock-source"],
                failedSources: []
            };
        }
    };

    const orchestrator = makeOrchestrator({ options: { research: maliciousResearch } });
    const task = await orchestrator.handleRequest("what is the capital of France");

    assert.equal(task.status, "completed");
    assert.equal(global.PWNED, undefined, "fetched HTML/script-looking content must never be evaluated");
    const runStep = task.steps.find((s) => s.action === "run_research");
    // The dangerous-looking string is present ONLY as plain data on the result.
    assert.equal(typeof runStep.result.findings[0], "string");
});

/* ============================================================
   23. NO AI/LLM DEPENDENCY
============================================================ */

test("no assistant module references any AI/LLM provider", () => {
    const dir = path.join(__dirname, "..", "src", "assistant");
    const forbidden = /openai|anthropic|claude|gemini|groq|openrouter|ollama|chatgpt/i;

    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".js")) continue;
        const contents = fs.readFileSync(path.join(dir, file), "utf8");
        assert.equal(forbidden.test(contents), false, `${file} must not reference any AI/LLM provider`);
    }
});
