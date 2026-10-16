"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WindowsComputerUse, validate } = require("../src/system/windowsComputerUse");

test('PowerShell typing enumerates Unicode characters and supplies key state', t => {
    if (process.platform !== 'win32') return t.skip('Windows only');
    const { execFileSync } = require('child_process');
    const { powerShellScript } = require('../src/system/windowsComputerUse');
    const text = 'hello world नमस्ते';
    let script = powerShellScript(Buffer.from(JSON.stringify({action:'typeText',text})).toString('base64'));
    // Replace native input with a recording stub: no desktop interaction.
    script = script.replace(/Add-Type @'[\s\S]*?'@/, "Add-Type @'\nusing System.Text; public static class JarvisComputerInput { public static StringBuilder Typed = new StringBuilder(); public static bool Unicode(char c, bool up) { if (!up) Typed.Append(c); return true; } }\n'@");
    script += '\n@{text=[JarvisComputerInput]::Typed.ToString()} | ConvertTo-Json -Compress';
    const output = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(JSON.parse(output.trim().split(/\r?\n/).at(-1)).text, text);
});

test('PowerShell cursor movement does not resolve the built-in Move-Item alias', t => {
    if (process.platform !== 'win32') return t.skip('Windows only');
    const { execFileSync } = require('child_process');
    const { powerShellScript } = require('../src/system/windowsComputerUse');
    let script = powerShellScript(Buffer.from(JSON.stringify({action:'click',x:100,y:200})).toString('base64'));
    script = script.replace(/Add-Type @'[\s\S]*?'@/, "Add-Type @'\npublic static class JarvisComputerInput { public const uint MOUSE_LEFTDOWN=2, MOUSE_LEFTUP=4; public static bool SetCursorPos(int x,int y) { return x==100 && y==200; } public static void Mouse(uint flags,uint data) {} }\n'@");
    const output = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(JSON.parse(output.trim()).ok,true);
});

test("computer use requires an active session", async () => {
    const control = new WindowsComputerUse({ platform: "win32", runner: async () => ({ success: true }) });
    const result = await control.perform("click", { x: 10, y: 20 });
    assert.equal(result.success, false);
    assert.match(result.error, /Start Computer Use mode/);
});

test("computer use allows a bounded click after explicit session start", async () => {
    const calls = [];
    const control = new WindowsComputerUse({ platform: "win32", runner: async (payload) => { calls.push(payload); return { success: true, data: { ok: true } }; } });
    assert.equal(control.startSession().success, true);
    const result = await control.perform("click", { x: 10, y: 20 });
    assert.equal(result.success, true);
    assert.deepEqual(calls, [{ action: "click", x: 10, y: 20 }]);
});

test("accessibility inspection returns native UI elements only during an active session", async () => {
    const control = new WindowsComputerUse({
        platform: "win32",
        runner: async () => ({ success: true }),
        accessibilityRunner: async () => ({ success: true, data: { items: [{ name: "Save", controlType: "Button", x: 10, y: 20, width: 80, height: 30 }] } })
    });
    const blocked = await control.inspectAccessibility();
    assert.equal(blocked.success, false);
    control.startSession();
    const result = await control.inspectAccessibility();
    assert.equal(result.success, true);
    assert.equal(result.data.items[0].name, "Save");
});

test("accessibility inspection exposes the focused window and control metadata", async () => {
    const control = new WindowsComputerUse({
        platform: "win32",
        runner: async () => ({ success: true }),
        accessibilityRunner: async () => ({ success: true, data: {
            items: [{ name: "Document", value: "hello", windowName: "Untitled - Notepad", focusedWindowName: "Untitled - Notepad", keyboardFocused: true, controlType: "ControlType.Document" }]
        } })
    });
    control.startSession();
    const result = await control.inspectAccessibility();
    assert.deepEqual(result.data.focusedWindow, { name: "Untitled - Notepad" });
    assert.equal(result.data.focusedControl.name, "Document");
});

test("computer action failures preserve the real Windows reason", async () => {
    const control = new WindowsComputerUse({ platform: "win32", runner: async () => ({ success: false, error: "Windows input was rejected because the desktop session is locked." }) });
    control.startSession();
    const result = await control.perform("click", { x: 10, y: 20 });
    assert.equal(result.success, false);
    assert.match(result.error, /desktop session is locked/);
});

test("drag is bounded and requires approval", async () => {
    const calls = [];
    const control = new WindowsComputerUse({ platform: "win32", runner: async (payload) => { calls.push(payload); return { success: true }; } });
    control.startSession();
    const blocked = await control.perform("drag", { x: 10, y: 20, x2: 300, y2: 400 });
    assert.equal(blocked.requiresApproval, true);
    const allowed = await control.perform("drag", { x: 10, y: 20, x2: 300, y2: 400 }, { approved: true });
    assert.equal(allowed.success, true);
    assert.deepEqual(calls, [{ action: "drag", x: 10, y: 20, x2: 300, y2: 400 }]);
});

test("typing and hotkeys require action-time approval", async () => {
    const control = new WindowsComputerUse({ platform: "win32", runner: async () => ({ success: true }) });
    control.startSession();
    const blocked = await control.perform("typeText", { text: "hello" });
    assert.equal(blocked.success, false);
    assert.equal(blocked.requiresApproval, true);
    const allowed = await control.perform("typeText", { text: "hello" }, { approved: true });
    assert.equal(allowed.success, true);
});

test("validation rejects arbitrary or oversized input", () => {
    assert.throws(() => validate("runShell", {}), /Unsupported computer-use action/);
    assert.throws(() => validate("click", { x: -1, y: 20 }), /x must be an integer/);
    assert.throws(() => validate("typeText", { text: "x".repeat(2001) }), /1-2000/);
    assert.throws(() => validate("pressKey", { key: "DeleteEverything" }), /allowlisted/);
});

test("emergency stop invalidates the session", async () => {
    const control = new WindowsComputerUse({ platform: "win32", runner: async () => ({ success: true }) });
    control.startSession();
    assert.equal(control.stopSession().data.active, false);
    const result = await control.perform("click", { x: 1, y: 1 });
    assert.equal(result.success, false);
});
