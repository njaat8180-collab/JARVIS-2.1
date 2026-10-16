const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("renderer/js/brain/visualWorkflowEngine.js", "utf8");

test("workflow planner normalizes safe targets before any computer action", () => {
    const context = { window: {}, setTimeout, clearTimeout, Promise };
    vm.createContext(context);
    vm.runInContext(source, context);
    const plan = context.window.JARVISVisualWorkflow.plan({ name: "store task", steps: [
        { label: "Search", target: " Search box ", alternatives: ["Search", "Search", " Find "] }
    ] });
    assert.equal(plan.success, true);
    assert.equal(plan.total, 1);
    assert.deepEqual(Array.from(plan.steps[0].alternatives), ["Search box", "Search", "Find"]);
});

test("visual workflow retries failed targets but stops at a bounded limit", async () => {
    let calls = 0;
    const context = { window: { JARVISComputerUse: { isActive: () => true, locateAndApproveClick: async () => { calls++; return calls < 2 ? { success: false, error: "target moved" } : { success: true }; } } }, setTimeout, clearTimeout, Promise };
    vm.createContext(context);
    vm.runInContext(source, context);
    const result = await context.window.JARVISVisualWorkflow.run({ steps: [{ label: "button", target: "Save", afterMs: 0 }] }, { maxAttempts: 2, retryDelayMs: 0, afterMs: 0 });
    assert.equal(result.success, true);
    assert.equal(calls, 2);
});

test("visual workflow fails closed when Computer Use is inactive", async () => {
    const context = { window: { JARVISComputerUse: { isActive: () => false } }, setTimeout, clearTimeout, Promise };
    vm.createContext(context);
    vm.runInContext(source, context);
    const result = await context.window.JARVISVisualWorkflow.run({ steps: [{ label: "button", target: "Save" }] });
    assert.equal(result.success, false);
    assert.match(result.error, /Start Computer Use/);
});

test("visual workflow verifies the next screen state before completing a step", async () => {
    let clicks = 0;
    const located = [];
    const context = {
        window: {
            JARVISComputerUse: {
                isActive: () => true,
                locateAndApproveClick: async () => { clicks++; return { success: true }; },
                setWorkflowStatus: () => {}
            },
            JARVISScreenShare: {
                locateTarget: async (target) => { located.push(target); return { success: true, visible: true, confidence: 0.91 }; }
            }
        },
        setTimeout, clearTimeout, Promise, Date
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const result = await context.window.JARVISVisualWorkflow.run({
        steps: [{ label: "Open", target: "Open button", verify: { target: "Opened panel" }, afterMs: 0 }]
    }, { maxAttempts: 1, retryDelayMs: 0, afterMs: 0 });
    assert.equal(result.success, true);
    assert.equal(clicks, 1);
    assert.deepEqual(located, ["Opened panel"]);
    assert.equal(result.completed[0].verified, true);
});

test("native focused typing can complete without an impossible visual verification", async () => {
    let typed = 0, inspected = 0;
    const engine = workflowContext({
        isAutopilotActive: () => true,
        locateAndApproveClick: async () => ({ success: false }),
        locateAndApproveType: async () => { typed++; return { success: true, focusedAppFallback: true }; }
    }, { isActive: () => false, locateTarget: async () => { inspected++; return { success: false }; } });
    const result = await engine.run({ steps: [{ label: "Notepad text", target: "the editable text area in notepad", action: "typeText", text: "Hello World", verify: { target: "the text Hello World" }, afterMs: 0 }] }, { maxAttempts: 1, afterMs: 0 });
    assert.equal(result.success, true);
    assert.equal(typed, 1);
    assert.equal(inspected, 0);
    assert.equal(result.nativeOnly, true);
});

test("native focused typing stays successful when screen sharing is active", async () => {
    let typed = 0;
    const engine = workflowContext({
        locateAndApproveClick: async () => ({ success: false }),
        locateAndApproveType: async () => { typed++; return { success: true, focusedAppFallback: true }; }
    }, { isActive: () => true, locateTarget: async () => ({ success: false }) });
    const result = await engine.run({ steps: [{ label: "Notepad text", target: "the editable text area in notepad", action: "typeText", text: "Hello World", verify: { target: "the text Hello World" }, afterMs: 0 }] }, { maxAttempts: 1, afterMs: 0 });
    assert.equal(result.success, true);
    assert.equal(typed, 1);
    assert.equal(result.nativeOnly, true);
});

test("visual workflow does not repeat an ambiguous side effect", async () => {
    let clicks = 0;
    const context = {
        window: {
            JARVISComputerUse: {
                isActive: () => true,
                locateAndApproveClick: async () => { clicks++; return { success: true }; },
                setWorkflowStatus: () => {}
            },
            JARVISScreenShare: {
                locateTarget: async () => ({ success: true, visible: false, confidence: 0.2 })
            }
        },
        setTimeout, clearTimeout, Promise, Date
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const result = await context.window.JARVISVisualWorkflow.run({
        steps: [{ label: "Submit", target: "Submit button", verify: { target: "Success screen" }, afterMs: 0 }]
    }, { maxAttempts: 3, retryDelayMs: 0, afterMs: 0 });
    assert.equal(result.success, false);
    assert.equal(clicks, 1);
    assert.match(result.error, /stopped safely/i);
});

function workflowContext(computer, vision = {}) {
    const context = { window: { JARVISComputerUse: { isActive: () => true, ...computer }, JARVISScreenShare: vision }, setTimeout, clearTimeout, Promise, Date };
    vm.createContext(context); vm.runInContext(source, context);
    return context.window.JARVISVisualWorkflow;
}
test("stop during a scan prevents subsequent workflow actions", async () => {
    let release, clicks = 0;
    const engine = workflowContext({ locateAndApproveClick: async () => { clicks++; await new Promise(resolve => { release = resolve; }); return { success: true }; } });
    const running = engine.run({ steps: [{ target: "First" }, { target: "Second" }] }, { afterMs: 0 });
    engine.cancel(); release();
    const result = await running;
    assert.equal(result.cancelled, true);
    assert.equal(clicks, 1);
    assert.equal(engine.isRunning(), false);
});
test("concurrent workflows are rejected; exceptions clear the running state", async () => {
    let release;
    const engine = workflowContext({ locateAndApproveClick: async () => { await new Promise(resolve => { release = resolve; }); throw new Error("action outcome unknown"); } });
    const running = engine.run({ steps: [{ target: "First" }] });
    assert.equal((await engine.run({ steps: [{ target: "Second" }] })).success, false);
    release(); assert.equal((await running).success, false);
    assert.equal(engine.isRunning(), false);
});
test("failed scans and low confidence detections cannot prove disappearance", async () => {
    for (const observation of [{ success: false }, { success: true, visible: false, observedVisible: true, confidence: .2 }]) {
        const engine = workflowContext({}, { locateTarget: async () => observation });
        const result = await engine.waitForTarget("Loading", { visible: false, attempts: 1 });
        assert.equal(result.success, false);
    }
});
test("reported action attempts are never retried and zero delay is respected", async () => {
    let clicks = 0;
    const engine = workflowContext({ locateAndApproveClick: async () => { clicks++; return { success: false, actionAttempted: true, error: "unknown result" }; } });
    assert.equal((await engine.run({ steps: [{ target: "Save" }] }, { retryDelayMs: 0, afterMs: 0 })).success, false);
    assert.equal(clicks, 1);
});
test("safe target alternatives are rescanned before a retry", async () => {
    const queries = [];
    const engine = workflowContext({ locateAndApproveClick: async query => { queries.push(query); return query === "Launch button" ? { success: true } : { success: false, error: "not visible" }; } });
    const result = await engine.run({ steps: [{ target: "Play button", alternatives: ["Launch button"], afterMs: 0 }] }, { maxAttempts: 1, afterMs: 0 });
    assert.equal(result.success, true);
    assert.deepEqual(queries, ["Play button", "Launch button"]);
});

test('task replay retains keyboard actions', async () => {
 let stored = '[]'; const actions = [];
 const ctx = {setTimeout, clearTimeout, Promise, window:{
  localStorage:{getItem:()=>stored,setItem:(_,value)=>{stored=value;}},
  JARVISComputerUse:{isActive:()=>true,performFocusedAction:async(action,params)=>{actions.push({action,params});return {success:true};}}
 }};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const workflow=ctx.window.JARVISVisualWorkflow;
 await workflow.run({steps:[{action:'pressKey',key:'ENTER',afterMs:0},{action:'hotkey',keys:['CTRL','A'],afterMs:0}]});
 const result = await workflow.replayLast();
 assert.equal(result.success,true);
 assert.equal(actions[2].params.key,'ENTER');
 assert.deepEqual(Array.from(actions[3].params.keys),['CTRL','A']);
});
