"use strict";

// Launch only the explicitly supplied development build with an isolated
// profile. The debugging listener is loopback-only and closed with the app.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const executable = path.resolve(process.argv[2] || "artifacts/repair-20261011-build/win-unpacked/JARVIS.exe");
    assert.ok(fs.existsSync(executable), "Build executable is missing.");
    const directory = path.resolve("artifacts/packaged-verification");
    const profile = path.join(directory, "profile");
    fs.mkdirSync(path.join(profile, "database", "users"), { recursive: true });
    const registry = path.join(profile, "database", "users", "users.json");
    if (!fs.existsSync(registry)) fs.writeFileSync(registry, JSON.stringify({ users: [], activeUserId: null, version: 2 }));
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const log = fs.openSync(path.join(directory, "launch.log"), "w");
    const child = spawn(executable, [`--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: ["ignore", log, log] });
    const report = { executable, startedAt: new Date().toISOString(), checks: [], errors: [] };
    let socket;
    let launchError;
    child.on("error", error => { launchError = error; });
    try {
        let page;
        for (let i = 0; i < 60; i++) {
            if (launchError) throw launchError;
            if (child.exitCode !== null) throw new Error(`Application exited early: ${child.exitCode}`);
            const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) }).then(r => r.json()).catch(() => []);
            page = pages.find(item => /app\.asar.*renderer.*index\.html/.test(item.url));
            if (page) break;
            await delay(500);
        }
        assert.ok(page, "Packaged renderer did not load within 30 seconds.");
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let nextId = 0;
        const rpc = (method, params) => new Promise((resolve, reject) => {
            const id = ++nextId;
            const timeout = setTimeout(() => { socket.removeEventListener("message", receive); reject(new Error(`${method} timed out`)); }, 30000);
            function receive(event) {
                const message = JSON.parse(event.data);
                if (message.id !== id) return;
                clearTimeout(timeout);
                socket.removeEventListener("message", receive);
                if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
            }
            socket.addEventListener("message", receive);
            socket.send(JSON.stringify({ id, method, params }));
        });
        await delay(2500);
        const state = await rpc("Runtime.evaluate", { expression: `(() => ({ ready: !!window.jarvis && !!window.ChatEngine, nodeExposed: typeof window.require !== 'undefined', title: document.title, url: location.href }))()`, returnByValue: true });
        assert.equal(state.result.value.ready, true, "Packaged preload and chat engine must be ready.");
        assert.equal(state.result.value.nodeExposed, false, "Renderer must not expose Node require.");
        report.checks.push(state.result.value);
        const library = await rpc("Runtime.evaluate", { expression: `window.jarvis.system.listApps()`, returnByValue: true, awaitPromise: true });
        const inventory = library.result.value;
        assert.equal(inventory.success, true, "Packaged App Library must discover apps.");
        const apps = (inventory.data || inventory).apps;
        assert.ok(apps.length, "Windows inventory must not be empty on this PC.");
        assert.ok(apps.some(item => /^sklauncher$/i.test(item.name)), "SKLauncher must be present in the packaged app catalog.");
        report.checks.push({ appCount: apps.length, sklauncherDiscovered: true });
        const screenshot = await rpc("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(directory, "dashboard.png"), Buffer.from(screenshot.data, "base64"));
        await rpc("Runtime.evaluate", { expression: "window.close()" }).catch(() => {});
    } catch (error) {
        report.errors.push(String(error.stack || error));
    } finally {
        socket?.close();
        for (let i = 0; i < 20 && child.exitCode === null; i++) await delay(250);
        if (child.exitCode === null) child.kill();
        fs.closeSync(log);
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.errors.length ? 1 : 0;
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
