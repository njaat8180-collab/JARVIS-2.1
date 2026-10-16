const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("renderer/js/screenShare.js", "utf8");

test("screen vision has a grounded target locator", () => {
    assert.match(source, /async function locateTarget/);
    assert.match(source, /centerX/);
    assert.match(source, /confidence/);
    assert.match(source, /Never guess/);
    assert.match(source, /locateTarget/);
});

test("screen vision exposes grounded state awareness for adaptive workflows", () => {
    assert.match(source, /async function understandState/);
    assert.match(source, /visibleControls/);
    assert.match(source, /suggestedNextStep/);
    assert.match(source, /understandState/);
});
test("Autopilot can inspect native Windows state without a media stream", () => {
    assert.match(source, /Native UI Automation can describe many Windows apps/);
    assert.match(source, /source: "accessibility"/);
    assert.match(source, /current app is not exposed by Windows accessibility/);
});

test("voice-first Autopilot routes screen questions to native state without capture", () => {
    assert.match(source, /nativeAutopilot/);
    assert.match(source, /if \(!stream && window\.JARVISComputerUse\?\.isAutopilotActive/);
    assert.match(source, /model: "Windows Accessibility"/);
});
