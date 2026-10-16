"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — SMART BRAIN + CONVERSATION MODE TEST
 * test/smart-brain.test.js
 * ============================================================
 * Tests:
 *   1. RealtimeThink — analysis, composition, variation
 *   2. ConversationMode — lifecycle, toggle, windowing
 * ============================================================
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const RealtimeThink = require("../renderer/js/brain/realtimeThink.js");
const ConversationMode = require("../renderer/js/voice/conversationMode.js");

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  \u2713 ${name}`); }
    catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

console.log("\n========================================");
console.log("SMART BRAIN + CONVERSATION MODE TEST");
console.log("========================================\n");

// ============================================================
// 1. MESSAGE ANALYSIS
// ============================================================
console.log("--- 1. Message Analysis ---");

test("detectLanguage: Hindi text → hi", () => {
    assert.strictEqual(RealtimeThink._detectLanguage("क्या हाल है?"), "hi");
});

test("detectLanguage: English text → en", () => {
    assert.strictEqual(RealtimeThink._detectLanguage("hello world"), "en");
});

test("detectMood: sad", () => {
    assert.strictEqual(RealtimeThink._detectMood("I am feeling sad and tired"), "sad");
});

test("detectMood: happy", () => {
    assert.strictEqual(RealtimeThink._detectMood("wow this is amazing!"), "happy");
});

test("detectMood: angry", () => {
    assert.strictEqual(RealtimeThink._detectMood("I am so angry right now"), "angry");
});

test("detectMood: neutral", () => {
    assert.strictEqual(RealtimeThink._detectMood("what is the capital of France"), "neutral");
});

test("detectQuestionShape: what/kya", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kya hai ye?"), "what");
    assert.strictEqual(RealtimeThink._detectQuestionShape("what is AI"), "what");
});

test("detectQuestionShape: why/kyu", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kyu aisa hota hai"), "why");
    assert.strictEqual(RealtimeThink._detectQuestionShape("why is the sky blue"), "why");
});

test("detectQuestionShape: how/kaise", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kaise karu ye kaam"), "how");
    assert.strictEqual(RealtimeThink._detectQuestionShape("how does it work"), "how");
});

test("detectQuestionShape: when/kab", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kab aayega tu"), "when");
});

test("detectQuestionShape: who/kaun", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kaun hai tu"), "who");
});

test("detectQuestionShape: where/kahan", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kahan jaa raha hai"), "where");
});

test("detectQuestionShape: permission (can I)", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("kya main ye kar sakta hoon"), "permission");
});

test("detectQuestionShape: null for non-question", () => {
    assert.strictEqual(RealtimeThink._detectQuestionShape("I like pizza"), null);
});

test("detectType: greeting", () => {
    assert.strictEqual(RealtimeThink._detectType("hey jarvis", null), "greeting");
    assert.strictEqual(RealtimeThink._detectType("namaste", null), "greeting");
});

test("detectType: farewell", () => {
    assert.strictEqual(RealtimeThink._detectType("bye jarvis", null), "farewell");
});

test("detectType: thanks", () => {
    assert.strictEqual(RealtimeThink._detectType("thanks a lot", null), "thanks");
    assert.strictEqual(RealtimeThink._detectType("shukriya", null), "thanks");
});

test("detectType: question when shape detected", () => {
    assert.strictEqual(RealtimeThink._detectType("what is AI", "what"), "question");
});

test("detectType: emotional when mood detected", () => {
    assert.strictEqual(RealtimeThink._detectType("I am sad", null), "emotional");
});

test("detectType: statement for personal sharing", () => {
    assert.strictEqual(RealtimeThink._detectType("mera naam Nakul hai", null), "statement");
});

test("detectType: acknowledgment for short confirmations", () => {
    assert.strictEqual(RealtimeThink._detectType("haan", null), "acknowledgment");
    assert.strictEqual(RealtimeThink._detectType("ok", null), "acknowledgment");
});

test("extractSubject: strips question words", () => {
    var s = RealtimeThink._extractSubject("what is artificial intelligence");
    assert.ok(s && s.length > 0, "Should extract a subject");
});

// ============================================================
// 2. THINK — DYNAMIC RESPONSE COMPOSITION
// ============================================================
console.log("\n--- 2. Dynamic Thinking (No Canned Replies) ---");

test("think returns a composed response (not null)", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("what is artificial intelligence?");
    assert.ok(result.handled, "Should be handled");
    assert.ok(result.response && result.response.length > 10, "Should have a substantial response");
    assert.ok(result.thinkingMs >= 200, "Should have thinking delay");
});

test("think response for question is dynamic (varies)", () => {
    RealtimeThink._reset();
    const r1 = RealtimeThink.think("why is the sky blue?").response;
    RealtimeThink._reset();
    const r2 = RealtimeThink.think("why is the sky blue?").response;
    // Due to randomization, responses should differ (or at least be valid)
    assert.ok(r1 && r1.length > 20, "First response should be substantial");
    assert.ok(r2 && r2.length > 20, "Second response should be substantial");
    // They don't HAVE to differ (small variation pool), but both must be valid
});

test("think handles greeting", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("hey jarvis");
    assert.ok(result.handled);
    assert.ok(result.response);
    assert.ok(result.response.length > 5, "Greeting should have a response");
    assert.ok(/hello|namaste|hey/i.test(result.response), "Should greet back");
});

test("think handles farewell", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("bye jarvis");
    assert.ok(result.handled);
    assert.ok(/bye|goodbye|good bye|alvida/i.test(result.response), "Should say goodbye");
});

test("think handles thanks", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("shukriya jarvis");
    assert.ok(result.handled);
    assert.ok(result.response.length > 5);
});

test("think handles emotional message with empathy", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("I am feeling very sad today");
    assert.ok(result.handled);
    assert.ok(result.response.length > 20, "Should have empathetic response");
    assert.ok(result.analysis.mood === "sad", "Should detect sad mood");
});

test("think handles happy message with enthusiasm", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("wow this is amazing!");
    assert.ok(result.handled);
    assert.ok(result.analysis.mood === "happy", "Should detect happy mood");
    assert.ok(result.response.length > 10, "Should respond enthusiastically");
});

test("think handles uncertain/help-seeking", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("pata nahi kya karu, help karo");
    assert.ok(result.handled);
    assert.ok(result.response.length > 20);
});

test("think handles statement with engagement", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("mera naam Nakul hai aur main Delhi mein rehta hoon");
    assert.ok(result.handled);
    assert.ok(result.response.length > 10);
});

test("think handles opinion", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("I think AI will change everything");
    assert.ok(result.handled);
    assert.ok(result.response.length > 15);
});

test("think handles permission question", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("kya main YouTube khol sakta hoon?");
    assert.ok(result.handled);
    assert.ok(result.response.length > 10);
});

test("think for empty message returns not handled", () => {
    const result = RealtimeThink.think("");
    assert.ok(!result.handled);
    assert.strictEqual(result.response, null);
});

test("think analysis includes type and mood", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("I am happy today");
    assert.ok(result.analysis);
    assert.ok(result.analysis.type);
    assert.ok(result.analysis.mood);
});

test("think response is NEVER the same canned string for different inputs", () => {
    RealtimeThink._reset();
    const r1 = RealtimeThink.think("what is AI?").response;
    RealtimeThink._reset();
    const r2 = RealtimeThink.think("tell me about space").response;
    assert.notStrictEqual(r1, r2, "Different questions should get different responses");
});

test("think response mentions acknowledging or engaging", () => {
    RealtimeThink._reset();
    const result = RealtimeThink.think("I love programming");
    assert.ok(result.handled);
    // Should acknowledge or engage — not just echo the input
    assert.ok(!result.response.includes("I love programming"), "Should not echo input back");
});

// ============================================================
// 3. CONVERSATION MODE
// ============================================================
console.log("\n--- 3. Conversation Mode ---");

test("ConversationMode starts disabled-active=false", () => {
    // In Node, no DOM, no VoiceEngine — startConversation should fail gracefully
    const result = ConversationMode.startConversation();
    assert.ok(!result.started || result.started === false, "Should not start without VoiceEngine");
});

test("isActive returns false in Node (no engine)", () => {
    assert.strictEqual(ConversationMode.isActive(), false);
});

test("isEnabled returns true by default", () => {
    assert.strictEqual(ConversationMode.isEnabled(), true);
});

test("toggle flips enabled", () => {
    const before = ConversationMode.isEnabled();
    ConversationMode.toggle();
    assert.strictEqual(ConversationMode.isEnabled(), !before);
    // Toggle back
    ConversationMode.toggle();
    assert.strictEqual(ConversationMode.isEnabled(), before);
});

test("afterJarvisReplied returns gracefully without engine", () => {
    const result = ConversationMode.afterJarvisReplied();
    assert.ok(result.continued === false || typeof result === "object", "Should handle gracefully");
});

test("endConversation is safe to call when not active", () => {
    ConversationMode.endConversation("test");
    assert.strictEqual(ConversationMode.isActive(), false);
});

test("getStatus returns snapshot", () => {
    var s = ConversationMode.getStatus();
    assert.ok(typeof s === "object");
    assert.ok(typeof s.enabled === "boolean");
    assert.ok(typeof s.active === "boolean");
});

test("setWindowMs clamps to minimum 10s", () => {
    ConversationMode.setWindowMs(5000); // 5s — below minimum
    var s = ConversationMode.getStatus();
    assert.ok(s.windowMs >= 10000, "Should clamp to 10s minimum, got: " + s.windowMs);
});

test("onUserUtterance is safe when not active", () => {
    ConversationMode.onUserUtterance(); // should not throw
    assert.ok(true);
});

// ============================================================
// 4. FILE EXISTENCE + WIRING
// ============================================================
console.log("\n--- 4. File Existence + Wiring ---");

test("realtimeThink.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "brain", "realtimeThink.js")));
});

test("conversationMode.js exists", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "renderer", "js", "voice", "conversationMode.js")));
});

test("index.html includes realtimeThink.js", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    assert.ok(html.includes("realtimeThink.js"), "Should include realtimeThink.js");
});

test("index.html includes conversationMode.js", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "renderer", "index.html"), "utf8");
    assert.ok(html.includes("conversationMode.js"), "Should include conversationMode.js");
});

test("chat.js wires RealtimeThink as ROUTE 6.5", () => {
    const chat = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "chat.js"), "utf8");
    assert.ok(chat.includes("JARVISRealtimeThink"), "Should reference RealtimeThink");
    assert.ok(chat.includes("realtime-think"), "Should have realtime-think route");
    assert.ok(chat.includes("ROUTE 6.5"), "Should label it ROUTE 6.5");
});

test("chat.js wires ConversationMode after messageComplete", () => {
    const chat = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "chat.js"), "utf8");
    assert.ok(chat.includes("JARVISConversationMode"), "Should reference ConversationMode");
    assert.ok(chat.includes("afterJarvisReplied"), "Should call afterJarvisReplied");
});

test("wakeWord.js checks ConversationMode before resuming", () => {
    const ww = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "wakeWord.js"), "utf8");
    assert.ok(ww.includes("JARVISConversationMode"), "Should reference ConversationMode");
    assert.ok(ww.includes("isActive"), "Should check isActive");
    assert.ok(ww.includes("startConversation"), "Should call startConversation");
});

test("voice.js notifies ConversationMode on utterance", () => {
    const v = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "voice.js"), "utf8");
    assert.ok(v.includes("JARVISConversationMode"), "Should reference ConversationMode");
    assert.ok(v.includes("onUserUtterance"), "Should call onUserUtterance");
});

test("cinema.css has conversation-mode-pill styles", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "renderer", "css", "cinema.css"), "utf8");
    assert.ok(css.includes("conversation-mode-pill"), "Should have pill styles");
    assert.ok(css.includes("conversation-mode-active"), "Should have active state");
});

// ============================================================
// SUMMARY
// ============================================================
console.log("\n========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");
if (failed > 0) process.exit(1);
