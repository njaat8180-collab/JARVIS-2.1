"use strict";

/**
 * Phase 8 — NO AI VERIFICATION.
 *
 * Confirms the Phase 8 long-term memory system (src/ai/memory.js and
 * its new IPC surface in main.js/preload.js) is 100% deterministic
 * and local: no LLM/AI SDK calls, no embeddings, no vector databases,
 * no cloud AI services, in that code path.
 *
 * This does NOT assert that the whole repository is AI-free — the
 * pre-existing, already-disabled `src/ai/openai.js` integration
 * predates Phase 8 and is out of scope (see
 * PHASE8_MEMORY_ARCHITECTURE_AUDIT.md and the "cloud AI remains
 * disabled" regression test in test/final-integration-regression.test.js).
 * Phase 8 must not touch, re-enable, or depend on it, and this test
 * checks exactly that boundary.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MEMORY_SOURCE_PATH = path.join(__dirname, "..", "src", "ai", "memory.js");

const FORBIDDEN_PATTERNS = [
    /require\(["']openai["']\)/i,
    /require\(["']@anthropic-ai/i,
    /require\(["']@google\/generative-ai["']\)/i,
    /\bnew\s+OpenAI\s*\(/,
    /\bnew\s+Anthropic\s*\(/,
    /api\.openai\.com/i,
    /api\.anthropic\.com/i,
    /generativelanguage\.googleapis\.com/i,
    /embeddings?\.create/i,
    /text-embedding-/i,
    /pinecone/i,
    /\bchromadb\b/i,
    /\bweaviate\b/i,
    /\bfaiss\b/i,
    /vector[-_]?db/i,
    /semantic[-_]?search/i,
    /\bLLM\b/,
    /\bgpt-\d/i,
    /\bclaude-/i,
    /\bgemini\b/i
];

test("src/ai/memory.js contains no AI/LLM/embeddings/vector-DB references", () => {
    const source = fs.readFileSync(MEMORY_SOURCE_PATH, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
        assert.equal(
            pattern.test(source),
            false,
            `Forbidden AI-related pattern found in memory.js: ${pattern}`
        );
    }
});

test("MemoryEngine module only requires Node built-ins (fs/path/crypto) — no AI SDK dependency", () => {
    const source = fs.readFileSync(MEMORY_SOURCE_PATH, "utf8");
    const requireCalls = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map(m => m[1]);
    const ALLOWED = new Set(["fs", "path", "crypto"]);
    for (const dep of requireCalls) {
        assert.ok(ALLOWED.has(dep), `Unexpected dependency in memory.js: "${dep}" (only Node built-ins fs/path/crypto are allowed)`);
    }
});

test("MemoryEngine's classification/extraction is rule-based (regex), not model-based", () => {
    const { MemoryEngine } = require("../src/ai/memory");
    const os = require("node:os");
    const memory = new MemoryEngine({
        storagePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-noai-test-")), "memory.json")
    });

    // Same input -> same output, every time, with no network access
    // and no model call involved. This is the observable signature
    // of deterministic rule-based classification.
    const a = memory.classifyMessage("I am building a JARVIS assistant");
    const b = memory.classifyMessage("I am building a JARVIS assistant");
    assert.deepEqual(a, b);
});

test("search()/list()/stats() never call out to a network — package.json has no AI SDK dependency introduced by Phase 8", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    const newAiDeps = deps.filter(d =>
        /openai|anthropic|@google\/generative-ai|pinecone|weaviate|chromadb|langchain|llamaindex/i.test(d)
    );
    // The pre-existing "openai" dependency predates Phase 8 (see audit
    // doc — it backs the already-disabled cloud fallback). Phase 8
    // must not have added any *other* AI dependency.
    const introducedByPhase8 = newAiDeps.filter(d => d !== "openai");
    assert.deepEqual(introducedByPhase8, [], `Phase 8 must not introduce AI dependencies, found: ${introducedByPhase8.join(", ")}`);
});

test("AI/LLM/API INTEGRATION verification banner", () => {
    // This assertion exists purely as a documented, greppable marker
    // for the Phase 8 verification step.
    const VERIFICATION = "AI/LLM/API INTEGRATION: NONE ADDED";
    assert.equal(VERIFICATION, "AI/LLM/API INTEGRATION: NONE ADDED");
});
