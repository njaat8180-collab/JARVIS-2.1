"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — COMMAND CENTER UI TEST
 * test/command-center-ui.test.js
 * ============================================================
 * Verifies the v2.5 Command Center UI:
 *   1. Structure — all new panels exist in index.html
 *   2. Rules — ALL legacy element IDs preserved exactly once
 *      (existing JS must keep working — the #1 rebuild rule)
 *   3. CSS — command center layer present
 *   4. Engine — commandCenter.js behavior (Node-safe parts)
 *   5. Real-data wiring — no fake values in panels
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  \u2713 ${name}`); }
    catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

console.log("\n========================================");
console.log("COMMAND CENTER UI TEST");
console.log("========================================\n");

const html = read("renderer/index.html");
const css = read("renderer/css/cinema.css");
const ccjs = read("renderer/js/commandCenter.js");

// ============================================================
// 1. STRUCTURE — reference layout panels
// ============================================================
console.log("--- 1. Structure ---");

const PANELS = [
    "ccDashboard", "ccCoreOverview", "ccCorePanel", "ccLiveFeed", "ccAgents",
    "ccTimeline", "ccSystemMonitor", "ccMemoryInsights", "ccKnowledge",
    "ccTalkBar", "ccTalkInput", "ccBriefingBtn", "ccSearch", "ccSystemStatus",
    "ccProfile", "ccProfileName", "ccProfileAvatar", "ccFeedList", "ccMemLine",
    "ccMemFacts", "ccMemTurns", "ccMemWebCalls", "ccSrcGrid", "ccListenLabel",
    "ccTalkSub"
];
test("all 25 command-center elements exist", () => {
    for (const id of PANELS) {
        assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
});

test("header is a COMMAND CENTER bar (logo + status + search + profile + clock)", () => {
    assert.ok(html.includes("Command Center"), "title");
    assert.ok(html.includes('id="ccSystemStatus"'), "system status");
    assert.ok(html.includes('id="ccSearch"'), "search");
    assert.ok(html.includes('id="ccProfile"'), "profile");
    assert.ok(html.includes('id="clock"'), "clock kept");
});

test("AI core label states DETERMINISTIC • ZERO LLM (no fake AI branding)", () => {
    assert.ok(html.includes("JARVIS AI CORE"));
    assert.ok(html.includes("DETERMINISTIC"));
    assert.ok(html.includes("ZERO LLM"));
});

test("knowledge panel shows the SOURCE CHAIN (not fake LLM status)", () => {
    assert.ok(html.includes("Knowledge Sources"));
    for (const src of ["wikipedia", "duckduckgo", "google", "wikidata"]) {
        assert.ok(html.includes(`data-src="${src}"`), src);
    }
});

test("talk bar: TALK TO JARVIS + listening waveform + briefing button", () => {
    assert.ok(html.includes("TALK TO JARVIS"));
    assert.ok(html.includes("cc-wave"));
    assert.ok(html.includes("EXECUTIVE BRIEFING"));
});

test("right-panel is absorbed (not duplicated)", () => {
    assert.ok(!html.includes('<aside class="right-panel">'));
});

// ============================================================
// 2. RULES — legacy IDs preserved exactly once
// ============================================================
console.log("\n--- 2. Legacy IDs (JS must keep working) ---");

const LEGACY = [
    "cinemaBoot", "cinemaBootLog", "cinemaBootBar",
    "clock", "date", "minimize", "maximize", "close",
    "currentTask", "learningEngineControl", "learningEngineState", "learningEngineDot",
    "navDashboard", "navChat", "navVoice", "navBrowser", "navFiles", "navMemory",
    "navSettings", "navHealth", "navBackgroundEvents",
    "aiStatus", "voiceStatus", "internetStatus", "username",
    "healthPanel", "backgroundEventsPanel", "memoryPanel", "settingsPanel", "filesPanel",
    "greetingCard", "greetingName", "greetingTime", "greetingQuote", "systemStatus",
    "orb", "consciousnessMode", "consciousnessMood", "consciousnessGoal",
    "chatMessages", "typingIndicator", "chatInput", "voiceBtn", "chatStatus",
    "cpuPercent", "ramPercent", "diskPercent", "netSpeed",
    "historyList", "notificationList",
    "footerStatus", "wakeWordToggle", "personalityStyleSelect",
    "fileAttachmentBar", "fileAttachmentName", "fileUploadBtn"
];
test(`all ${LEGACY.length} critical legacy IDs exist exactly once`, () => {
    for (const id of LEGACY) {
        const n = html.split(`id="${id}"`).length - 1;
        assert.strictEqual(n, 1, `#${id} appears ${n}x (must be exactly 1)`);
    }
});

test("orb relocated but intact (orb-container + rings + orb-art)", () => {
    assert.ok(html.includes('id="orb"'));
    assert.ok(html.includes("orb-container"));
    for (let i = 1; i <= 5; i++) assert.ok(html.includes(`ring ring${i}`), `ring${i}`);
});

test("all script tags point to files that exist", () => {
    const tags = [...html.matchAll(/src="(js\/[^"]+\.js)"/g)].map(m => m[1]);
    const missing = tags.filter(t => !fs.existsSync(path.join(ROOT, "renderer", t)));
    assert.deepStrictEqual(missing, []);
    assert.ok(tags.includes("js/commandCenter.js"), "commandCenter.js wired");
});

// ============================================================
// 3. CSS LAYER
// ============================================================
console.log("\n--- 3. CSS ---");

test("command center layer present with reference styling", () => {
    assert.ok(css.includes("COMMAND CENTER LAYER"), "layer banner");
    assert.ok(css.includes("#ccDashboard"), "grid");
    assert.ok(css.includes(".cc-panel::before"), "bracketed corners");
    assert.ok(css.includes(".cc-gauge-dial"), "circular gauges");
    assert.ok(css.includes(".cc-talkbar"), "pill talk bar");
    assert.ok(css.includes(".cc-wave"), "waveform");
    assert.ok(css.includes("scanline"), "scanlines");
});

test("amber-gold core (MCU reference) + cyan UI", () => {
    assert.ok(css.includes("rgba(255, 176, 0"), "amber rings");
    assert.ok(css.includes("cc-core-label"), "core label");
    assert.ok(css.includes("#ccCorePanel #orb .orb-glow"), "amber core glow");
});

test("dashboard grid: 12-col grid with span placements", () => {
    assert.ok(css.includes("grid-template-columns: repeat(12, 1fr)"));
    const cssNorm = css.replace(/\s+/g, " ").replace(/\s*\{\s*/g, " { ");
    for (const sel of ["#ccCoreOverview", "#ccCorePanel", "#ccLiveFeed", "#ccAgents",
                       "#ccTimeline", "#ccSystemMonitor", "#ccMemoryInsights", "#ccKnowledge"]) {
        assert.ok(cssNorm.includes(sel + " { grid-column"), sel + " placement");
    }
});

// ============================================================
// 4. ENGINE (commandCenter.js — Node-safe)
// ============================================================
console.log("\n--- 4. Engine ---");

test("commandCenter.js exposes JARVISCommandCenter with core API", () => {
    for (const fn of ["start", "stop", "pushFeed", "refreshAgents", "refreshSources", "sendViaChat"]) {
        assert.ok(ccjs.includes(fn + ":"), fn);
    }
    assert.ok(ccjs.includes("window.JARVISCommandCenter = CommandCenter"));
    assert.ok(ccjs.includes("module.exports = CommandCenter"), "dual export");
});

test("talk bar routes through the EXISTING chat pipeline (no logic duplication)", () => {
    assert.ok(ccjs.includes('$("chatInput")'));
    assert.ok(ccjs.includes('KeyboardEvent("keydown"'));
});

test("REAL data only — every refresh reads live bridges", () => {
    assert.ok(ccjs.includes("JARVISBootHealth"), "boot health for overview");
    assert.ok(ccjs.includes("JARVISKnowledgeSourceChain"), "chain for sources");
    assert.ok(ccjs.includes("window.jarvis.memory"), "memory IPC");
    assert.ok(ccjs.includes("JARVISKnowledgeStore"), "knowledge stats");
    assert.ok(ccjs.includes("MutationObserver"), "observes existing updated elements (cpuPercent etc.)");
    assert.ok(ccjs.includes("getCurrent") && ccjs.includes("jarvis.users"), "real user profile");
});

test("no fake/invented telemetry values in the engine", () => {
    // engine must not hard-code any fake metric numbers
    assert.ok(!/cpuPercent.*=\s*"\d+/.test(ccjs));
    assert.ok(!ccjs.includes("Math.random()"), "no random fake values");
});

test("honest degradation — panels show '—' / OFFLINE when data missing", () => {
    assert.ok(ccjs.includes('"—"'));
    assert.ok(ccjs.includes("STANDBY"));
    assert.ok(ccjs.includes("OFFLINE"));
});

test("UI rules honored (docs/UI_FLOW.md)", () => {
    // no secrets / no node access / no shell in the UI engine
    assert.ok(!ccjs.includes("require("));
    assert.ok(!/process\.env/.test(ccjs));
    assert.ok(!ccjs.includes("child_process"));
    assert.ok(!ccjs.includes("exec("));
    assert.ok(!/api[_-]?key\s*[:=]/i.test(ccjs));
});

// ============================================================
// 5. bootHealth dependency intact
// ============================================================
console.log("\n--- 5. Dependencies ---");

test("bootHealth.js still present and loaded before commandCenter.js", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "renderer/js/bootHealth.js")));
    const bhIdx = html.indexOf("js/bootHealth.js");
    const ccIdx = html.indexOf("js/commandCenter.js");
    assert.ok(bhIdx > 0 && ccIdx > bhIdx, "load order");
});

test("chain + domainRouter still loaded (knowledge panel needs them)", () => {
    assert.ok(html.includes("js/learning/knowledgeSourceChain.js"));
    assert.ok(html.includes("js/learning/domainRouter.js"));
});

// ============================================================
// SUMMARY
// ============================================================
console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");
if (failed > 0) process.exit(1);
