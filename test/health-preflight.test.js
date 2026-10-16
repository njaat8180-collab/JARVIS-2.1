const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("renderer/index.html", "utf8");
const health = fs.readFileSync("renderer/js/health.js", "utf8");
const css = fs.readFileSync("renderer/css/style.css", "utf8");

test("health panel exposes an event preflight check", () => {
    assert.match(html, /healthPreflightBtn/);
    assert.match(html, /healthPreflightList/);
    assert.match(health, /runPreflight/);
    assert.match(health, /aiProvider\?\.health/);
    assert.match(health, /computerUse/);
    assert.match(health, /JARVISScreenShare/);
});

test("preflight styles distinguish pass, warning and failure", () => {
    assert.match(css, /preflight-pass/);
    assert.match(css, /preflight-warn/);
    assert.match(css, /preflight-fail/);
});
