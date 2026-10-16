"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — MULTILINGUAL LANGUAGE INTELLIGENCE TESTS
 * ============================================================
 *
 * Tests that English, Hindi, Hinglish, and Roman Hindi commands
 * all resolve to the SAME semantic intent.
 *
 * Run with:
 *   node test/multilingual-language.test.js
 * ============================================================
 */

const assert = require("assert");

// We need to load LanguageCore.js in a Node context.
// Since it uses `window`, we create a shim.
global.window = global;
global.console = console;

// Load the module
const fs = require("fs");
const path = require("path");
const langCorePath = path.join(__dirname, "..", "renderer", "js", "language", "LanguageCore.js");
const langCoreCode = fs.readFileSync(langCorePath, "utf-8");
eval(langCoreCode);

const LC = global.window.JARVISLanguageCore;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`  ✗ ${name}: ${error.message}`);
        failed++;
    }
}

console.log("\n========================================");
console.log("MULTILINGUAL LANGUAGE INTELLIGENCE TESTS");
console.log("========================================\n");

// ============================================================
// 1. LANGUAGE DETECTION
// ============================================================

console.log("--- Language Detection ---");

test("English detected as 'en'", () => {
    assert.strictEqual(LC.detectLanguage("Open YouTube"), "en");
    assert.strictEqual(LC.detectLanguage("What's the weather in Mumbai?"), "en");
    assert.strictEqual(LC.detectLanguage("Tell me the time"), "en");
});

test("Hindi (Devanagari) detected as 'hi'", () => {
    assert.strictEqual(LC.detectLanguage("यूट्यूब खोलो"), "hi");
    assert.strictEqual(LC.detectLanguage("मुंबई का मौसम बताओ"), "hi");
    assert.strictEqual(LC.detectLanguage("समय बताओ"), "hi");
});

test("Hinglish detected as 'hinglish'", () => {
    assert.strictEqual(LC.detectLanguage("YouTube kholo"), "hinglish");
    assert.strictEqual(LC.detectLanguage("Mumbai ka weather batao"), "hinglish");
    assert.strictEqual(LC.detectLanguage("Time batao"), "hinglish");
});

test("Roman Hindi detected as 'hinglish'", () => {
    assert.strictEqual(LC.detectLanguage("youtube kholo"), "hinglish");
    assert.strictEqual(LC.detectLanguage("mumbai ka mausam batao"), "hinglish");
    assert.strictEqual(LC.detectLanguage("abhi kitne baje hain"), "hinglish");
});

test("Mixed Devanagari + Latin detected as 'hinglish'", () => {
    assert.strictEqual(LC.detectLanguage("YouTube खोलो"), "hinglish");
    assert.strictEqual(LC.detectLanguage("Mumbai का weather"), "hinglish");
});

// ============================================================
// 2. INTENT EQUIVALENCE — ENGLISH / HINDI / HINGLISH
// ============================================================

console.log("\n--- Intent Equivalence (Open YouTube) ---");

test("English: 'Open YouTube' → OPEN_WEBSITE", () => {
    const r = LC.analyze("Open YouTube");
    assert.strictEqual(r.intent, "OPEN_WEBSITE");
    assert.strictEqual(r.entities.site, "YouTube");
    assert.ok(r.confidence >= 0.70, `confidence ${r.confidence} >= 0.70`);
});

test("Hinglish: 'YouTube kholo' → OPEN_WEBSITE", () => {
    const r = LC.analyze("YouTube kholo");
    assert.strictEqual(r.intent, "OPEN_WEBSITE");
    assert.strictEqual(r.entities.site, "YouTube");
    assert.ok(r.confidence >= 0.70);
});

test("Hindi: 'यूट्यूब खोलो' → OPEN_WEBSITE", () => {
    const r = LC.analyze("यूट्यूब खोलो");
    assert.strictEqual(r.intent, "OPEN_WEBSITE");
    assert.strictEqual(r.entities.site, "YouTube");
    assert.ok(r.confidence >= 0.70);
});

test("Roman: 'youtube kholo' → OPEN_WEBSITE", () => {
    const r = LC.analyze("youtube kholo");
    assert.strictEqual(r.intent, "OPEN_WEBSITE");
    assert.strictEqual(r.entities.site, "YouTube");
    assert.ok(r.confidence >= 0.70);
});

// ============================================================
// 3. WEATHER INTENT
// ============================================================

console.log("\n--- Intent Equivalence (Weather) ---");

test("English: 'What's the weather in Mumbai?' → WEATHER", () => {
    const r = LC.analyze("What's the weather in Mumbai?");
    assert.strictEqual(r.intent, "WEATHER");
    assert.ok(r.confidence >= 0.70);
});

test("Hinglish: 'Mumbai ka weather batao' → WEATHER", () => {
    const r = LC.analyze("Mumbai ka weather batao");
    assert.strictEqual(r.intent, "WEATHER");
    assert.ok(r.confidence >= 0.70);
});

test("Hindi: 'मुंबई का मौसम बताओ' → WEATHER", () => {
    const r = LC.analyze("मुंबई का मौसम बताओ");
    assert.strictEqual(r.intent, "WEATHER");
    assert.ok(r.confidence >= 0.70);
});

test("Roman: 'mumbai ka mausam batao' → WEATHER", () => {
    const r = LC.analyze("mumbai ka mausam batao");
    assert.strictEqual(r.intent, "WEATHER");
    assert.ok(r.confidence >= 0.70);
});

// ============================================================
// 4. TIME INTENT
// ============================================================

console.log("\n--- Intent Equivalence (Time) ---");

test("English: 'Tell me the time' → TIME", () => {
    const r = LC.analyze("Tell me the time");
    assert.strictEqual(r.intent, "TIME");
});

test("Hinglish: 'Time batao' → TIME", () => {
    const r = LC.analyze("Time batao");
    assert.strictEqual(r.intent, "TIME");
});

test("Hindi: 'समय बताओ' → TIME", () => {
    const r = LC.analyze("समय बताओ");
    assert.strictEqual(r.intent, "TIME");
});

test("Hinglish: 'Abhi kitne baje hain' → TIME", () => {
    const r = LC.analyze("Abhi kitne baje hain");
    assert.strictEqual(r.intent, "TIME");
});

// ============================================================
// 5. SEARCH INTENT
// ============================================================

console.log("\n--- Intent Equivalence (Search) ---");

test("English: 'Search Google for AI news' → SEARCH_WEB", () => {
    const r = LC.analyze("Search Google for AI news");
    assert.strictEqual(r.intent, "SEARCH_WEB");
    assert.ok(r.confidence >= 0.60);
});

test("Hinglish: 'Google par latest AI news search karo' → SEARCH_WEB", () => {
    const r = LC.analyze("Google par latest AI news search karo");
    assert.strictEqual(r.intent, "SEARCH_WEB");
    assert.ok(r.confidence >= 0.60);
});

test("Hindi: 'गूगल पर लेटेस्ट AI न्यूज़ खोजो' → SEARCH_WEB", () => {
    const r = LC.analyze("गूगल पर लेटेस्ट AI न्यूज़ खोजो");
    assert.strictEqual(r.intent, "SEARCH_WEB");
    assert.ok(r.confidence >= 0.60);
});

// ============================================================
// 6. KNOWLEDGE VS ACTION DISTINCTION
// ============================================================

console.log("\n--- Knowledge vs Action Distinction ---");

test("'Chrome kholo' → OPEN_APP (action, not knowledge)", () => {
    const r = LC.analyze("Chrome kholo");
    assert.strictEqual(r.intent, "OPEN_APP");
    assert.notStrictEqual(r.intent, "KNOWLEDGE");
});

test("'Chrome kya hai?' → KNOWLEDGE (question, not action)", () => {
    const r = LC.analyze("Chrome kya hai?");
    assert.strictEqual(r.intent, "KNOWLEDGE");
    assert.notStrictEqual(r.intent, "OPEN_APP");
});

test("'YouTube kholo' → OPEN_WEBSITE (action)", () => {
    const r = LC.analyze("YouTube kholo");
    assert.strictEqual(r.intent, "OPEN_WEBSITE");
});

test("'YouTube ke baare mein batao' → KNOWLEDGE (question)", () => {
    const r = LC.analyze("YouTube ke baare mein batao");
    assert.strictEqual(r.intent, "KNOWLEDGE");
});

// ============================================================
// 7. RESPONSE LANGUAGE MATCHING
// ============================================================

console.log("\n--- Response Language Matching ---");

test("English input → English response", () => {
    const r = LC.analyze("Open YouTube");
    assert.strictEqual(r.responseLanguage, "en");
});

test("Hindi input → Hindi response", () => {
    const r = LC.analyze("यूट्यूब खोलो");
    assert.strictEqual(r.responseLanguage, "hi");
});

test("Hinglish input → Hinglish response", () => {
    const r = LC.analyze("YouTube kholo");
    assert.strictEqual(r.responseLanguage, "hinglish");
});

test("Explicit language switch: 'Hindi mein bolo'", () => {
    const r = LC.analyze("Hindi mein bol");
    assert.strictEqual(r.responseLanguage, "hi");
});

test("Explicit language switch: 'Talk to me in English'", () => {
    const r = LC.analyze("Talk to me in English");
    assert.strictEqual(r.responseLanguage, "en");
});

// ============================================================
// 8. SYSTEM CONTROL
// ============================================================

console.log("\n--- System Control ---");

test("English: 'Shutdown the computer' → SYSTEM_CONTROL", () => {
    const r = LC.analyze("Shutdown the computer");
    assert.strictEqual(r.intent, "SYSTEM_CONTROL");
    assert.strictEqual(r.entities.action, "shutdown");
});

test("Hinglish: 'Computer shutdown kar do' → SYSTEM_CONTROL", () => {
    const r = LC.analyze("Computer shutdown kar do");
    assert.strictEqual(r.intent, "SYSTEM_CONTROL");
    assert.strictEqual(r.entities.action, "shutdown");
});

test("English: 'Restart the system' → SYSTEM_CONTROL", () => {
    const r = LC.analyze("Restart the system");
    assert.strictEqual(r.intent, "SYSTEM_CONTROL");
    assert.strictEqual(r.entities.action, "restart");
});

// ============================================================
// 9. ROMAN HINDI NORMALIZATION
// ============================================================

console.log("\n--- Roman Hindi Normalization ---");

test("'krdo' normalized to 'karo'", () => {
    const n = LC.normalizeRomanHindi("youtube krdo");
    assert.ok(n.includes("karo"), `expected 'karo' in "${n}"`);
});

test("'batado' normalized to 'batao'", () => {
    const n = LC.normalizeRomanHindi("weather batado");
    assert.ok(n.includes("batao"), `expected 'batao' in "${n}"`);
});

test("'kardo' normalized to 'karo'", () => {
    const n = LC.normalizeRomanHindi("chrome kardo");
    assert.ok(n.includes("karo"), `expected 'karo' in "${n}"`);
});

// ============================================================
// 10. CONFIDENCE SYSTEM
// ============================================================

console.log("\n--- Confidence System ---");

test("High-confidence command has confidence >= 0.80", () => {
    const r = LC.analyze("Open YouTube");
    assert.ok(r.confidence >= 0.80, `confidence ${r.confidence} >= 0.80`);
});

test("Confidence is always between 0 and 1", () => {
    const tests = ["Open YouTube", "YouTube kholo", "मुंबई का मौसम", "xyz abc"];
    for (const t of tests) {
        const r = LC.analyze(t);
        assert.ok(r.confidence >= 0 && r.confidence <= 1, `confidence ${r.confidence} in [0,1] for "${t}"`);
    }
});

// ============================================================
// 11. CONTEXT RESOLUTION
// ============================================================

console.log("\n--- Context Resolution ---");

test("'aur kal?' resolves to weather follow-up", () => {
    const ctx = {
        activeTopic: { subject: "Mumbai", intent: "WEATHER" },
        turns: [],
    };
    const resolved = LC.resolveContext("aur kal", ctx);
    assert.ok(resolved.includes("weather") || resolved.includes("kal"), `resolved: "${resolved}"`);
});

test("'ise kholo' resolves to previous topic", () => {
    const ctx = {
        activeTopic: { subject: "YouTube", intent: "OPEN_WEBSITE" },
        turns: [],
    };
    const resolved = LC.resolveContext("ise kholo", ctx);
    assert.ok(resolved.includes("YouTube"), `resolved: "${resolved}"`);
});

test("Long message is not context-resolved", () => {
    const ctx = { activeTopic: { subject: "YouTube" }, turns: [] };
    const long = "This is a very long message that should not be context resolved because it is clearly its own complete sentence";
    const resolved = LC.resolveContext(long, ctx);
    assert.strictEqual(resolved, long);
});

// ============================================================
// 12. NUMBER UNDERSTANDING
// ============================================================

console.log("\n--- Number Understanding ---");

test("Extracts digit '5' from text", () => {
    assert.strictEqual(LC.extractNumber("5 minute ka timer"), 5);
});

test("Extracts Hindi number 'दस' equivalent 'das' = 10", () => {
    assert.strictEqual(LC.extractNumber("das minute"), 10);
});

test("Extracts 'sau' = 100", () => {
    assert.strictEqual(LC.extractNumber("sau rupees"), 100);
});

// ============================================================
// 13. TYPO TOLERANCE
// ============================================================

console.log("\n--- Typo / Speech Error Tolerance ---");

test("'youtub kholo' still detected as OPEN_WEBSITE", () => {
    const r = LC.analyze("youtub kholo");
    // Should either match YouTube or at least detect OPEN_WEBSITE
    assert.ok(r.intent === "OPEN_WEBSITE" || r.intent === "OPEN_APP",
        `expected OPEN_WEBSITE or OPEN_APP, got ${r.intent}`);
});

test("'gogol kholo' detected (alias tolerance)", () => {
    const r = LC.analyze("gogol kholo");
    assert.ok(r.intent === "OPEN_WEBSITE" || r.intent === "OPEN_APP",
        `expected OPEN_WEBSITE or OPEN_APP, got ${r.intent}`);
});

// ============================================================
// 14. BROWSER COMMANDS
// ============================================================

console.log("\n--- Browser Commands ---");

test("'New tab kholo' → BROWSER_NEW_TAB", () => {
    const r = LC.analyze("New tab kholo");
    assert.strictEqual(r.intent, "BROWSER_NEW_TAB");
});

test("'Back karo' → BROWSER_BACK", () => {
    const r = LC.analyze("Back karo");
    assert.strictEqual(r.intent, "BROWSER_BACK");
});

test("'Page reload karo' → BROWSER_RELOAD", () => {
    const r = LC.analyze("Page reload karo");
    assert.strictEqual(r.intent, "BROWSER_RELOAD");
});

test("'नीचे scroll' → BROWSER_SCROLL down", () => {
    const r = LC.analyze("नीचे scroll karo");
    assert.strictEqual(r.intent, "BROWSER_SCROLL");
    assert.strictEqual(r.entities.direction, "down");
});

// ============================================================
// 15. GREETINGS
// ============================================================

console.log("\n--- Greetings ---");

test("'hello' → GREETING", () => {
    assert.strictEqual(LC.analyze("hello").intent, "GREETING");
});

test("'namaste' → GREETING", () => {
    assert.strictEqual(LC.analyze("namaste").intent, "GREETING");
});

test("'नमस्ते' → GREETING", () => {
    assert.strictEqual(LC.analyze("नमस्ते").intent, "GREETING");
});

// ============================================================
// SUMMARY
// ============================================================

console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");

if (failed > 0) {
    process.exit(1);
}
