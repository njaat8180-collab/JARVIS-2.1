"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("HUD displays real route activity and maps it onto the existing core animation", () => {
    const elements = new Map();
    for (const id of ["hudActivityState", "hudActivityTask", "hudActivityTool", "hudVoiceState", "hudAlertBar", "hudTrustValue"]) {
        elements.set(id, { textContent: "", hidden: true });
    }

    const documentEvents = new Map();
    const windowEvents = new Map();
    const intervals = [];
    const orbStates = [];
    const document = {
        body: { dataset: {} },
        getElementById: id => elements.get(id) || null,
        addEventListener: (name, fn) => documentEvents.set(name, fn),
        createElement: () => ({ className: "", textContent: "", appendChild() {} })
    };
    const window = {
        ChatEngine: { processing: true, runtime: { activeRequests: 1 } },
        OrbEngine: { setOrb: state => orbStates.push(state) },
        addEventListener: (name, fn) => windowEvents.set(name, fn)
    };
    const context = vm.createContext({
        window,
        document,
        console,
        Map,
        Date,
        Promise,
        setInterval: fn => { intervals.push(fn); return intervals.length; },
        setTimeout: () => 1,
        clearTimeout() {}
    });

    const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "hud.js"), "utf8");
    vm.runInContext(source, context, { filename: "hud.js" });
    documentEvents.get("DOMContentLoaded")();

    windowEvents.get("jarvis:activity")({
        detail: {
            requestID: "req-1",
            phase: "working",
            state: "searching",
            task: "Find Minecraft on Google",
            tool: "Browser & Search",
            operation: "Searching the web"
        }
    });
    intervals[0]();

    assert.equal(elements.get("hudActivityState").textContent, "SEARCHING");
    assert.equal(elements.get("hudActivityTask").textContent, "Find Minecraft on Google");
    assert.equal(elements.get("hudActivityTool").textContent, "Browser & Search · Searching the web");
    assert.equal(document.body.dataset.orbState, "searching");
    assert.equal(orbStates.at(-1), "thinking");

    windowEvents.get("jarvis:activity")({
        detail: { requestID: "req-1", phase: "completed", state: "success", task: "Find Minecraft on Google", tool: "Browser", operation: "Task completed" }
    });
    assert.equal(elements.get("hudActivityState").textContent, "COMPLETED");
});
