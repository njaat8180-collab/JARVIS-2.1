"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../renderer/js/focusSprint.js"), "utf8");
const saved = new Map();
const window = { dispatchEvent() {} };
const document = { readyState: "loading", addEventListener() {} };
vm.runInNewContext(source, {
    window, document, console,
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    setInterval: () => 1, clearInterval() {}, Date, CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; }
});

const sprint = window.JARVISFocusSprint;
let result = sprint.handle("start a 30 minute focus sprint");
assert.equal(result.handled, true);
assert.equal(sprint.getState().status, "running");
assert.equal(sprint.getState().durationMs, 30 * 60 * 1000);
assert.equal(sprint.handle("pause focus sprint").source, "focus-sprint");
assert.equal(sprint.getState().status, "paused");
assert.match(sprint.handle("resume focus sprint").response, /resumed/);
assert.equal(sprint.getState().status, "running");
assert.match(sprint.handle("cancel focus sprint").response, /cancelled/);
assert.equal(sprint.getState().status, "cancelled");
sprint.handle("start a 2 hour focus sprint");
assert.equal(sprint.getState().durationMs, 2 * 60 * 60 * 1000);
assert.equal(sprint.handle("tell me the focus sprint status").source, "focus-sprint");
assert.equal(sprint.handle("open YouTube").handled, false);
sprint.handle("25 मिनट फोकस टाइमर");
assert.equal(sprint.getState().durationMs, 25 * 60 * 1000);
assert.equal(sprint.handle("फोकस टाइमर रोक दो").response, "Focus sprint paused with 25:00 remaining.");
console.log("focus sprint command lifecycle passed");
