const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("renderer/js/brain/commandRoutePolicy.js", "utf8");
const context = { window: { JARVISNaturalCommandEngine: { detect(text) {
    const value = String(text).toLowerCase();
    if (/shutdown|shut down|system band/.test(value)) return { intent: "SYSTEM_CONTROL", confidence: 0.98, entities: {} };
    if (/open youtube/.test(value)) return { intent: "OPEN_WEBSITE", confidence: 0.99, entities: {} };
    if (/create a folder|folder banao/.test(value)) return { intent: "CREATE_FOLDER", confidence: 0.99, entities: {} };
    if (/what is quantum/.test(value)) return { intent: "KNOWLEDGE", confidence: 0.86, entities: {} };
    return { intent: "unknown", confidence: 0, entities: {} };
} } } };
vm.createContext(context);
vm.runInContext(source, context);
const policy = context.window.JARVISCommandRoutePolicy;

test("local system commands stay local despite AI-like wording", () => {
    for (const input of ["shut down my system", "shutdown my system please", "system band kar do"]) {
        assert.equal(policy.decide(input).route, "local", input);
    }
});

test("explicit AI requests go to AI", () => {
    assert.equal(policy.decide("ask AI what is quantum computing").route, "ai");
    assert.equal(policy.decide("ChatGPT se pucho quantum computing kya hai").route, "ai");
});

test("web actions are not misrouted to AI", () => {
    assert.equal(policy.decide("open YouTube").route, "online");
});

test("folder creation stays on the local file bridge", () => {
    assert.equal(policy.decide("create a folder called Nakul on your desktop").route, "local");
});

test("ordinary mentions remain undecided", () => {
    assert.equal(policy.decide("the meeting time changed").route, "conversation");
});
