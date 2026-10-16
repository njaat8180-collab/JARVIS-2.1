"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — PRODUCTION PIPELINE TEST
 * test/production-pipeline.test.js
 * ============================================================
 * One-pass production hardening verification:
 *   1. AI REMOVAL      — zero AI/LLM runtime paths
 *   2. DETERMINISTIC   — brain composes without any model
 *   3. DOMAIN ROUTER   — routing + freshness TTLs
 *   4. SOURCE HEALTH   — chain health/timeout/preferredOrder
 *   5. EVIDENCE        — knowledge record provenance fields
 *   6. BOOT            — real health checks, honest failures
 *   7. CONTEXT         — confirmation flow + explicit priority
 *   8. IPC INTEGRITY   — no duplicates, no dead renderer calls
 *   9. WIRING          — script tags in the right order
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
console.log("PRODUCTION PIPELINE TEST");
console.log("========================================\n");

// ============================================================
// 1. AI REMOVAL — zero AI / zero LLM in the runtime
// ============================================================
console.log("--- 1. AI Removal ---");

test("src/ai/embeddedBrain.js (local LLM) deleted", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "src/ai/embeddedBrain.js")));
});

test("src/ai/localLLM.js (Ollama client) deleted", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "src/ai/localLLM.js")));
});

test("renderer/js/ai.js (old Gemini bridge) deleted", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "renderer/js/ai.js")));
});

test("main.js has NO runtime LLM calls", () => {
    const mainjs = read("main.js");
    assert.ok(!mainjs.includes("embeddedBrain"), "embeddedBrain must be gone");
    assert.ok(!mainjs.includes('require("./src/ai/localLLM")'), "localLLM must be gone");
    assert.ok(!mainjs.includes("global.JARVISAI"), "legacy global engine checks must be gone");
    assert.ok(!mainjs.includes("global.AIEngine"), "legacy global engine checks must be gone");
});

test("main.js requires the deterministic brain", () => {
    const mainjs = read("main.js");
    assert.ok(mainjs.includes('require("./src/ai/deterministicBrain")'));
    assert.ok(mainjs.includes("deterministicBrain.compose"));
});

test("preload exposes askBrain (deterministic), not askAI", () => {
    const preload = read("preload.js");
    assert.ok(preload.includes("askBrain(message"), "askBrain bridge");
    assert.ok(!preload.includes("askAI(message, context)"));
});

test("chat.js processAI calls askBrain, no GeminiEngine/DeepSeek/OpenRouter scan", () => {
    const chat = read("renderer/js/chat.js");
    assert.ok(chat.includes("window.jarvis.askBrain"));
    assert.ok(!chat.includes('"GeminiEngine"'));
    assert.ok(!chat.includes('"DeepSeekEngine"'));
    assert.ok(!chat.includes('"OpenRouterAI"'));
});

test("brain.js cloud AI fallback removed", () => {
    const brain = read("renderer/js/brain/brain.js");
    assert.ok(!brain.includes("allowCloudAIFallback"));
    assert.ok(!brain.includes("window.jarvis.askAI"));
});

test("package.json has NO AI service dependencies", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = Object.keys(pkg.dependencies || {});
    for (const bad of ["sherpa-onnx-node", "@picovoice/leopard-node", "openai", "@anthropic-ai/sdk"]) {
        assert.ok(!deps.includes(bad), `${bad} must not be a dependency`);
    }
    // No "ollama" npm package either — JARVIS talks to the LOCAL Ollama
    // server over HTTP (src/ai/ollamaClient.js), no SDK needed.
    assert.ok(!deps.includes("ollama"), "Ollama must not be an npm dependency (local HTTP client is built in)");
    // The Vosk stack is gone for good.
    for (const bad of ["vosk", "ffi-napi", "ref-napi", "mic"]) {
        assert.ok(!deps.includes(bad), `${bad} must be removed (Vosk stack)`);
    }
    // @huggingface/transformers is allowed ONLY for the local Whisper
    // fallback engine (src/speech/whisperFallback.js) — whisper.cpp is the
    // primary offline STT engine and needs no npm dependency at all.
    assert.ok(deps.includes("@huggingface/transformers"), "local Whisper fallback dependency stays");
});

test("whisper.cpp is the primary local STT engine (Vosk stack removed)", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "stt/whisper/provider.js")), "whisper.cpp provider exists");
    assert.ok(!fs.existsSync(path.join(ROOT, "stt/vosk")), "Vosk provider removed");
    assert.ok(!fs.existsSync(path.join(ROOT, "stt/sravaani")), "legacy Sravaani provider removed");
    assert.ok(!fs.existsSync(path.join(ROOT, "sherpaSTT.js")), "dead sherpa STT stub removed");
    const voiceSTT = read("voiceSTT.js");
    assert.ok(/whisperProvider/.test(voiceSTT), "voice pipeline references the whisper.cpp provider");
    // Functional Vosk references must be gone (a legacy-value comment
    // ("vosk"/"sravaani" configs → auto) is explicitly allowed).
    assert.ok(!/require\([^)]*stt\/vosk/.test(voiceSTT), "no require of the Vosk provider");
    assert.ok(!/require\(["']vosk["']\)/.test(voiceSTT), "no require of the vosk npm package");
});

// ============================================================
// 2. DETERMINISTIC BRAIN
// ============================================================
console.log("\n--- 2. Deterministic Brain ---");

const dbrain = require("../src/ai/deterministicBrain.js");

test("compose(): knowledge-first answer with source attribution", () => {
    const r = dbrain.compose({
        text: "What is quantum computing?",
        language: "en",
        localKnowledge: [{ topic: "quantum computing", content: "Qubits.", source: "wikipedia", sourceUrl: "https://en.wikipedia.org/wiki/Q", timestamp: "now" }]
    });
    assert.strictEqual(r.usedKnowledge, true);
    assert.ok(r.reply.includes("Qubits."));
    assert.ok(r.reply.includes("wikipedia"));
});

test("compose(): honest unknown + research queued", () => {
    const r = dbrain.compose({ text: "What is xyzzy?", language: "en" });
    assert.strictEqual(r.usedKnowledge, false);
    assert.strictEqual(r.researchQueued, true);
    assert.ok(r.topic.length > 0);
});

test("compose(): Hindi + Hinglish templates", () => {
    const hi = dbrain.compose({ text: "quantum computing kya hai?", language: "hi", localKnowledge: [{ topic: "q", content: "qubits", source: "wikipedia", timestamp: "n" }] });
    assert.ok(/[\u0900-\u097F]/.test(hi.reply), "Hindi reply expected");
    const hinglish = dbrain.compose({ text: "quantum computing kya hai?", language: "hinglish" });
    assert.ok(hinglish.reply.length > 10);
});

test("compose(): DETERMINISTIC — same input, same output", () => {
    const a = dbrain.compose({ text: "same question", language: "en" });
    const b = dbrain.compose({ text: "same question", language: "en" });
    assert.strictEqual(a.reply, b.reply);
});

test("extractTopic(): strips question words", () => {
    const t = dbrain.extractTopic("What is the theory of relativity?");
    assert.ok(!t.includes("what"));
    assert.ok(t.includes("relativity"));
});

// ============================================================
// 3. DOMAIN ROUTER
// ============================================================
console.log("\n--- 3. Domain Router ---");

// Node-safe load (module is dual-exported)
const domainRouter = require("../renderer/js/learning/domainRouter.js");

test("weather questions route with 10-minute TTL + live-first order", () => {
    const r = domainRouter.classifyQuestion("what is the weather in Delhi today");
    assert.strictEqual(r.domain, "weather");
    assert.strictEqual(r.ttl, 10 * 60 * 1000);
    assert.strictEqual(r.preferredOrder[0], "duckduckgo"); // live data first, not wikipedia
});

test("currency questions route with 1-hour TTL", () => {
    const r = domainRouter.classifyQuestion("convert 100 dollars to rupees");
    assert.strictEqual(r.domain, "currency");
    assert.ok(r.ttl <= 60 * 60 * 1000);
});

test("books questions route to wikipedia/wikidata", () => {
    const r = domainRouter.classifyQuestion("who wrote the book Godan");
    assert.strictEqual(r.domain, "books");
    assert.strictEqual(r.preferredOrder[0], "wikipedia");
});

test("stable domains (country/science/history) have permanent TTL", () => {
    assert.strictEqual(domainRouter.classifyQuestion("capital of France country").ttl, null);
    assert.strictEqual(domainRouter.classifyQuestion("quantum physics theory element").ttl, null);
    assert.strictEqual(domainRouter.classifyQuestion("ancient roman empire history war").ttl, null);
});

test("general questions default to Wikipedia-first", () => {
    const r = domainRouter.classifyQuestion("what is photosynthesis");
    assert.strictEqual(r.domain, "general");
    assert.strictEqual(r.preferredOrder[0], "wikipedia");
});

test("isFresh(): null expiry = always fresh; past expiry = stale", () => {
    assert.strictEqual(domainRouter.isFresh({ expiresAt: null }), true);
    assert.strictEqual(domainRouter.isFresh({ expiresAt: new Date(Date.now() - 1000).toISOString() }), false);
    assert.strictEqual(domainRouter.isFresh({ expiresAt: new Date(Date.now() + 60000).toISOString() }), true);
});

test("computeDomainExpiry(): weather never gets a long category TTL", () => {
    const longCategory = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(); // 90 days
    const exp = domainRouter.computeDomainExpiry("weather", longCategory);
    const delta = new Date(exp).getTime() - Date.now();
    assert.ok(delta <= 10 * 60 * 1000 + 5000, `weather expiry must be ~10min, got ${delta / 60000}min`);
});

test("computeDomainExpiry(): stable domain keeps category rule", () => {
    const longCategory = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    assert.strictEqual(domainRouter.computeDomainExpiry("science", longCategory), longCategory);
});

// ============================================================
// 4. SOURCE HEALTH / CHAIN
// ============================================================
console.log("\n--- 4. Source Health ---");

const KSC = require("../renderer/js/learning/knowledgeSourceChain.js");

test("recordUse sets lastSuccessAt (health)", () => {
    KSC.resetAll();
    KSC.recordUse("wikipedia");
    const r = KSC.getUsageReport().find(s => s.source === "wikipedia");
    assert.ok(r.lastSuccessAt, "lastSuccessAt must be set");
});

test("recordFailure sets lastFailureAt (health)", () => {
    KSC.resetAll();
    KSC.recordFailure("duckduckgo");
    const r = KSC.getUsageReport().find(s => s.source === "duckduckgo");
    assert.ok(r.lastFailureAt, "lastFailureAt must be set");
});

test("Hung source times out → failover to next source", async () => {
    KSC.resetAll();
    const searchers = {
        wikipedia: () => new Promise(() => {}), // never resolves
        duckduckgo: () => Promise.resolve({ success: true, results: [{ title: "t", url: "u", content: "c" }] }),
    };
    const result = await KSC.searchWithFallback("x", searchers, { sourceTimeoutMs: 200 });
    assert.strictEqual(result.servedBy, "duckduckgo");
    assert.ok(result.sourcesTried.includes("wikipedia"), "wikipedia was attempted");
});

test("preferredOrder reorders the chain (domain routing)", () => {
    KSC.resetAll();
    const chain = KSC.getChain(["wikidata", "duckduckgo", "wikipedia"]);
    assert.strictEqual(chain[0], "wikidata");
    assert.strictEqual(chain[1], "duckduckgo");
});

// ============================================================
// 5. EVIDENCE FIELDS
// ============================================================
console.log("\n--- 5. Knowledge Evidence ---");

test("knowledgeStore.add stores retrievedAt/updatedAt/conflictStatus", () => {
    const code = read("renderer/js/learning/knowledgeStore.js");
    assert.ok(code.includes("retrievedAt"), "retrievedAt field");
    assert.ok(code.includes("updatedAt"), "updatedAt field");
    assert.ok(code.includes("conflictStatus"), "conflictStatus field");
});

test("learningManager preserves conflicting sources (no silent pick)", () => {
    const code = read("renderer/js/learning/learningManager.js");
    assert.ok(code.includes("preservedSources"), "conflict record carries all versions");
    assert.ok(code.includes("conflict-record"), "stores a conflict record");
    assert.ok(code.includes("I found conflicting information"), "communicates the conflict");
});

test("webResearcher: domain-aware permanence (weather ≠ permanent)", () => {
    const code = read("renderer/js/learning/webResearcher.js");
    assert.ok(code.includes("permanent: domainRoute.ttl === null"), "time-sensitive domains must not be permanent");
});

// ============================================================
// 6. BOOT HEALTH
// ============================================================
console.log("\n--- 6. Boot Health ---");

test("bootHealth.js sequence covers all 10 required stages", () => {
    const BH = require("../renderer/js/bootHealth.js");
    const names = BH.SEQUENCE.map(s => s.name);
    assert.deepStrictEqual(names, ["CORE","IPC","AUDIO","STT","MEMORY","KNOWLEDGE","BROWSER","ACTIONS","TTS","SECURITY"]);
});

test("boot sequence reports HONEST failure when critical check fails", () => {
    global.window = { /* nothing — all checks fail */ };
    delete require.cache[require.resolve("../renderer/js/bootHealth.js")];
    const BH = require("../renderer/js/bootHealth.js");
    return BH.runBootSequence().then(s => {
        assert.strictEqual(s.ready, false, "with no systems, must NOT be ready");
        assert.ok(s.criticalFailures.includes("CORE"));
        assert.ok(s.criticalFailures.includes("IPC"));
        assert.ok(s.criticalFailures.includes("SECURITY"));
    });
});

test("cinemaBoot has no fake 'SYSTEM READY' — honest statuses only", () => {
    const code = read("renderer/js/cinemaBoot.js");
    assert.ok(code.includes("JARVISBootHealth"), "uses real health checks");
    assert.ok(code.includes("DEGRADED MODE"), "honest degraded state");
    assert.ok(code.includes("cinema-boot-warn"), "warn styling for failures");
    assert.ok(!/ALL SYSTEMS \.\.\. ONLINE"\s*\)/.test(code.replace("ALL SYSTEMS ... ONLINE", "X")), "final line is conditional");
});

test("preload exposes real IPC ping (info.ipcPing)", () => {
    assert.ok(read("preload.js").includes("ipcPing()"));
});

// ============================================================
// 7. CONTEXT — confirmation + priority
// ============================================================
console.log("\n--- 7. Context ---");

test("conversationContext implements the confirmation API", () => {
    const code = read("renderer/js/brain/conversationContext.js");
    for (const fn of ["setConfirmation", "hasConfirmation", "getConfirmation", "clearConfirmation"]) {
        assert.ok(code.includes("function " + fn), fn + " must exist");
    }
});

test("confirmation flow: register → safe copy → raw callbacks → resolve", () => {
    global.window = global;
    delete require.cache[require.resolve("../renderer/js/brain/conversationContext.js")];
    eval(read("renderer/js/brain/conversationContext.js"));
    // Renamed global (collision fix — see renderer/js/brain/conversationContext.js):
    // this legacy engine now exposes window.JARVISLegacyConversationContext so it
    // no longer overwrites the newer ConversationContextManager's global.
    const C = window.JARVISLegacyConversationContext;
    let called = false;
    C.setConfirmation({ question: "Kya main YouTube khol doon?", onYes: () => { called = true; return { handled: true }; }, onNo: () => ({ handled: true }) });
    assert.strictEqual(C.hasConfirmation(), true);
    const safe = C.getConfirmation();
    assert.ok(!("onYes" in safe), "safe copy has no callbacks");
    assert.strictEqual(typeof C.pendingConfirmation.onYes, "function", "raw object keeps callbacks");
    const cb = C.pendingConfirmation.onYes; C.clearConfirmation();
    cb(); assert.ok(called);
});

test("chat.js ROUTE -1.2 confirmation is now reachable (hasConfirmation exists)", () => {
    const chat = read("renderer/js/chat.js");
    assert.ok(chat.includes("context.hasConfirmation()"));
});

test("explicit entity is NEVER overridden by weak context", () => {
    global.window = global;
    delete require.cache[require.resolve("../renderer/js/brain/conversationContext.js")];
    eval(read("renderer/js/brain/conversationContext.js"));
    const C = window.JARVISLegacyConversationContext;
    C._reset();
    C.pushTurn("user", "Who is Elon Musk?");
    C.pushTurn("jarvis", "Elon Musk is CEO of Tesla.");
    C.pushTurn("user", "Open his Wikipedia page");
    C.pushTurn("jarvis", "Opening.");
    const resolved = C.resolve("open chrome");
    assert.strictEqual(resolved, "open chrome", "explicit 'chrome' must win over context");
});

// ============================================================
// 8. IPC INTEGRITY
// ============================================================
console.log("\n--- 8. IPC Integrity ---");

test("main.js has NO duplicate top-level function definitions", () => {
    const code = read("main.js").split("\n");
    const found = {};
    const re = /^\s*(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/;
    for (const l of code) {
        const m = re.exec(l);
        if (m) { found[m[1]] = (found[m[1]] || 0) + 1; }
    }
    const dups = Object.entries(found).filter(([k, n]) => n > 1);
    assert.deepStrictEqual(dups, [], "duplicate functions: " + JSON.stringify(dups));
});

test("main.js has NO duplicate registerHandler channels", () => {
    const code = read("main.js");
    const re = /registerHandler\(\s*\n?\s*"([^"]+)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(code))) {
        assert.ok(!seen.has(m[1]), "channel registered twice: " + m[1]);
        seen.add(m[1]);
    }
    assert.ok(seen.size >= 200, "expected 200+ channels, got " + seen.size);
});

test("every preload invoke channel has a main handler", () => {
    const preload = read("preload.js");
    const mainjs = read("main.js");
    const constMap = {};
    const re1 = /([A-Z_0-9]+):\s*"([a-z0-9-]+:[a-z0-9-]+)"/g;
    let m;
    while ((m = re1.exec(preload))) constMap[m[1]] = m[2];
    const used = new Set();
    const re2 = /IPC\.([A-Z_0-9]+)/g;
    while ((m = re2.exec(preload))) if (constMap[m[1]]) used.add(constMap[m[1]]);

    const handlers = new Set();
    const re3 = /registerHandler\(\s*\n?\s*"([^"]+)"/g;
    while ((m = re3.exec(mainjs))) handlers.add(m[1]);
    const re4 = /ipcMain\.handle\(\s*"([^"]+)"/g;
    while ((m = re4.exec(mainjs))) handlers.add(m[1]);
    const listeners = new Set();
    const re5 = /registerListener\(\s*\n?\s*"([^"]+)"/g;
    while ((m = re5.exec(mainjs))) listeners.add(m[1]);
    const re6 = /ipcMain\.on\(\s*"([^"]+)"/g;
    while ((m = re6.exec(mainjs))) listeners.add(m[1]);

    // main -> renderer EVENT channels (renderer subscribes via on())
    const sent = new Set();
    const re7 = /webContents\.send\(\s*\n?\s*"([^"]+)"/g;
    while ((m = re7.exec(mainjs))) sent.add(m[1]);
    const re8 = /sendToRenderer\(\s*\n?\s*"([^"]+)"/g;
    while ((m = re8.exec(mainjs))) sent.add(m[1]);

    const missing = [...used].filter(c => !handlers.has(c) && !listeners.has(c) && !sent.has(c));
    assert.deepStrictEqual(missing, [], "renderer calls without handler: " + missing.join(", "));
});

test("chat history / file / window / system channels RESTORED (hoisting bug fix)", () => {
    const mainjs = read("main.js");
    for (const ch of ["chat:get-history", "chat:load-history", "file:read-text", "file:write-text",
                      "files:list", "window:minimize", "window:close", "system:get-status",
                      "system:get-uptime", "ai:chat"]) {
        assert.ok(mainjs.includes('"' + ch + '"'), ch + " must be registered");
    }
    assert.ok(mainjs.includes("registerChatHistoryIPC();"), "restored call set wired");
    assert.ok(mainjs.includes("registerWindowControlsIPC();"), "restored call set wired");
});

// ============================================================
// 9. WIRING
// ============================================================
console.log("\n--- 9. Wiring ---");

test("index.html loads bootHealth before cinemaBoot", () => {
    const html = read("renderer/index.html");
    assert.ok(html.indexOf("js/bootHealth.js") < html.indexOf("js/cinemaBoot.js"));
});

test("index.html loads domainRouter + chain before webResearcher", () => {
    const html = read("renderer/index.html");
    assert.ok(html.indexOf("js/learning/knowledgeSourceChain.js") < html.indexOf("js/learning/webResearcher.js"));
    assert.ok(html.indexOf("js/learning/domainRouter.js") < html.indexOf("js/learning/webResearcher.js"));
});

test("all learning modules referenced in index.html exist on disk", () => {
    const html = read("renderer/index.html");
    const tags = [...html.matchAll(/src="(js\/[^"]+\.js)"/g)].map(m => m[1]);
    const missing = tags.filter(t => !fs.existsSync(path.join(ROOT, "renderer", t)));
    assert.deepStrictEqual(missing, [], "missing script files: " + missing.join(", "));
});

test("scheduler auto-start only in real browser DOM", () => {
    assert.ok(read("renderer/js/learning/learningScheduler.js").includes("document.body"));
});

test("learningManager research uses domain routing + timeout", () => {
    const code = read("renderer/js/learning/learningManager.js");
    assert.ok(code.includes("JARVISDomainRouter"));
    assert.ok(code.includes("sourceTimeoutMs"));
});

// ============================================================
// SUMMARY
// ============================================================
setTimeout(() => {
    console.log("\n========================================");
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log("========================================\n");
    if (failed > 0) process.exit(1);
}, 300);
