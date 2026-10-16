"use strict";

const { execFile } = require("child_process");

const APP_PROCESS_ALIASES = {
    notepad: ["notepad"],
    chrome: ["chrome"],
    edge: ["msedge"],
    "microsoft edge": ["msedge"],
    vscode: ["code"],
    "visual studio code": ["code"],
    "vs code": ["code"],
    calculator: ["calculator", "calc"],
    explorer: ["explorer"],
    "file explorer": ["explorer"]
};

function normalizeApp(value) {
    const key = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    return APP_PROCESS_ALIASES[key] ? key : null;
}

function encodePowerShell(script) {
    return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script) {
    return new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(script)], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
            if (error) return resolve({ success: false, error: String(stderr || error.message || "Windows rejected the window close request.").trim() });
            try { return resolve({ success: true, data: JSON.parse(String(stdout || "{}")) }); }
            catch (_) { return resolve({ success: true, data: { closed: [], raw: String(stdout || "").trim() } }); }
        });
    });
}

function closeWindows({ targets = [], except = [], all = false } = {}) {
    const targetNames = [...new Set((Array.isArray(targets) ? targets : []).map(normalizeApp).filter(Boolean).flatMap((name) => APP_PROCESS_ALIASES[name]))];
    const exceptNames = [...new Set((Array.isArray(except) ? except : []).map(normalizeApp).filter(Boolean).flatMap((name) => APP_PROCESS_ALIASES[name]))];
    if (!all && !targetNames.length) return Promise.resolve({ success: false, error: "No supported application was specified." });
    const targetJson = JSON.stringify(targetNames);
    const exceptJson = JSON.stringify(["jarvis", "electron", ...exceptNames]);
    const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class JarvisWindowClose { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l); }
'@
$targets = '${Buffer.from(targetJson, "utf8").toString("base64")}'; $targets = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($targets)) | ConvertFrom-Json
$except = '${Buffer.from(exceptJson, "utf8").toString("base64")}'; $except = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($except)) | ConvertFrom-Json
$all = ${all ? "$true" : "$false"}
$closed = @()
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  $name = $_.ProcessName.ToLowerInvariant()
  if (($except -contains $name) -or (-not $all -and -not ($targets -contains $name))) { return }
  if ([JarvisWindowClose]::PostMessage($_.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { $closed += $_.ProcessName }
}
@{ closed = @($closed | Select-Object -Unique) } | ConvertTo-Json -Compress
`;
    return runPowerShell(script).then((result) => result.success
        ? { success: true, closed: result.data?.closed || [] }
        : result);
}

module.exports = { closeWindows, normalizeApp };
