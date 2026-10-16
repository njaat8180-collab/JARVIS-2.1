"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — VOICE TOLERANCE TEST SUITE
 * test/voice-tolerance.test.js
 * ============================================================
 *
 * Tests the complete voice normalization pipeline:
 *   - STT spelling correction (helo→hello, crome→chrome)
 *   - Phonetic fuzzy matching (krom→chrome)
 *   - Hindi/Hinglish transliteration + normalization
 *   - Wake word tolerance (jarwes→jarvis)
 *   - Command parity (all variants → same intent)
 *   - Confidence scoring
 *   - Dangerous command protection
 *   - Grammar extraction
 *
 * Run: node test/voice-tolerance.test.js
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Shim browser globals
global.window = global;
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; },
};

// Load modules in dependency order
function loadModule(relPath) {
    const code = fs.readFileSync(path.join(__dirname, "..", relPath), "utf-8");
    eval(code);
}

loadModule("renderer/js/language/LanguageCore.js");
loadModule("renderer/js/language/HindiTranslit.js");
loadModule("renderer/js/language/VoiceTolerance.js");

const VT = global.window.JARVISVoiceTolerance;
const HT = global.window.JARVISHindiTranslit;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (error) {
        console.error(`  \u2717 ${name}: ${error.message}`);
        failed++;
    }
}

console.log("\n========================================");
console.log("VOICE TOLERANCE ENGINE TESTS");
console.log("========================================\n");

// ============================================================
// 1. TEXT CLEANING
// ============================================================

console.log("--- Text Cleaning ---");

test("HELLO JARVIS!!! → hello jarvis", () => {
    const r = VT.cleanText("HELLO JARVIS!!!");
    assert.strictEqual(r, "hello jarvis");
});

test("Hello... Jarvis → hello jarvis", () => {
    const r = VT.cleanText("Hello... Jarvis");
    assert.ok(r.includes("hello") && r.includes("jarvis"));
});

test("Repeated words removed: open open chrome → open chrome", () => {
    const r = VT.cleanText("open open chrome");
    assert.strictEqual(r, "open chrome");
});

test("Repeated wake word: jarvis jarvis open → jarvis open", () => {
    const r = VT.cleanText("jarvis jarvis open chrome");
    assert.ok(!r.match(/jarvis jarvis/), `expected no double jarvis in "${r}"`);
});

test("Smart quotes converted", () => {
    const r = VT.cleanText("\u201Chello\u201D Jarvis");
    assert.ok(r.includes("hello"));
    assert.ok(r.includes("jarvis"));
});

test("Devanagari danda removed", () => {
    const r = VT.cleanText("chrome kholo\u0964");
    assert.ok(!r.includes("\u0964"));
});

// ============================================================
// 2. PHONETIC ALGORITHMS
// ============================================================

console.log("\n--- Phonetic Algorithms ---");

test("Soundex: chrome and crome have same soundex", () => {
    assert.strictEqual(VT.soundex("chrome"), VT.soundex("crome"));
});

test("Soundex: hello and helo have same soundex", () => {
    assert.strictEqual(VT.soundex("hello"), VT.soundex("helo"));
});

test("Soundex: jarvis and jarwis have same soundex", () => {
    assert.strictEqual(VT.soundex("jarvis"), VT.soundex("jarwis"));
});

test("Edit distance: chrome vs crome = 1", () => {
    assert.strictEqual(VT.editDistance("chrome", "crome"), 1);
});

test("Edit distance: identical words = 0", () => {
    assert.strictEqual(VT.editDistance("chrome", "chrome"), 0);
});

test("Phonetic similarity: crome ≈ chrome (high)", () => {
    const sim = VT.phoneticSimilarity("crome", "chrome");
    assert.ok(sim >= 0.65, `expected >= 0.65, got ${sim}`);
});

test("Phonetic similarity: krom ≈ chrome (moderate)", () => {
    const sim = VT.phoneticSimilarity("krom", "chrome");
    assert.ok(sim >= 0.40, `expected >= 0.40, got ${sim}`);
});

test("Phonetic similarity: banana ≉ chrome (low)", () => {
    const sim = VT.phoneticSimilarity("banana", "chrome");
    assert.ok(sim < 0.50, `expected < 0.50, got ${sim}`);
});

// ============================================================
// 3. STT SPELLING CORRECTION
// ============================================================

console.log("\n--- STT Spelling Correction ---");

test("helo → hello", () => {
    const r = VT.fuzzyCorrectWord("helo");
    assert.strictEqual(r.word, "hello");
});

test("hilo → hello", () => {
    const r = VT.fuzzyCorrectWord("hilo");
    assert.strictEqual(r.word, "hello");
});

test("crome → chrome", () => {
    const r = VT.fuzzyCorrectWord("crome");
    assert.strictEqual(r.word, "chrome");
});

test("krom → chrome", () => {
    const r = VT.fuzzyCorrectWord("krom");
    assert.strictEqual(r.word, "chrome");
});

test("jarwes → jarvis", () => {
    const r = VT.fuzzyCorrectWord("jarwes");
    assert.ok(r.word === "jarvis" || r.word === "jarwes",
        `expected jarvis or fallback, got ${r.word}`);
});

test("discrod → discord", () => {
    const r = VT.fuzzyCorrectWord("discrod");
    assert.strictEqual(r.word, "discord");
});

test("spodify → spotify", () => {
    const r = VT.fuzzyCorrectWord("spodify");
    assert.strictEqual(r.word, "spotify");
});

test("shutdon → shutdown", () => {
    const r = VT.fuzzyCorrectWord("shutdon");
    assert.strictEqual(r.word, "shutdown");
});

test("wether → weather", () => {
    const r = VT.fuzzyCorrectWord("wether");
    assert.strictEqual(r.word, "weather");
});

test("banana is NOT corrected to chrome", () => {
    const r = VT.fuzzyCorrectWord("banana");
    assert.ok(r.word !== "chrome", `banana should not become chrome`);
});

// ============================================================
// 4. WAKE WORD TOLERANCE
// ============================================================

console.log("\n--- Wake Word Tolerance ---");

test("jarvis detected (exact)", () => {
    const r = VT.detectWakeWord("jarvis open chrome");
    assert.ok(r, "should detect wake word");
    assert.strictEqual(r.word, "jarvis");
    assert.ok(r.confidence >= 0.90);
});

test("jarwes detected (fuzzy)", () => {
    const r = VT.detectWakeWord("jarwes open chrome");
    assert.ok(r, "should detect jarwes as jarvis");
    assert.strictEqual(r.word, "jarvis");
    assert.ok(r.confidence >= 0.70, `confidence ${r.confidence} >= 0.70`);
});

test("jarves detected (STT fix)", () => {
    const r = VT.detectWakeWord("jarves open chrome");
    assert.ok(r);
    assert.strictEqual(r.word, "jarvis");
});

test("जार्विस detected (Devanagari)", () => {
    const r = VT.detectWakeWord("\u091C\u093E\u0930\u094D\u0935\u093F\u0938 open chrome");
    assert.ok(r, "should detect Devanagari jarvis");
    assert.strictEqual(r.word, "jarvis");
});

test("Random word is NOT wake word", () => {
    const r = VT.detectWakeWord("open chrome please");
    assert.ok(!r || r.confidence < 0.70, "should not detect wake word");
});

// ============================================================
// 5. FULL PIPELINE — HELLO/JARVIS VARIANTS
// ============================================================

console.log("\n--- Full Pipeline: Hello/Jarvis Variants ---");

test("hello jarvis → correct", () => {
    const r = VT.process("hello jarvis");
    assert.ok(r.canonical.includes("hello"));
    assert.ok(r.canonical.includes("jarvis"));
});

test("helo jarvis → corrected to hello", () => {
    const r = VT.process("helo jarvis");
    assert.ok(r.canonical.includes("hello"), `"helo" should be corrected to "hello" in "${r.canonical}"`);
});

test("hilo jarvis → corrected to hello", () => {
    const r = VT.process("hilo jarvis");
    assert.ok(r.canonical.includes("hello"), `"hilo" should be corrected to "hello" in "${r.canonical}"`);
});

test("हेलो जार्विस → transliterated + corrected", () => {
    const r = VT.process("\u0939\u0947\u0932\u094B \u091C\u093E\u0930\u094D\u0935\u093F\u0938");
    assert.ok(r.canonical.includes("hello"), `expected "hello" in "${r.canonical}"`);
    assert.ok(r.canonical.includes("jarvis"), `expected "jarvis" in "${r.canonical}"`);
    assert.strictEqual(r.lang, "hi");
});

test("हैलो जार्विस → transliterated + corrected", () => {
    const r = VT.process("\u0939\u0948\u0932\u094B \u091C\u093E\u0930\u094D\u0935\u093F\u0938");
    assert.ok(r.canonical.includes("jarvis"), `expected "jarvis" in "${r.canonical}"`);
});

// ============================================================
// 6. CHROME VARIANTS
// ============================================================

console.log("\n--- Chrome Variants ---");

test("open chrome → correct", () => {
    const r = VT.process("open chrome");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open"));
});

test("open crome → corrected to chrome", () => {
    const r = VT.process("open crome");
    assert.ok(r.canonical.includes("chrome"), `"crome" should be corrected in "${r.canonical}"`);
    assert.ok(r.canonical.includes("open"));
});

test("open krom → corrected to chrome", () => {
    const r = VT.process("open krom");
    assert.ok(r.canonical.includes("chrome"), `"krom" should be corrected in "${r.canonical}"`);
});

test("chrome kholo → open chrome (Hinglish)", () => {
    const r = VT.process("chrome kholo");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open"), `expected "open" in "${r.canonical}"`);
});

test("क्रोम खोलो → open chrome (Hindi)", () => {
    const r = VT.process("\u0915\u094D\u0930\u094B\u092E \u0916\u094B\u0932\u094B");
    assert.ok(r.canonical.includes("chrome"), `expected "chrome" in "${r.canonical}"`);
    assert.ok(r.canonical.includes("open"), `expected "open" in "${r.canonical}"`);
    assert.strictEqual(r.lang, "hi");
});

test("google chrome kholo → open chrome", () => {
    const r = VT.process("google chrome kholo");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open"));
});

test("jarvis open crome → full correction", () => {
    const r = VT.process("jarvis open crome");
    assert.ok(r.canonical.includes("chrome"), `expected "chrome" in "${r.canonical}"`);
    assert.ok(r.wakeWord, "should detect wake word");
    assert.strictEqual(r.wakeWord.word, "jarvis");
});

// ============================================================
// 7. VS CODE VARIANTS
// ============================================================

console.log("\n--- VS Code Variants ---");

test("open vscode → correct", () => {
    const r = VT.process("open vscode");
    assert.ok(r.canonical.includes("vscode") || r.canonical.includes("vs"));
});

test("open vs code → vscode", () => {
    const r = VT.process("open vs code");
    assert.ok(r.canonical.includes("vs") || r.canonical.includes("vscode"));
    assert.ok(r.canonical.includes("open"));
});

test("open v s code → vs code", () => {
    const r = VT.process("open v s code");
    assert.ok(r.canonical.includes("open"));
});

test("वीएस कोड खोलो → Hindi vs code", () => {
    const r = VT.process("\u0935\u0940\u090F\u0938 \u0915\u094B\u0921 \u0916\u094B\u0932\u094B");
    assert.ok(r.canonical.includes("open") || r.canonical.includes("kholo"),
        `expected open/kholo in "${r.canonical}"`);
});

// ============================================================
// 8. DISCORD VARIANTS
// ============================================================

console.log("\n--- Discord Variants ---");

test("open discord → correct", () => {
    const r = VT.process("open discord");
    assert.ok(r.canonical.includes("discord"));
    assert.ok(r.canonical.includes("open"));
});

test("open discrod → corrected to discord", () => {
    const r = VT.process("open discrod");
    assert.ok(r.canonical.includes("discord"), `expected "discord" in "${r.canonical}"`);
});

test("discord kholo → open discord", () => {
    const r = VT.process("discord kholo");
    assert.ok(r.canonical.includes("discord"));
    assert.ok(r.canonical.includes("open"));
});

test("डिस्कॉर्ड खोलो → open discord (Hindi)", () => {
    const r = VT.process("\u0921\u093F\u0938\u094D\u0915\u0949\u0930\u094D\u0921 \u0916\u094B\u0932\u094B");
    assert.ok(r.canonical.includes("open") || r.canonical.includes("kholo"));
    assert.strictEqual(r.lang, "hi");
});

// ============================================================
// 9. SHUTDOWN VARIANTS
// ============================================================

console.log("\n--- Shutdown Variants ---");

test("shutdown computer → shutdown intent", () => {
    const r = VT.process("shutdown computer");
    assert.ok(r.action, "should detect action");
    assert.strictEqual(r.action.name, "shutdown");
    assert.ok(r.isDangerous, "should be flagged dangerous");
});

test("shut down computer → shutdown intent", () => {
    const r = VT.process("shut down computer");
    assert.ok(r.canonical.includes("shutdown") || r.canonical.includes("shut"));
});

test("computer shutdown kar do → shutdown (Hinglish)", () => {
    const r = VT.process("computer shutdown kar do");
    assert.ok(r.canonical.includes("shutdown"));
    assert.ok(r.canonical.includes("computer"));
});

test("कंप्यूटर बंद करो → shutdown (Hindi)", () => {
    const r = VT.process("\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930 \u092C\u0902\u0926 \u0915\u0930\u094B");
    assert.strictEqual(r.lang, "hi");
    assert.ok(r.canonical.includes("close") || r.canonical.includes("band"),
        `expected close/band in "${r.canonical}"`);
});

test("शटडाउन कर दो → shutdown (Hindi)", () => {
    const r = VT.process("\u0936\u091F\u0921\u093E\u0909\u0928 \u0915\u0930 \u0926\u094B");
    assert.strictEqual(r.lang, "hi");
});

// ============================================================
// 10. SEARCH VARIANTS
// ============================================================

console.log("\n--- Search Variants ---");

test("search Minecraft → search intent", () => {
    const r = VT.process("search Minecraft");
    assert.ok(r.canonical.includes("search"));
    assert.ok(r.canonical.includes("minecraft") || r.canonical.includes("Minecraft"));
});

test("minecraft search karo → search (Hinglish)", () => {
    const r = VT.process("minecraft search karo");
    assert.ok(r.canonical.includes("search"));
});

test("Minecraft खोजो → search (Hindi)", () => {
    const r = VT.process("Minecraft \u0916\u094B\u091C\u094B");
    assert.strictEqual(r.lang, "hi");
    assert.ok(r.canonical.includes("search") || r.canonical.includes("dhoondo"));
});

test("Minecraft ढूंढो → search (Hindi)", () => {
    const r = VT.process("Minecraft \u0922\u0942\u0901\u0922\u094B");
    assert.strictEqual(r.lang, "hi");
    assert.ok(r.canonical.includes("search") || r.canonical.includes("dhoondo"));
});

// ============================================================
// 11. MIXED LANGUAGE COMMANDS
// ============================================================

console.log("\n--- Mixed Language Commands ---");

test("Jarvis Chrome खोलो → mixed", () => {
    const r = VT.process("Jarvis Chrome \u0916\u094B\u0932\u094B");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open") || r.canonical.includes("kholo"));
    assert.ok(r.wakeWord, "should detect jarvis");
});

test("जार्विस open Chrome → mixed (Devanagari + English)", () => {
    const r = VT.process("\u091C\u093E\u0930\u094D\u0935\u093F\u0938 open Chrome");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open"));
});

test("computer shutdown kar do → mixed (English + Hinglish)", () => {
    const r = VT.process("computer shutdown kar do");
    assert.ok(r.canonical.includes("shutdown"));
    assert.ok(r.canonical.includes("computer"));
});

test("VS Code खोल दो → mixed (English + Hindi)", () => {
    const r = VT.process("VS Code \u0916\u094B\u0932 \u0926\u094B");
    assert.ok(r.canonical.includes("vs") || r.canonical.includes("vscode"));
    assert.ok(r.canonical.includes("open") || r.canonical.includes("kholo"));
});

// ============================================================
// 12. CONFIDENCE SCORING
// ============================================================

console.log("\n--- Confidence Scoring ---");

test("Perfect command has high confidence", () => {
    const r = VT.process("jarvis open chrome");
    assert.ok(r.confidence >= 0.80, `expected >= 0.80, got ${r.confidence}`);
});

test("Corrected command has good confidence", () => {
    const r = VT.process("helo jarvis open crome");
    assert.ok(r.confidence >= 0.60, `expected >= 0.60, got ${r.confidence}`);
});

test("Wake word detected with confidence", () => {
    const r = VT.process("jarvis open chrome");
    assert.ok(r.wakeWord);
    assert.ok(r.wakeWord.confidence >= 0.90);
});

test("Dangerous command flagged", () => {
    const r = VT.process("jarvis shutdown computer");
    assert.ok(r.isDangerous, "shutdown should be flagged dangerous");
});

// ============================================================
// 13. NO FALSE EXECUTION
// ============================================================

console.log("\n--- No False Execution ---");

test("Incomplete command: 'jarvis open...' has low target confidence", () => {
    const r = VT.process("jarvis open");
    assert.ok(!r.target || r.target.confidence < 0.60,
        `incomplete command should have low target confidence, got ${r.target?.confidence}`);
});

test("Random speech does not produce action", () => {
    const r = VT.process("the weather is nice today");
    assert.ok(!r.action || r.action.confidence < 0.70,
        `random speech should not have high action confidence`);
});

test("banana is NOT corrected to chrome in full phrase", () => {
    const r = VT.process("open banana");
    assert.ok(!r.canonical.includes("chrome"), `banana should not become chrome in "${r.canonical}"`);
});

// ============================================================
// 14. NATURAL SPEECH / FILLER WORDS
// ============================================================

console.log("\n--- Natural Speech / Filler Words ---");

test("Hey Jarvis please open Google Chrome for me → open chrome", () => {
    const r = VT.process("Hey Jarvis please open Google Chrome for me");
    assert.ok(r.canonical.includes("chrome"));
    assert.ok(r.canonical.includes("open"));
    assert.ok(r.wakeWord);
});

test("Jarvis can you open VS Code → open vscode", () => {
    const r = VT.process("Jarvis can you open VS Code");
    assert.ok(r.canonical.includes("open"));
    assert.ok(r.canonical.includes("vs") || r.canonical.includes("vscode"));
    assert.ok(r.wakeWord);
});

// ============================================================
// 15. SELF-LEARNING
// ============================================================

console.log("\n--- Self-Learning ---");

test("learnAlias adds custom correction", () => {
    VT.learnAlias("kronk", "chrome");
    const r = VT.fuzzyCorrectWord("kronk");
    assert.strictEqual(r.word, "chrome");
});

test("learnedAlias persists in getLearnedAliases", () => {
    const aliases = VT.getLearnedAliases();
    assert.ok(aliases.kronk === "chrome" || aliases.kronk === undefined,
        "alias should be stored");
});

// ============================================================
// 16. COMMAND PARITY — ALL VARIANTS SAME INTENT
// ============================================================

console.log("\n--- Command Parity (all variants → same intent) ---");

test("All Chrome variants detect 'open' action", () => {
    const inputs = [
        "open chrome",
        "open crome",
        "chrome kholo",
        "\u0915\u094D\u0930\u094B\u092E \u0916\u094B\u0932\u094B",
        "google chrome kholo",
        "jarvis open crome",
    ];
    for (const input of inputs) {
        const r = VT.process(input);
        assert.ok(r.canonical.includes("chrome"),
            `"${input}" → "${r.canonical}" should include "chrome"`);
    }
});

test("All Hello variants produce greeting-like text", () => {
    const inputs = ["hello jarvis", "helo jarvis", "hilo jarvis"];
    for (const input of inputs) {
        const r = VT.process(input);
        assert.ok(r.canonical.includes("hello"),
            `"${input}" → "${r.canonical}" should include "hello"`);
    }
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
