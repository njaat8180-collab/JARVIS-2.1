const test = require("node:test");
const assert = require("node:assert/strict");
const { ConsciousnessLayer, VALID_RESPONSE_STYLES } = require("../src/ai/consciousness");

test("Focus is a supported personality style with its own listening guidance", () => {
    const consciousness = new ConsciousnessLayer();
    assert.ok(VALID_RESPONSE_STYLES.includes("focus"));
    assert.deepEqual(consciousness.setResponseStyle("focused"), { success: true, style: "focus" });
    assert.equal(consciousness.getResponseStyle(), "focus");
    assert.match(consciousness.getStyleInstruction(), /tightly focused/i);
    assert.match(consciousness.buildSystemPrompt(), /ask one brief clarifying question/i);
});

test("all personality styles have distinct response instructions", () => {
    const consciousness = new ConsciousnessLayer();
    const instructions = VALID_RESPONSE_STYLES.map((style) => {
        consciousness.setResponseStyle(style);
        return consciousness.getStyleInstruction();
    });
    assert.equal(new Set(instructions).size, VALID_RESPONSE_STYLES.length);
    assert.ok(instructions.every(Boolean));
});
