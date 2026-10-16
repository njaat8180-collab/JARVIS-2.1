"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { isTrustedIPCEvent, guardIPCHandler } = require("../src/security/ipcPolicy");

function renderer() {
    const url = pathToFileURL(path.resolve(__dirname, "../renderer/index.html")).href;
    const frame = { url };
    const contents = { mainFrame: frame, getURL: () => frame.url, isDestroyed: () => false };
    const window = { webContents: contents, isDestroyed: () => false };
    const event = { sender: contents, senderFrame: frame };
    return { url, frame, contents, window, event, options: { getWindow: () => window, rendererURL: url } };
}

test("IPC allows only the current application document in its main frame", () => {
    const r = renderer();
    assert.equal(isTrustedIPCEvent(r.event, r.window, r.url), true);
    r.frame.url += "#chat";
    assert.equal(isTrustedIPCEvent(r.event, r.window, r.url), true);
    assert.equal(isTrustedIPCEvent({ sender: r.contents }, r.window, r.url), false);
    assert.equal(isTrustedIPCEvent({ sender: r.contents, senderFrame: { url: r.url } }, r.window, r.url), false);
    assert.equal(isTrustedIPCEvent({ sender: { ...r.contents }, senderFrame: r.frame }, r.window, r.url), false);
    assert.equal(isTrustedIPCEvent(r.event, null, r.url), false);
});

test("IPC denies foreign origins and other local files after top-level navigation", () => {
    const r = renderer();
    for (const url of ["https://example.org", "about:blank", "data:text/html,hello", r.url + ".html", r.url.replace("index.html", "preview.html"), r.url + "?external=1"]) {
        r.frame.url = url;
        assert.equal(isTrustedIPCEvent(r.event, r.window, r.url), false, url);
    }
    r.frame.url = r.url;
    r.contents.getURL = () => "https://example.org";
    assert.equal(isTrustedIPCEvent(r.event, r.window, r.url), false);
    r.contents.getURL = () => { throw new Error("Frame disposed"); };
    assert.equal(isTrustedIPCEvent(r.event, r.window, r.url), false);
});

test("IPC sender rejection happens before the handler or approval dialog", async () => {
    const r = renderer();
    let calls = 0;
    const run = guardIPCHandler("system:shutdown", () => calls++, { ...r.options, confirm: () => { calls++; return true; } });
    r.frame.url = "https://example.org";
    const result = await run(r.event);
    assert.equal(result.code, "UNTRUSTED_IPC_SENDER");
    assert.equal(calls, 0);
});

test("IPC preserves successful safe handler arguments and results", async () => {
    const r = renderer();
    const run = guardIPCHandler("browser:new-tab", (event, url) => ({ success: event === r.event, url }), r.options);
    assert.deepEqual(await run(r.event, "https://example.org"), { success: true, url: "https://example.org" });
});

test("power, shutdown timers and file deletion require a fresh explicit native approval", async () => {
    for (const channel of ["system:shutdown", "system:restart", "system:sleep", "system:lock", "system:logoff", "system:schedule-shutdown", "file:delete"]) {
        const r = renderer();
        let executions = 0;
        let dialog;
        let accept = false;
        const run = guardIPCHandler(channel, () => { executions++; return { success: true }; }, { ...r.options, confirm: async (_window, options) => { dialog = options; return accept; } });
        const args = channel === "system:schedule-shutdown" ? [60000] : ["C:\\Users\\example\\Documents\\review.txt"];
        const cancelled = await run(r.event, ...args);
        assert.equal(cancelled.cancelled, true, channel);
        assert.equal(executions, 0, channel);
        assert.equal(dialog.defaultId, 0);
        assert.equal(dialog.cancelId, 0);
        if (channel === "system:schedule-shutdown") assert.match(dialog.detail, /1 minute.*forced to close/);
        if (channel === "file:delete") assert.match(dialog.detail, /review\.txt/);
        accept = true;
        assert.equal((await run(r.event, ...args)).success, true, channel);
        assert.equal(executions, 1, channel);
    }
});

test("approval failures, send-only requests and absent approval providers fail closed", async () => {
    const r = renderer();
    let executions = 0;
    const handler = () => executions++;
    const unavailable = guardIPCHandler("system:shutdown", handler, r.options);
    assert.equal((await unavailable(r.event)).code, "APPROVAL_UNAVAILABLE");
    const failed = guardIPCHandler("system:shutdown", handler, { ...r.options, confirm: () => { throw new Error("dialog unavailable"); } });
    assert.equal((await failed(r.event)).code, "APPROVAL_FAILED");
    const sendOnly = guardIPCHandler("system:shutdown", handler, { ...r.options, eventOnly: true, confirm: () => true });
    assert.equal((await sendOnly(r.event)).code, "APPROVAL_UNAVAILABLE");
    assert.equal(executions, 0);
});

test("duplicate pending approvals are rejected and navigation during approval cancels execution", async () => {
    const r = renderer();
    let resolveDialog;
    let executions = 0;
    const run = guardIPCHandler("system:shutdown", () => executions++, { ...r.options, confirm: () => new Promise(resolve => { resolveDialog = resolve; }) });
    const first = run(r.event);
    assert.equal((await run(r.event)).code, "APPROVAL_PENDING");
    r.frame.url = "https://example.org";
    resolveDialog(true);
    assert.equal((await first).code, "UNTRUSTED_IPC_SENDER");
    assert.equal(executions, 0);
});

test("desktop main process applies the policy to every registered IPC handler and event", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../main.js"), "utf8");
    assert.match(source, /ipcMain\.handle\(\s*channel,\s*require\("\.\/src\/security\/ipcPolicy"\)\.guardIPCHandler/);
    assert.match(source, /ipcMain\.on\(\s*channel,\s*require\("\.\/src\/security\/ipcPolicy"\)\.guardIPCHandler/);
    assert.doesNotMatch(source, /sandbox:\s*false/);
});

test("actual Electron Builder file filter excludes local secrets, history, artifacts and backups", () => {
    const { FileMatcher } = require("app-builder-lib/out/fileMatcher");
    const root = path.resolve(__dirname, "..");
    const config = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const match = new FileMatcher(root, root, value => value, config.build.files).createFilter();
    const stat = { isDirectory: () => false };
    for (const file of [".env", ".env.production", "src/.env", "src/database/users/user/profile.json", "src/database/chat_history.json", "artifacts/completion-baseline-20261010/main.js", "runtime-probe/private.json", "renderer/private.key", "src/ai/private.bak", "main.backup.js", "dist/app.exe", "config/credentials.json"]) {
        assert.equal(match(path.join(root, file), stat), false, file);
    }
    for (const file of ["main.js", "preload.js", "voiceSTT.js", "src/security/ipcPolicy.js", "renderer/index.html", "stt/whisper/provider.js", "assets/logo.svg", "config/voice_settings.json"]) {
        assert.equal(match(path.join(root, file), stat), true, file);
    }
});
