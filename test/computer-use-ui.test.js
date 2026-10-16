const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ui = fs.readFileSync("renderer/js/computerUseUI.js", "utf8");
const css = fs.readFileSync("renderer/css/style.css", "utf8");
const refreshedCss = fs.readFileSync("renderer/css/ui-refresh.css", "utf8");

test("Computer Use UI exposes screen inspection without bypassing approvals", () => {
    assert.match(ui, /data-cu-inspect/);
    assert.match(ui, /JARVISScreenShare/);
    assert.match(ui, /data-cu-locate/);
    assert.match(ui, /Locate target/);
    assert.match(ui, /locateAndApproveClick/);
    assert.match(ui, /requiresApproval/);
    assert.match(ui, /Allow once/);
});

test("Computer Use active state has the blue focus frame", () => {
    assert.match(ui, /computer-use-focus-frame/);
    assert.match(css, /\.computer-use-focus-frame/);
    assert.match(css, /rgba\(77,176,255/);
});

test("Computer Use UI exposes adaptive workflow progress", () => {
    assert.match(ui, /data-cu-workflow-status/);
    assert.match(ui, /setWorkflowStatus/);
    assert.match(css, /computer-use-workflow-status/);
    assert.match(ui, /data-cu-mission-board/);
    assert.match(css, /computer-use-mission-board/);
});

test("Computer Use UI exposes explainable decision evidence for demos", () => {
    assert.match(ui, /JARVIS DECISION EVIDENCE/);
    assert.match(ui, /data-cu-confidence/);
    assert.match(ui, /data-cu-verification/);
    assert.match(ui, /Decision trace live/);
});

test("Computer Use UI exposes the voice-first Autopilot experience", () => {
    assert.match(ui, /JARVIS AUTOPILOT MODE/);
    assert.match(ui, /data-cu-access-toggle/);
    assert.match(ui, /setAccessMode/);
    assert.match(refreshedCss, /accessos-mode/);
});

test("Autopilot starts screen inspection through the voice-first snapshot path", () => {
    const screenShare = fs.readFileSync("renderer/js/screenShare.js", "utf8");
    assert.match(screenShare, /async function start\(options = \{\}\)/);
    assert.match(screenShare, /options\?\.autopilot/);
    assert.match(ui, /vision\.start\(\{ autopilot: true \}\)/);
});

test("Autopilot watcher continues native inspection when screen capture is unavailable", () => {
    assert.match(ui, /Native UI Automation is a first-class observation source/);
    assert.doesNotMatch(ui, /state\.watchInFlight \|\| !vision\.isActive\?\.\(\)/);
});

test("desktop actions attach UI Automation verification evidence", () => {
    assert.match(ui, /async function readAccessibilityState/);
    assert.match(ui, /verification/);
    assert.match(ui, /UI state not confirmed/);
    assert.match(ui, /focusedWindow/);
});

test("keyboard actions require a focused UI Automation window before sending input", () => {
    assert.match(ui, /waitForFocusedAccessibilityState/);
    assert.match(ui, /Windows did not expose a focused application/);
});

function uiRuntime(locate, accessibilityItems = []) {
    const elements = new Map();
    const element = name => {
        if (!elements.has(name)) elements.set(name, { hidden: true, style: {}, dataset: {}, classList: { toggle() {} }, value: "", setAttribute() {}, addEventListener() {}, focus() {}, querySelector: element });
        return elements.get(name);
    };
    let active = true;
    const calls = [];
    const context = {
        document: { getElementById: element, createElement: element, body: { appendChild() {}, classList: { toggle() {}, remove() {} } } },
        window: {
            screen: { width: 1920, height: 1080 },
            jarvis: { computerUse: {
                status: async () => ({ active }), start: async () => ({ success: true }),
                stop: async () => { active = false; return { success: true }; },
                inspectAccessibility: async () => ({ success: true, data: { items: accessibilityItems } }),
                perform: async (...args) => { calls.push(args); return { success: true }; }
            } },
            JARVISScreenShare: { isActive: () => true, locateTarget: locate }
        }
    };
    vm.createContext(context); vm.runInContext(ui, context);
    return { control: context.window.JARVISComputerUse, element, calls };
}
const target = () => ({ success: true, visible: true, confidence: .9, centerX: .5, centerY: .5, target: "Play" });
test("an unfocused editor without usable bounds cannot receive text", async () => {
    const r = uiRuntime(async () => ({ success: false, error: "label not found" }), [
        { name: "Untitled - Notepad", windowName: "Untitled - Notepad", controlType: "ControlType.Window", keyboardFocused: true },
        { name: "Document", windowName: "Untitled - Notepad", controlType: "ControlType.Document", keyboardFocused: false, keyboardFocusable: true }
    ]);
    await r.control.start();
    await r.control.setAccessMode(true);
    const result = await r.control.locateAndApproveType("the editable text area in notepad", "Hello World");
    assert.equal(result.success, false);
    assert.equal(result.actionAttempted, false);
    assert.equal(result.retryable, false);
    assert.match(result.error, /focus or usable bounds/);
    assert.equal(r.calls.length, 0);
});
test("visual click requires approval before any desktop input", async () => {
    const r = uiRuntime(async () => target());
    await r.control.start();
    const pending = r.control.locateAndApproveClick("Play");
    await new Promise(setImmediate);
    assert.equal(r.calls.length, 0);
    r.element("[data-cu-confirm-allow]").onclick();
    assert.equal((await pending).success, true);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0][2], true);
});
test("emergency stop cancels an open approval", async () => {
    const r = uiRuntime(async () => target());
    await r.control.start();
    const pending = r.control.locateAndApproveClick("Play");
    await new Promise(setImmediate);
    await r.control.stop();
    assert.equal((await pending).success, false);
    assert.equal(r.calls.length, 0);
});
test("scan completing after emergency stop cannot click", async () => {
    let release;
    const r = uiRuntime(() => new Promise(resolve => { release = resolve; }));
    await r.control.start();
    const pending = r.control.locateAndApproveClick("Play");
    await r.control.stop(); release(target());
    assert.equal((await pending).success, false);
    assert.equal(r.calls.length, 0);
});

test("typing preserves more than 200 characters and rejects overflow before clicking", async () => {
    const r = uiRuntime(async () => target());
    await r.control.start();
    r.control.setAccessMode(true);
    const text = "Hello world ".repeat(80);
    assert.equal((await r.control.locateAndApproveType("editor", text)).success, true);
    assert.equal(r.calls[1][1].text, text);
    const count = r.calls.length;
    assert.equal((await r.control.locateAndApproveType("editor", "x".repeat(2001))).success, false);
    assert.equal(r.calls.length, count);
});
test("uncertain targets cannot produce desktop input", async () => {
    const r = uiRuntime(async () => ({...target(), confidence:.3}));
    await r.control.start(); r.control.setAccessMode(true);
    assert.equal((await r.control.locateAndApproveClick("Play")).success, false);
    assert.equal(r.calls.length, 0);
});
test("native coordinates are not rescaled through browser display size", async () => {
    const r = uiRuntime(async () => ({...target(), source:'accessibility', desktopPoint:{x:2400,y:1000}}));
    await r.control.start(); r.control.setAccessMode(true);
    assert.equal((await r.control.locateAndApproveClick("editor")).success, true);
    assert.equal(r.calls[0][1].x, 2400);
});
test("native foreground apps can type when their editor is missing from UI Automation", async () => {
    const r = uiRuntime(async () => ({ success: false, error: "No visual stream" }), [
        { name: "Untitled - Notepad", windowName: "Untitled - Notepad", controlType: "ControlType.Window", keyboardFocused: true, width: 1200, height: 700 }
    ]);
    await r.control.start();
    await r.control.setAccessMode(true);
    const result = await r.control.locateAndApproveType("the editable text area in notepad", "Hello World");
    assert.equal(result.success, true);
    assert.equal(result.focusedAppFallback, true);
    assert.equal(r.calls.at(-1)[0], "typeText");
    assert.equal(r.calls.at(-1)[1].text, "Hello World");
});

test("a uniquely exposed native editor bypasses a failed semantic click", async () => {
    const r = uiRuntime(async () => ({ success: false, error: "label not found" }), [
        { name: "Untitled - Notepad", windowName: "Untitled - Notepad", controlType: "ControlType.Window", keyboardFocused: true, width: 1200, height: 700 },
        { name: "Document", windowName: "Untitled - Notepad", controlType: "ControlType.Document", keyboardFocused: true, keyboardFocusable: true, width: 900, height: 500, x: 100, y: 100 }
    ]);
    await r.control.start();
    await r.control.setAccessMode(true);
    const result = await r.control.locateAndApproveType("the editable text area in notepad", "Hello World");
    assert.equal(result.success, true);
    assert.equal(result.focusedAppFallback, true);
    assert.equal(r.calls.at(-1)[0], "typeText");
});
