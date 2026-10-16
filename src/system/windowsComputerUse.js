"use strict";

/**
 * Bounded Windows computer-use primitives.
 *
 * This module intentionally exposes only mouse/keyboard primitives. It does
 * not accept shell commands, executable paths, or PowerShell supplied by the
 * caller. The renderer must explicitly start a Computer Use session, and
 * higher-risk input still requires action-time approval.
 */

const { execFile } = require("child_process");

const ACTIONS = new Set([
    "move",
    "click",
    "drag",
    "doubleClick",
    "rightClick",
    "scroll",
    "typeText",
    "pressKey",
    "hotkey",
    "cursor"
]);

const ALWAYS_APPROVE = new Set(["drag", "doubleClick", "rightClick", "typeText", "pressKey", "hotkey"]);
const MAX_TEXT_LENGTH = 2000;
const MAX_COORDINATE = 32767;

const KEY_ALIASES = new Set([
    "ENTER", "TAB", "ESC", "ESCAPE", "BACKSPACE", "DELETE", "SPACE",
    "UP", "DOWN", "LEFT", "RIGHT", "HOME", "END", "PAGEUP", "PAGEDOWN",
    "INSERT", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    "SHIFT", "CTRL", "CONTROL", "ALT", "CAPSLOCK", "NUMLOCK", "PLUS", "MINUS"
]);

function outcome(success, action, data = {}, error = null, requiresApproval = false) {
    return { success, action, data, error, requiresApproval };
}

function integer(value, name, min = 0, max = MAX_COORDINATE) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new Error(`${name} must be an integer from ${min} to ${max}.`);
    }
    return number;
}

function validate(action, params = {}) {
    if (!ACTIONS.has(action)) throw new Error(`Unsupported computer-use action: ${action}.`);
    if (["move", "click", "doubleClick", "rightClick"].includes(action)) {
        return { x: integer(params.x, "x"), y: integer(params.y, "y") };
    }
    if (action === "drag") {
        return { x: integer(params.x, "x"), y: integer(params.y, "y"), x2: integer(params.x2, "x2"), y2: integer(params.y2, "y2") };
    }
    if (action === "scroll") {
        const x = integer(params.x, "x");
        const y = integer(params.y, "y");
        const delta = integer(params.delta ?? params.scrollY ?? 0, "delta", -10000, 10000);
        if (delta === 0) throw new Error("scroll delta cannot be zero.");
        return { x, y, delta };
    }
    if (action === "typeText") {
        const text = String(params.text ?? "");
        if (!text || text.length > MAX_TEXT_LENGTH) throw new Error(`text must contain 1-${MAX_TEXT_LENGTH} characters.`);
        return { text };
    }
    if (action === "pressKey") {
        const key = String(params.key || "").trim().toUpperCase();
        if (!key || (key.length > 1 && !KEY_ALIASES.has(key))) throw new Error("Only a single key or an allowlisted key name is accepted.");
        return { key };
    }
    if (action === "hotkey") {
        const keys = Array.isArray(params.keys) ? params.keys.map((key) => String(key || "").trim().toUpperCase()).filter(Boolean) : [];
        if (keys.length < 2 || keys.length > 4 || keys.some((key) => key.length > 1 && !KEY_ALIASES.has(key))) {
            throw new Error("hotkey needs 2-4 single-character or allowlisted keys.");
        }
        return { keys };
    }
    return {};
}

function encodePayload(payload) {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function powerShellScript(encodedPayload) {
    return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ProgressPreference = 'SilentlyContinue'
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPayload}')) | ConvertFrom-Json
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class JarvisComputerInput {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] inputs, int cbSize);
  public const uint INPUT_MOUSE=0, INPUT_KEYBOARD=1, MOUSE_LEFTDOWN=0x0002, MOUSE_LEFTUP=0x0004, MOUSE_RIGHTDOWN=0x0008, MOUSE_RIGHTUP=0x0010, MOUSE_WHEEL=0x0800, KEYUP=0x0002, UNICODE=0x0004;
  public static void Mouse(uint flags, uint data=0) { var i = new INPUT { type=INPUT_MOUSE, U=new InputUnion { mi=new MOUSEINPUT { mouseData=data, dwFlags=flags } } }; SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))); }
  public static void Key(ushort vk, bool up=false) { var i = new INPUT { type=INPUT_KEYBOARD, U=new InputUnion { ki=new KEYBDINPUT { wVk=vk, dwFlags=up ? KEYUP : 0 } } }; SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))); }
  public static bool Unicode(char c, bool up=false) { var i = new INPUT { type=INPUT_KEYBOARD, U=new InputUnion { ki=new KEYBDINPUT { wScan=c, dwFlags=UNICODE | (up ? KEYUP : 0) } } }; return SendInput(1, new INPUT[]{i}, Marshal.SizeOf(typeof(INPUT))) == 1; }
}
'@
function KeyCode([string] $key) {
  if ($key.Length -eq 1) { return [byte][char]$key.ToUpperInvariant() }
  $map = @{ENTER=13; TAB=9; ESC=27; ESCAPE=27; BACKSPACE=8; DELETE=46; SPACE=32; UP=38; DOWN=40; LEFT=37; RIGHT=39; HOME=36; END=35; PAGEUP=33; PAGEDOWN=34; INSERT=45; SHIFT=16; CTRL=17; CONTROL=17; ALT=18; CAPSLOCK=20; NUMLOCK=144; PLUS=187; MINUS=189; F1=112; F2=113; F3=114; F4=115; F5=116; F6=117; F7=118; F8=119; F9=120; F10=121; F11=122; F12=123}
  if (-not $map.ContainsKey($key)) { throw "Unsupported key: $key" }
  return [byte]$map[$key]
}
function MoveJarvisCursor([int]$x, [int]$y) { if (-not [JarvisComputerInput]::SetCursorPos($x,$y)) { throw 'Windows rejected the cursor move.' } }
switch ([string]$payload.action) {
  'move' { MoveJarvisCursor $payload.x $payload.y }
  'click' { MoveJarvisCursor $payload.x $payload.y; [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTDOWN, 0); [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTUP, 0) }
  'drag' { MoveJarvisCursor $payload.x $payload.y; [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTDOWN, 0); Start-Sleep -Milliseconds 80; MoveJarvisCursor $payload.x2 $payload.y2; Start-Sleep -Milliseconds 80; [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTUP, 0) }
  'doubleClick' { MoveJarvisCursor $payload.x $payload.y; 1..2 | ForEach-Object { [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTDOWN, 0); [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_LEFTUP, 0); Start-Sleep -Milliseconds 60 } }
  'rightClick' { MoveJarvisCursor $payload.x $payload.y; [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_RIGHTDOWN, 0); [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_RIGHTUP, 0) }
  'scroll' { MoveJarvisCursor $payload.x $payload.y; [JarvisComputerInput]::Mouse([JarvisComputerInput]::MOUSE_WHEEL, [uint32]$payload.delta) }
  'typeText' { $unicodeMethod = [JarvisComputerInput].GetMethod('Unicode'); if ($null -eq $unicodeMethod) { throw 'Windows Unicode input helper is unavailable.' }; foreach ($char in ([string]$payload.text).ToCharArray()) { $codePoint = [char]$char; if (-not [bool]$unicodeMethod.Invoke($null, @($codePoint, [bool]$false))) { throw 'Windows rejected text input.' }; if (-not [bool]$unicodeMethod.Invoke($null, @($codePoint, [bool]$true))) { throw 'Windows rejected text release.' }; Start-Sleep -Milliseconds 1 } }
  'pressKey' { $vk=KeyCode ([string]$payload.key); [JarvisComputerInput]::Key($vk,$false); [JarvisComputerInput]::Key($vk,$true) }
  'hotkey' { $pressed=@(); foreach ($key in $payload.keys) { $vk=KeyCode ([string]$key); [JarvisComputerInput]::Key($vk,$false); $pressed += $vk }; [array]::Reverse($pressed); foreach ($vk in $pressed) { [JarvisComputerInput]::Key($vk,$true) } }
  'cursor' { $point=New-Object JarvisComputerInput+POINT; if (-not [JarvisComputerInput]::GetCursorPos([ref]$point)) { throw 'Windows did not return the cursor position.' }; @{x=$point.X;y=$point.Y} | ConvertTo-Json -Compress; exit 0 }
  default { throw 'Unsupported computer-use action.' }
}
@{ok=$true;action=[string]$payload.action} | ConvertTo-Json -Compress
`;
}

function defaultRunner(payload) {
    if (process.platform !== "win32") return Promise.resolve({ success: false, error: "Computer Use is currently supported on Windows only." });
    const encoded = encodePayload(payload);
    const encodedScript = Buffer.from(powerShellScript(encoded), "utf16le").toString("base64");
    return new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript], { windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
            if (error) return resolve({ success: false, error: String(error.killed ? "Windows input timed out." : stderr || error.message || "Windows input failed.").replace(/#< CLIXML[\s\S]*/, "Windows input failed; check the desktop session and input helper.").trim().slice(0, 300) });
            let data = {};
            try { data = JSON.parse(String(stdout || "{}")); } catch (_) { /* cursor/action output is best-effort */ }
            resolve({ success: true, data });
        });
    });
}

function accessibilityScript() {
    return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class JarvisForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'
$foregroundHandle = [JarvisForeground]::GetForegroundWindow()
if ($foregroundHandle -eq [IntPtr]::Zero) { throw 'Windows did not expose a foreground window.' }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($foregroundHandle)
if ($null -eq $root) { throw 'Windows UI Automation could not read the foreground window.' }
$windowName = [string]$root.Current.Name
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$focusedElement = [System.Windows.Automation.AutomationElement]::FocusedElement
$focusedElementName = if ($null -ne $focusedElement) { [string]$focusedElement.Current.Name } else { '' }
$focusedElementType = if ($null -ne $focusedElement) { [string]$focusedElement.Current.ControlType.ProgrammaticName } else { '' }
$focusedWindow = $focusedElement
while ($null -ne $focusedWindow -and [string]$focusedWindow.Current.ControlType.ProgrammaticName -ne 'ControlType.Window') { $focusedWindow = $walker.GetParent($focusedWindow) }
$focusedWindowName = if ($null -ne $focusedWindow) { [string]$focusedWindow.Current.Name } else { $windowName }
$pending = New-Object 'System.Collections.Generic.Queue[System.Windows.Automation.AutomationElement]'
$pending.Enqueue($root)
$items = @()
for ($i = 0; $i -lt 350 -and $pending.Count -gt 0; $i++) {
  $n = $pending.Dequeue()
  try {
  $child = $walker.GetFirstChild($n)
  while ($null -ne $child -and $pending.Count -lt 350) { $pending.Enqueue($child); $child = $walker.GetNextSibling($child) }
  $c = $n.Current
  $name = [string]$c.Name
  if ($c.IsPassword -or $c.IsOffscreen) { continue }
  $r = $c.BoundingRectangle
  if ($r.Width -le 0 -or $r.Height -le 0) { continue }
  $value = ''; $pattern = $null
  if ($c.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $c.ControlType -eq [System.Windows.Automation.ControlType]::Document) {
    if ($n.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { $value = [string]$pattern.Current.Value }
    elseif ($n.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) { $value = $pattern.DocumentRange.GetText(4000) }
  }
  $items += [pscustomobject]@{ name=$name.Substring(0,[Math]::Min(160,$name.Length)); value=$value.Substring(0,[Math]::Min(4000,$value.Length)); windowName=$windowName; focusedWindowName=$focusedWindowName; focusedElementName=$focusedElementName; focusedElementControlType=$focusedElementType; controlType=[string]$c.ControlType.ProgrammaticName; x=[int]$r.X; y=[int]$r.Y; width=[int]$r.Width; height=[int]$r.Height; enabled=[bool]$c.IsEnabled; keyboardFocusable=[bool]$c.IsKeyboardFocusable; keyboardFocused=[bool]$c.HasKeyboardFocus; offscreen=[bool]$c.IsOffscreen }
  } catch { continue }
}
@{ok=$true; items=$items} | ConvertTo-Json -Compress -Depth 4
`;
}

function defaultAccessibilityRunner() {
    if (process.platform !== "win32") return Promise.resolve({ success: false, error: "Windows accessibility inspection is currently supported on Windows only." });
    const encodedScript = Buffer.from(accessibilityScript(), "utf16le").toString("base64");
    return new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript], { windowsHide: true, timeout: 12000, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
            if (error) return resolve({ success: false, error: String(stderr || error.message || "Accessibility inspection failed.").trim().slice(0, 300) });
            try { resolve({ success: true, data: JSON.parse(String(stdout || "{}")) }); }
            catch (_) { resolve({ success: false, error: "Windows returned an unreadable accessibility tree." }); }
        });
    });
}

class WindowsComputerUse {
    constructor({ platform = process.platform, runner = defaultRunner, accessibilityRunner = defaultAccessibilityRunner } = {}) {
        this.platform = platform;
        this.runner = runner;
        this.accessibilityRunner = accessibilityRunner;
        this.active = false;
        this.startedAt = null;
    }

    startSession() {
        if (this.platform !== "win32") return outcome(false, "startSession", {}, "Computer Use is currently supported on Windows only.");
        this.active = true;
        this.startedAt = Date.now();
        return outcome(true, "startSession", { active: true, startedAt: this.startedAt });
    }

    stopSession() {
        this.active = false;
        this.startedAt = null;
        return outcome(true, "stopSession", { active: false });
    }

    getStatus() {
        return outcome(true, "status", { active: this.active, startedAt: this.startedAt, platform: this.platform, actions: [...ACTIONS], alwaysApprove: [...ALWAYS_APPROVE] });
    }

    async inspectAccessibility() {
        if (!this.active) return outcome(false, "inspectAccessibility", {}, "Start Computer Use mode before inspecting the desktop.");
        const result = await this.accessibilityRunner();
        if (!result?.success) return outcome(false, "inspectAccessibility", {}, result?.error || "Accessibility inspection failed.");
        const data = result.data || {};
        const items = Array.isArray(data.items) ? data.items : [];
        const focused = items.find(item => item?.keyboardFocused === true);
        const focusedWindowName = String(focused?.focusedWindowName || focused?.windowName || items[0]?.windowName || "").trim();
        const focusedControl = focused
            ? { name: String(focused.name || "").slice(0, 160), controlType: String(focused.controlType || ""), value: String(focused.value || "").slice(0, 4000) }
            : null;
        return outcome(true, "inspectAccessibility", {
            ...data,
            focusedWindow: focusedWindowName ? { name: focusedWindowName } : null,
            focusedControl
        });
    }

    async perform(action, params = {}, { approved = false } = {}) {
        if (!this.active) return outcome(false, action, {}, "Start Computer Use mode before controlling the desktop.");
        let safeParams;
        try { safeParams = validate(action, params); }
        catch (error) { return outcome(false, action, {}, error.message); }
        const needsApproval = ALWAYS_APPROVE.has(action);
        if (needsApproval && approved !== true) return outcome(false, action, safeParams, "This computer action needs your confirmation before it runs.", true);
        const result = await this.runner({ action, ...safeParams });
        return outcome(result?.success === true, action, result?.data || safeParams, result?.success === true ? null : (result?.error || "Windows input failed."), false);
    }
}

module.exports = { WindowsComputerUse, ACTIONS, ALWAYS_APPROVE, validate, defaultAccessibilityRunner, powerShellScript };
