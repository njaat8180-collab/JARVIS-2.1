"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — HINDI/ENGLISH COMMAND PARITY TESTS
 * ============================================================
 *
 * Tests that Hindi (Devanagari) commands, when transliterated
 * by HindiTranslit, produce the SAME canonical roman text as
 * their English/Hinglish equivalents. This proves that every
 * existing English command ALSO works when spoken in Hindi.
 *
 * Run with:
 *   node test/hindi-parity.test.js
 * ============================================================
 */

const assert = require("assert");

// Shim browser globals
global.window = global;

const fs = require("fs");
const path = require("path");

// Load HindiTranslit
const htCode = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "js", "language", "HindiTranslit.js"),
    "utf-8"
);
eval(htCode);
const HT = global.window.JARVISHindiTranslit;

// Load SmartReplies
const srCode = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "js", "language", "SmartReplies.js"),
    "utf-8"
);
eval(srCode);
const SR = global.window.JARVISSmartReplies;

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
console.log("HINDI/ENGLISH COMMAND PARITY TESTS");
console.log("========================================\n");

// ============================================================
// 1. DEVANAGARI DETECTION
// ============================================================

console.log("--- Devanagari Detection ---");

test("Detects Devanagari text", () => {
    assert.ok(HT.hasDevanagari("\u092F\u0942\u091F\u094D\u092F\u0942\u092C \u0916\u094B\u0932\u094B"));
    assert.ok(HT.hasDevanagari("\u092E\u0941\u0902\u092C\u0908 \u0915\u093E \u092E\u094C\u0938\u092E"));
});

test("Does not detect Devanagari in pure Latin text", () => {
    assert.ok(!HT.hasDevanagari("Open YouTube"));
    assert.ok(!HT.hasDevanagari("YouTube kholo"));
});

// ============================================================
// 2. BASIC TRANSLITERATION
// ============================================================

console.log("\n--- Basic Transliteration ---");

test("\u0916\u094B\u0932\u094B \u2192 kholo", () => {
    assert.strictEqual(HT.transliterate("\u0916\u094B\u0932\u094B"), "kholo");
});

test("\u092C\u0924\u093E\u0913 \u2192 batao", () => {
    assert.strictEqual(HT.transliterate("\u092C\u0924\u093E\u0913"), "batao");
});

test("\u092C\u0902\u0926 \u0915\u0930\u094B \u2192 band karo", () => {
    assert.strictEqual(HT.transliterate("\u092C\u0902\u0926 \u0915\u0930\u094B"), "band karo");
});

test("\u091A\u0932\u093E\u0913 \u2192 chalao", () => {
    assert.strictEqual(HT.transliterate("\u091A\u0932\u093E\u0913"), "chalao");
});

test("\u092E\u094C\u0938\u092E \u2192 mausam", () => {
    assert.strictEqual(HT.transliterate("\u092E\u094C\u0938\u092E"), "mausam");
});

test("\u0938\u092E\u092F \u2192 samay", () => {
    assert.strictEqual(HT.transliterate("\u0938\u092E\u092F"), "samay");
});

// ============================================================
// 3. ENTITY TRANSLITERATION (brands, cities)
// ============================================================

console.log("\n--- Entity Transliteration ---");

test("\u092F\u0942\u091F\u094D\u092F\u0942\u092C \u2192 youtube", () => {
    assert.strictEqual(HT.transliterate("\u092F\u0942\u091F\u094D\u092F\u0942\u092C"), "youtube");
});

test("\u0917\u0942\u0917\u0932 \u2192 google", () => {
    assert.strictEqual(HT.transliterate("\u0917\u0942\u0917\u0932"), "google");
});

test("\u0915\u094D\u0930\u094B\u092E \u2192 chrome", () => {
    assert.strictEqual(HT.transliterate("\u0915\u094D\u0930\u094B\u092E"), "chrome");
});

test("\u092E\u0941\u0902\u092C\u0908 \u2192 mumbai", () => {
    assert.strictEqual(HT.transliterate("\u092E\u0941\u0902\u092C\u0908"), "mumbai");
});

test("\u0926\u093F\u0932\u094D\u0932\u0940 \u2192 delhi", () => {
    assert.strictEqual(HT.transliterate("\u0926\u093F\u0932\u094D\u0932\u0940"), "delhi");
});

test("\u0935\u093F\u0915\u093F\u092A\u0940\u0921\u093F\u092F\u093E \u2192 wikipedia", () => {
    assert.strictEqual(HT.transliterate("\u0935\u093F\u0915\u093F\u092A\u0940\u0921\u093F\u092F\u093E"), "wikipedia");
});

test("\u0928\u0947\u091F\u092B\u094D\u0932\u093F\u0915\u094D\u0938 \u2192 netflix", () => {
    assert.strictEqual(HT.transliterate("\u0928\u0947\u091F\u092B\u094D\u0932\u093F\u0915\u094D\u0938"), "netflix");
});

// ============================================================
// 4. FULL COMMAND PARITY — Hindi = English
// ============================================================

console.log("\n--- Full Command Parity ---");

test("YouTube kholo: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u092F\u0942\u091F\u094D\u092F\u0942\u092C \u0916\u094B\u0932\u094B");
    const hinglish = HT.toCanonical("youtube kholo");
    assert.strictEqual(hindi, hinglish);
});

test("Mumbai ka mausam batao: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u092E\u0941\u0902\u092C\u0908 \u0915\u093E \u092E\u094C\u0938\u092E \u092C\u0924\u093E\u0913");
    const hinglish = HT.toCanonical("mumbai ka mausam batao");
    assert.strictEqual(hindi, hinglish);
});

test("Browser band karo: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u092C\u094D\u0930\u093E\u0909\u091C\u093C\u0930 \u092C\u0902\u0926 \u0915\u0930\u094B");
    const hinglish = HT.toCanonical("browser band karo");
    assert.strictEqual(hindi, hinglish);
});

test("Samay batao: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u0938\u092E\u092F \u092C\u0924\u093E\u0913");
    const hinglish = HT.toCanonical("samay batao");
    assert.strictEqual(hindi, hinglish);
});

test("Google par search karo: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u0917\u0942\u0917\u0932 \u092A\u0930 \u0938\u0930\u094D\u091A \u0915\u0930\u094B");
    const hinglish = HT.toCanonical("google par search karo");
    assert.strictEqual(hindi, hinglish);
});

test("Naya tab kholo: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u0928\u092F\u093E \u091F\u0948\u092C \u0916\u094B\u0932\u094B");
    const hinglish = HT.toCanonical("naya tab kholo");
    assert.strictEqual(hindi, hinglish);
});

test("Computer band karo: Hindi = Hinglish", () => {
    const hindi = HT.toCanonical("\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930 \u092C\u0902\u0926 \u0915\u0930\u094B");
    const hinglish = HT.toCanonical("computer band karo");
    assert.strictEqual(hindi, hinglish);
});

// ============================================================
// 5. DEVANAGARI DIGITS
// ============================================================

console.log("\n--- Devanagari Digits ---");

test("\u0967\u0968\u0969 \u2192 123", () => {
    assert.strictEqual(HT.transliterate("\u0967\u0968\u0969"), "123");
});

test("\u096B \u092E\u093F\u0928\u091F \u2192 5 minute", () => {
    assert.strictEqual(HT.transliterate("\u096B \u092E\u093F\u0928\u091F"), "5 minute");
});

// ============================================================
// 6. ROMAN VARIANT NORMALIZATION
// ============================================================

console.log("\n--- Roman Variant Normalization ---");

test("krdo \u2192 karo", () => {
    assert.strictEqual(HT.normalizeRoman("youtube krdo"), "youtube karo");
});

test("kardo \u2192 karo", () => {
    assert.strictEqual(HT.normalizeRoman("chrome kardo"), "chrome karo");
});

test("batado \u2192 batao", () => {
    assert.strictEqual(HT.normalizeRoman("weather batado"), "weather batao");
});

test("dikhado \u2192 dikhao", () => {
    assert.strictEqual(HT.normalizeRoman("dikhado"), "dikhao");
});

// ============================================================
// 7. TOCANON — FULL PIPELINE (translit + normalize)
// ============================================================

console.log("\n--- toCanonical Full Pipeline ---");

test("Hindi full command pipeline", () => {
    const result = HT.toCanonical("\u092F\u0942\u091F\u094D\u092F\u0942\u092C \u0916\u094B\u0932\u094B");
    assert.ok(result.includes("youtube"), `expected "youtube" in "${result}"`);
    assert.ok(result.includes("kholo"), `expected "kholo" in "${result}"`);
});

test("Mixed Devanagari + Latin passes through correctly", () => {
    const result = HT.toCanonical("YouTube \u0916\u094B\u0932\u094B");
    assert.ok(result.includes("youtube"), `expected "youtube" in "${result}"`);
    assert.ok(result.includes("kholo"), `expected "kholo" in "${result}"`);
});

test("Pure English text unchanged", () => {
    assert.strictEqual(HT.toCanonical("Open YouTube"), "open youtube");
});

// ============================================================
// 8. SMART REPLIES VARIATION
// ============================================================

console.log("\n--- Smart Replies Variation ---");

test("OPEN_APP returns varied response", () => {
    const r1 = SR.get("OPEN_APP", { lang: "en", APP: "Chrome" });
    const r2 = SR.get("OPEN_APP", { lang: "en", APP: "Chrome" });
    assert.ok(r1.includes("Chrome"), `r1: "${r1}"`);
    assert.ok(r2.includes("Chrome"), `r2: "${r2}"`);
    // At least one should differ (varied) — with 6 templates and
    // shuffled-bag, consecutive calls should differ
    // (not guaranteed on first 2 calls, but very likely)
    let same = (r1 === r2);
    // Try a few more
    let allSame = true;
    const replies = new Set([r1, r2]);
    for (let i = 0; i < 6; i++) {
        replies.add(SR.get("OPEN_APP", { lang: "en", APP: "Chrome" }));
    }
    assert.ok(replies.size >= 3, `expected 3+ distinct replies, got ${replies.size}`);
});

test("Hinglish OPEN_APP returns Hinglish text", () => {
    const r = SR.get("OPEN_APP", { lang: "hinglish", APP: "Chrome" });
    assert.ok(r.includes("Chrome"), `expected "Chrome" in "${r}"`);
    // accept every valid Hinglish/Hindi action verb in the pool:
    // khol / khul / launch / chalu / ho gaya variants
    assert.ok(/\b(khol|khul|kholo|kholo|launch|chalu|ho gaya|ho gya)\b/i.test(r) || r.includes("khol") || r.includes("launch") || r.includes("chalu") || r.includes("khul"),
        `expected Hindi action word in "${r}"`);
});

test("GREETING has multiple variations", () => {
    const replies = new Set();
    for (let i = 0; i < 10; i++) {
        replies.add(SR.get("GREETING", { lang: "en" }));
    }
    assert.ok(replies.size >= 3, `expected 3+ distinct greetings, got ${replies.size}`);
});

test("vary() wraps response with ack sometimes", () => {
    const results = new Set();
    for (let i = 0; i < 10; i++) {
        results.add(SR.vary("Temperature is 28C.", "en"));
    }
    // Should have at least 2 distinct results (some prefixed, some not)
    assert.ok(results.size >= 2, `expected 2+ distinct results, got ${results.size}`);
});

test("ack() returns non-empty string", () => {
    assert.ok(SR.ack("en").length > 0);
    assert.ok(SR.ack("hi").length > 0);
    assert.ok(SR.ack("hinglish").length > 0);
});

test("SYSTEM_CONTROL.shutdown has responses in all languages", () => {
    assert.ok(SR.get("SYSTEM_CONTROL.shutdown", { lang: "en" }).length > 0);
    assert.ok(SR.get("SYSTEM_CONTROL.shutdown", { lang: "hi" }).length > 0);
    assert.ok(SR.get("SYSTEM_CONTROL.shutdown", { lang: "hinglish" }).length > 0);
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
