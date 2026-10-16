const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const main = fs.readFileSync("main.js", "utf8");
const nce = fs.readFileSync("renderer/js/brain/naturalCommandEngine.js", "utf8");

test("Minecraft world workflow is explicit and approval-gated", () => {
    assert.match(nce, /MINECRAFT_WORLD_FLOW/);
    assert.match(nce, /first-survival/);
    assert.match(nce, /locateAndApproveClick/);
    assert.match(main, /case ["']sklauncher["']/);
});
