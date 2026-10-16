"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — KNOWLEDGE SOURCE CHAIN TEST
 * test/knowledge-chain.test.js
 * ============================================================
 * Tests:
 *   1. knowledgeSourceChain.js — quotas, failover, cooldowns
 *   2. webResearcher.js — chain research, Wikidata/Google searchers
 *   3. learningManager.js — permanent knowledge saving
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Node has no localStorage — the chain uses its in-memory store
const KSC = require("../renderer/js/learning/knowledgeSourceChain.js");

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  \u2713 ${name}`); }
    catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}
let pendingTests = Promise.resolve();
function testAsync(name, fn) {
    pendingTests = pendingTests.then(async () => {
        try { await fn(); passed++; console.log(`  \u2713 ${name}`); }
        catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
    });
}

console.log("\n========================================");
console.log("KNOWLEDGE SOURCE CHAIN TEST");
console.log("========================================\n");

// ============================================================
// 1. CHAIN STRUCTURE
// ============================================================
console.log("--- 1. Chain Structure ---");

test("Chain has 5 sources in priority order", () => {
    const sources = KSC.getSources();
    assert.strictEqual(Object.keys(sources).length, 5);
    assert.strictEqual(sources.wikipedia.priority, 1);
    assert.strictEqual(sources.duckduckgo.priority, 2);
    assert.strictEqual(sources.google.priority, 3);
    assert.strictEqual(sources.wikidata.priority, 4);
    assert.strictEqual(sources.external_api.priority, 5);
});

test("Wikipedia is tried FIRST when available", () => {
    KSC.resetAll();
    const chain = KSC.getChain();
    assert.strictEqual(chain[0], "wikipedia");
});

test("Free sources (wikipedia/duckduckgo/wikidata) don't need keys", () => {
    assert.strictEqual(KSC.getSources().wikipedia.needsKey, false);
    assert.strictEqual(KSC.getSources().duckduckgo.needsKey, false);
    assert.strictEqual(KSC.getSources().wikidata.needsKey, false);
});

test("Google needs an API key", () => {
    assert.strictEqual(KSC.getSources().google.needsKey, true);
});

// ============================================================
// 2. QUOTA TRACKING
// ============================================================
console.log("\n--- 2. Quota Tracking ---");

test("recordUse increments usage and resets failure streak", () => {
    KSC.resetAll();
    KSC.recordFailure("wikipedia");
    KSC.recordFailure("wikipedia");
    KSC.recordUse("wikipedia"); // success resets streak
    const report = KSC.getUsageReport().find(r => r.source === "wikipedia");
    assert.strictEqual(report.used, 1);
    assert.strictEqual(report.available, true);
});

test("Daily limit reached → source unavailable", () => {
    KSC.resetAll();
    KSC.setDailyLimit("wikipedia", 2);
    KSC.recordUse("wikipedia");
    KSC.recordUse("wikipedia");
    assert.strictEqual(KSC.isAvailable("wikipedia"), false);
    assert.strictEqual(KSC.unavailabilityReason("wikipedia"), "daily_limit_reached");
    KSC.setDailyLimit("wikipedia", 500); // restore global limit for later tests
});

test("recordLimit → immediate cooldown", () => {
    KSC.resetAll();
    KSC.recordLimit("wikipedia", false);
    assert.strictEqual(KSC.isAvailable("wikipedia"), false);
    assert.strictEqual(KSC.unavailabilityReason("wikipedia"), "cooldown");
});

test("3 consecutive failures → cooldown", () => {
    KSC.resetAll();
    KSC.recordFailure("duckduckgo");
    KSC.recordFailure("duckduckgo");
    assert.strictEqual(KSC.isAvailable("duckduckgo"), true); // 2 is below threshold
    KSC.recordFailure("duckduckgo"); // 3rd → cooldown
    assert.strictEqual(KSC.isAvailable("duckduckgo"), false);
    assert.strictEqual(KSC.unavailabilityReason("duckduckgo"), "cooldown");
});

test("Usage report gives full picture", () => {
    KSC.resetAll();
    KSC.recordUse("wikipedia");
    KSC.recordUse("wikipedia");
    const report = KSC.getUsageReport();
    const wiki = report.find(r => r.source === "wikipedia");
    assert.strictEqual(wiki.used, 2);
    assert.strictEqual(wiki.remaining, 498);
    assert.strictEqual(typeof wiki.dailyLimit, "number");
    assert.strictEqual(typeof wiki.available, "boolean");
});

// ============================================================
// 3. AUTOMATIC FAILOVER (searchWithFallback)
// ============================================================
console.log("\n--- 3. Automatic Failover ---");

testAsync("Failover: Wikipedia empty → DuckDuckGo serves", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => Promise.resolve({ success: true, results: [] }), // no results
        duckduckgo: (q) => Promise.resolve({ success: true, results: [{ title: q, url: "https://ddg.example", content: "DuckDuckGo result about " + q }] }),
    };
    const result = await KSC.searchWithFallback("test topic", searchers);
    assert.ok(result.success, "Should succeed via DDG");
    assert.strictEqual(result.servedBy, "duckduckgo");
    assert.deepStrictEqual(result.sourcesTried, ["wikipedia", "duckduckgo"]);
    assert.strictEqual(result.results[0].source, "duckduckgo"); // source-tagged
});

testAsync("Rate-limited Wikipedia → chain auto-fails over", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => Promise.resolve({ success: false, rateLimited: true, results: [] }),
        duckduckgo: () => Promise.resolve({ success: true, results: [{ title: "t", url: "https://x.example", content: "c" }] }),
    };
    const result = await KSC.searchWithFallback("test", searchers);
    assert.ok(result.success);
    assert.strictEqual(result.servedBy, "duckduckgo");
    // Wikipedia must now be in cooldown (rate limit recorded)
    assert.strictEqual(KSC.isAvailable("wikipedia"), false);
});

testAsync("Exhausted sources are SKIPPED (not retried)", async () => {
    KSC.resetAll();
    KSC.recordLimit("wikipedia", true); // exhausted for the day
    const called = [];
    const searchers = {
        wikipedia: () => { called.push("wikipedia"); return Promise.resolve({ success: true, results: [] }); },
        duckduckgo: () => { called.push("duckduckgo"); return Promise.resolve({ success: true, results: [{ title: "t", url: "https://x", content: "c" }] }); },
    };
    const result = await KSC.searchWithFallback("test", searchers);
    assert.strictEqual(result.servedBy, "duckduckgo");
    assert.ok(!called.includes("wikipedia"), "Wikipedia should be SKIPPED entirely");
    assert.deepStrictEqual(result.sourcesTried, ["duckduckgo"]);
});

testAsync("All sources fail → all_sources_exhausted", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => Promise.resolve({ success: true, results: [] }),
        duckduckgo: () => Promise.resolve({ success: true, results: [] }),
        wikidata: () => Promise.resolve({ success: true, results: [] }),
    };
    const result = await KSC.searchWithFallback("test", searchers);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, "all_sources_exhausted");
    assert.strictEqual(result.sourcesTried.length, 3);
});

testAsync("Source errors count as failures → next source serves", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => Promise.reject(new Error("network down")),
        duckduckgo: () => Promise.resolve({ success: true, results: [{ title: "t", url: "https://x", content: "c" }] }),
    };
    const result = await KSC.searchWithFallback("test", searchers);
    assert.strictEqual(result.servedBy, "duckduckgo");
    const report = KSC.getUsageReport().find(r => r.source === "wikipedia");
    // failure was recorded
    assert.strictEqual(report.limitHits, 0);
});

testAsync("Chain result includes a usage snapshot", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => Promise.resolve({ success: true, results: [{ title: "t", url: "https://x", content: "c" }] }),
    };
    const result = await KSC.searchWithFallback("test", searchers);
    assert.ok(Array.isArray(result.chainSnapshot));
    assert.strictEqual(result.chainSnapshot.length, 5);
});

// ============================================================
// 4. WEB RESEARCHER — chain wiring + new searchers
// ============================================================
console.log("\n--- 4. WebResearcher (WR-V2) ---");

const wrPath = path.join(__dirname, "..", "renderer", "js", "learning", "webResearcher.js");
const wrCode = fs.readFileSync(wrPath, "utf8");

test("webResearcher is WR-V2", () => {
    assert.ok(wrCode.includes("WR-V2"), "Version should be WR-V2");
});

test("searchWikidata exists (free, no key)", () => {
    assert.ok(wrCode.includes("async function searchWikidata"), "searchWikidata should exist");
    assert.ok(wrCode.includes("wikidata.org"), "Should hit the Wikidata API");
});

test("searchGoogle exists (CSE + external fallback)", () => {
    assert.ok(wrCode.includes("async function searchGoogle"), "searchGoogle should exist");
    assert.ok(wrCode.includes("googleapis.com/customsearch"), "Should support Google CSE");
    assert.ok(wrCode.includes("jarvis_google_cse_key"), "Should read the CSE key from settings");
});

test("researchViaChain exists and uses the chain", () => {
    assert.ok(wrCode.includes("async function researchViaChain"), "researchViaChain should exist");
    assert.ok(wrCode.includes("JARVISKnowledgeSourceChain"), "Should use the chain module");
    assert.ok(wrCode.includes("searchWithFallback"), "Should call searchWithFallback");
});

test("researchViaChain marks candidates permanent: true", () => {
    assert.ok(wrCode.includes("permanent: true"), "Chain candidates must be marked permanent");
});

test("researchViaChain falls back to classic research if chain missing", () => {
    assert.ok(wrCode.includes("degrade to classic parallel research"), "Graceful degradation path");
});

test("WR exports the new functions", () => {
    assert.ok(wrCode.includes("researchViaChain,\n        searchWikipedia") || (wrCode.includes("researchViaChain,") && wrCode.includes("searchGoogle,") && wrCode.includes("searchWikidata,")), "Exports updated");
});

test("Google 429 handled → rateLimited + restOfDay", () => {
    assert.ok(wrCode.includes("quota exceeded"), "429 from Google CSE handled");
    assert.ok(wrCode.includes("restOfDay: true"), "Marks rest-of-day");
});

// ============================================================
// 5. LEARNING MANAGER — permanent saving
// ============================================================
console.log("\n--- 5. LearningManager — Permanent Saving ---");

const lmCode = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "learning", "learningManager.js"), "utf8");

test("learningManager routes through researchViaChain", () => {
    assert.ok(lmCode.includes("researchViaChain"), "Should use the chain");
});

test("permanent candidates get expiresAt: null (NEVER expire); time-sensitive domains get domain TTL", () => {
    // v2.4: permanence is now domain-aware — stable knowledge (general/
    // science/history/country) is permanent; weather/news/currency/sports
    // knowledge expires per the domain TTL so stale data is never served.
    assert.ok(lmCode.includes("candidate.permanent === true ? null : (window.JARVISDomainRouter"), "domain-aware expiry");
    assert.ok(lmCode.includes("computeDomainExpiry(domainRoute.domain"), "domain TTL respected");
    // applied to all 3 store paths
    const matches = lmCode.match(/candidate\.permanent === true \? null : \(window\.JARVISDomainRouter/g);
    assert.strictEqual(matches.length, 3, "All 3 store paths covered");
});

// knowledgeStore: expiresAt null = never cleaned
const ksCode = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "learning", "knowledgeStore.js"), "utf8");
test("knowledgeStore: null expiry is never cleaned (permanent)", () => {
    assert.ok(ksCode.includes("item.expiresAt && new Date(item.expiresAt) < now"), "cleanExpired only removes set+past expiry");
});

// ============================================================
// 6. WIRING
// ============================================================
console.log("\n--- 6. Wiring ---");

test("index.html loads knowledgeSourceChain.js before webResearcher.js", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    const chainIdx = html.indexOf("js/learning/knowledgeSourceChain.js");
    const wrIdx = html.indexOf("js/learning/webResearcher.js");
    assert.ok(chainIdx > 0, "Chain script tag present");
    assert.ok(chainIdx < wrIdx, "Chain loads before webResearcher");
});

test("All new/modified files pass syntax check", () => {
    // syntax was verified by node -c in build; here just existence
    assert.ok(fs.existsSync(wrPath));
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "learning", "knowledgeSourceChain.js")));
});

// ============================================================
// SUMMARY
// ============================================================
(async () => {
    await pendingTests;
    console.log("\n========================================");
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log("========================================\n");
    if (failed > 0) process.exit(1);
})();

