"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const vm = require("vm");

function loadDiagnostics() {
    const source = fs.readFileSync(require.resolve("../renderer/js/context/DebugDiagnostics.js"), "utf8");
    const context = {
        console: { log() {}, error() {} },
        CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
        dispatchEvent() {},
        ChatEngine: { config: { debug: true } }
    };
    context.window = context;
    vm.runInNewContext(source, context, { filename: "DebugDiagnostics.js" });
    return context.JARVISDiagnostics;
}

test("Phase 14 diagnostics are bounded and redact credential-like fields", () => {
    const d = loadDiagnostics();
    for (let i = 0; i < 155; i++) d.record("route", "event " + i, { apiKey: "secret", value: i });
    const snapshot = d.snapshot();
    assert.equal(snapshot.eventCount, 150);
    assert.equal(snapshot.events[0].message, "event 5");
    assert.equal(snapshot.events.at(-1).details.apiKey, "[REDACTED]");
});

test("Phase 14 diagnostics do not record when debug is disabled", () => {
    const source = fs.readFileSync(require.resolve("../renderer/js/context/DebugDiagnostics.js"), "utf8");
    const context = { console: { log() {}, error() {} }, CustomEvent: function(){}, dispatchEvent(){}, ChatEngine: { config: { debug: false } } };
    context.window = context;
    vm.runInNewContext(source, context, { filename: "DebugDiagnostics.js" });
    assert.equal(context.JARVISDiagnostics.record("route", "should not exist"), null);
    assert.equal(context.JARVISDiagnostics.snapshot().eventCount, 0);
});

test("Phase 14 test helper preserves the same debug gate contract", () => {
    const mod = require("../renderer/js/context/DebugDiagnostics.js");
    const enabled = mod.createDiagnosticsForTest(true);
    enabled.record("memory", "MEMORY RETRIEVED", { count: 2 });
    assert.equal(enabled.snapshot().eventCount, 1);
    const disabled = mod.createDiagnosticsForTest(false);
    assert.equal(disabled.record("memory", "MEMORY RETRIEVED"), null);
    assert.equal(disabled.snapshot().eventCount, 0);
});
