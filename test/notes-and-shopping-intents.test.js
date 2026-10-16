"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "renderer/js/jarvisCommandCenter.js"), "utf8");

async function createCommandCenter(overrides = {}) {
    const window = {
        jarvis: { data: { productResearch: async q => ({ success: true, query: q, wikipedia: null, reddit: [], retailers: {
            amazonSearchUrl: "https://www.amazon.in/s?k=rtx+5090",
            googleShoppingUrl: "https://www.google.com/search?tbm=shop&q=rtx+5090",
            flipkartSearchUrl: "https://www.flipkart.com/search?q=rtx+5090"
        } }) }, browser: { newTab: async url => { opened.push(url); return { success: true }; } } },
        ...overrides
    };
    const opened = [];
    vm.runInNewContext(source, { window, console, setTimeout, navigator: { platform: "test" }, Date, Promise, URL });
    return { handle: window.JARVISCommandCenter.handle, opened };
}

(async () => {
    const { handle } = await createCommandCenter();
    const notes = await handle("Jarvis make short notes for Class 9 CBSE IT chapter Working with Windows 7");
    assert.equal(notes.handled, true);
    assert.equal(notes.richContent.type, "notes");
    assert.match(notes.response, /तैयार हैं/);
    assert.ok(notes.richContent.sections.length >= 4);
    assert.ok(!notes.response.includes("Recycle Bin"), "spoken acknowledgement should not read the notes body");

    const sourceText = fs.readFileSync(path.join(root, "renderer/js/chat.js"), "utf8");
    assert.match(sourceText, /short notes\?.*working with windows 7/);

    const shopping = await createCommandCenter();
    const result = await shopping.handle("research RTX 5090");
    assert.equal(result.handled, true);
    assert.equal(result.source, "product-research");
    assert.equal(shopping.opened.length, 2);
    assert.ok(shopping.opened.every(url => /google\.com\/search\?tbm=shop|amazon\.in\/s/.test(url)));
    assert.match(result.response, /could not confirm the cheapest exact listing/i);
    assert.match(result.response, /have not added anything to a cart or placed an order/i);

    const briefing = await createCommandCenter({ jarvis: { info: {
        now: () => ({ time: "11:30 AM", date: "Tuesday, 6 October 2026" }),
        info: async () => ({ data: { cpu: { percent: 12 }, memory: { percent: 48, usedBytes: 500, totalBytes: 1000 }, battery: { percent: 91, charging: true } } })
    } } });
    const brief = await briefing.handle("Jarvis brief me");
    assert.equal(brief.source, "daily-briefing");
    assert.match(brief.response, /11:30 AM in Delhi/);
    assert.match(brief.response, /CPU usage is 12 percent/);
    assert.equal(brief.richContent.sections[0].body, "11:30 AM · Tuesday, 6 October 2026 (India Standard Time)");
    assert.match(sourceText, /daily briefing/);
    const agents = [
        { name: "BrowserAgent", status: "idle" },
        { name: "VisionAgent", status: "running" },
        { name: "LearningAgent", status: "error" }
    ];
    const health = await createCommandCenter({
        AgentRegistry: { filter: () => agents },
        jarvis: { info: { info: async () => ({ data: { platform: "win32", cpu: { percent: 18, cores: 8, model: "CPU" }, memory: { percent: 45, usedBytes: 450, totalBytes: 1000 }, network: [], uptimeSeconds: 120 } }) } }
    });
    const agentResult = await health.handle("Jarvis tell me how many agents are working");
    assert.equal(agentResult.data.total, 3);
    assert.equal(agentResult.data.running, 1);
    assert.equal(agentResult.data.errors, 1);
    assert.match(agentResult.response, /1 अभी actively running/);
    const diagnosis = await health.handle("Jarvis start diagnosis");
    assert.equal(diagnosis.source, "system-diagnostics");
    assert.equal(diagnosis.richContent.title, "JARVIS · Diagnostic Report");
    assert.ok(diagnosis.richContent.sections.some(section => /registered/.test(section.body || "")));
    const hindiAgentQuery = await health.handle("जार्विस के कितने एजेंट काम कर रहे");
    assert.equal(hindiAgentQuery.source, "agent-status");
    const hindiDiagnosis = await health.handle("जार्विस स्टार्ट डायग्नोसिस");
    assert.equal(hindiDiagnosis.source, "system-diagnostics");
    assert.match(sourceText, /daily briefing/);
    assert.ok(sourceText.includes("diagnos(?:is|tics?)"), "offline router recognizes diagnosis phrases");
    require("./focus-sprint.test.js");
    console.log("notes and shopping intent regressions passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
