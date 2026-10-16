"use strict";

/**
 * Phase 5 — Research Integration.
 *
 * All 24 scenarios from the Phase 5 project brief ("STEP 12 — TESTS").
 * Every test here is fully deterministic and offline: no test ever
 * makes a real network call. Wikipedia/Wikidata are always mocked via
 * constructor injection (wikipediaService / dataSourcesService), the
 * same dependency-injection pattern EvolutionEngine.js already uses
 * for goalRegistry/checkpoint/researchProvider.
 *
 * Uses a fresh temp directory per test (matching
 * test/evolution-engine.test.js's isolation pattern) so these tests
 * never touch real project state and never interfere with each other.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const goalRegistryModule = require("../src/evolution/goalRegistry");
const checkpointModule = require("../src/evolution/checkpoint");
const { EvolutionEngine } = require("../src/evolution/EvolutionEngine");
const {
    LocalDeterministicResearchProvider,
    WikipediaResearchProvider,
    StructuredDataResearchProvider,
    MultiSourceResearchProvider,
    normalizeResult,
    classifySourceFailure,
    safeUrl,
    MAX_SUMMARY_LENGTH
} = require("../src/evolution/researchProvider");
const dataSources = require("../src/services/dataSources");

test("research errors distinguish not-found, client-blocked, timeout, and unavailable sources", () => {
    assert.equal(classifySourceFailure("Request failed (404)"), "http_404");
    assert.equal(classifySourceFailure("net::ERR_BLOCKED_BY_CLIENT"), "blocked_network_request");
    assert.equal(classifySourceFailure("Wikipedia timed out after 12000ms"), "timeout");
    assert.equal(classifySourceFailure("getaddrinfo ENOTFOUND api.example.test"), "source_unavailable");
    assert.equal(normalizeResult({ query: "x", source: "test", success: false, error: "net::ERR_BLOCKED_BY_CLIENT" }).errorType, "blocked_network_request");
});

test("Frankfurter HTTP 404 is returned once as an HTTP error instead of triggering a duplicate fallback request", async () => {
    let calls = 0;
    dataSources.setNetworkFetch(async () => { calls += 1; return { ok: false, status: 404, text: async () => "Not found" }; });
    try {
        const result = await dataSources.currencyConvert(100, "USD", "INR");
        assert.equal(result.success, false);
        assert.match(result.error, /404/);
        assert.equal(calls, 1);
    } finally {
        dataSources.setNetworkFetch(null);
    }
});

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-research-provider-test-"));
}

function buildEngine(overrides = {}) {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));

    const engine = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir,
        ...overrides
    });

    return { dir, goalRegistry: goalRegistryModule, checkpoint: checkpointModule, engine };
}

const SAMPLE_GOAL = {
    goalId: "goal-01-core-brain",
    name: "Core Brain",
    category: "Core Intelligence",
    description: "The central reasoning/decision pipeline.",
    status: "NOT_STARTED",
    completionPercentage: 0,
    knownProblems: [],
    nextAction: ""
};

/* ============================================================
   1. Research provider initialization
============================================================ */

test("1. research provider initialization: default adapters construct without a real network call", () => {
    const provider = new MultiSourceResearchProvider({
        wikipediaService: { summary: async () => ({ success: false, error: "unused" }) },
        dataSourcesService: { wikidataSearch: async () => ({ success: false, error: "unused" }) }
    });
    assert.equal(provider.adapters.length, 2);
    assert.ok(provider.adapters[0] instanceof WikipediaResearchProvider);
    assert.ok(provider.adapters[1] instanceof StructuredDataResearchProvider);
});

test("1b. WikipediaResearchProvider/StructuredDataResearchProvider construct with injected mocks", () => {
    const wiki = new WikipediaResearchProvider({ wikipediaService: { summary: async () => ({ success: true }) } });
    const structured = new StructuredDataResearchProvider({ dataSourcesService: { wikidataSearch: async () => ({ success: true }) } });
    assert.equal(typeof wiki.researchQuery, "function");
    assert.equal(typeof structured.researchQuery, "function");
});

/* ============================================================
   2. Wikipedia success
============================================================ */

test("2. Wikipedia success returns a normalized, successful result", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async (q) => ({
                success: true,
                title: "Artificial intelligence",
                extract: "AI is the simulation of human intelligence by machines.",
                url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
                lang: "en"
            })
        }
    });

    const result = await provider.researchQuery("Artificial intelligence");
    assert.equal(result.success, true);
    assert.equal(result.source, "wikipedia");
    assert.equal(result.title, "Artificial intelligence");
    assert.match(result.summary, /simulation of human intelligence/);
    assert.equal(result.url, "https://en.wikipedia.org/wiki/Artificial_intelligence");
    assert.equal(result.error, null);
});

/* ============================================================
   3. Existing structured data service success
============================================================ */

test("3. Structured data (Wikidata) success returns a normalized, successful result", async () => {
    const provider = new StructuredDataResearchProvider({
        dataSourcesService: {
            wikidataSearch: async (q) => ({
                success: true,
                id: "Q11660",
                label: "artificial intelligence",
                description: "intelligence demonstrated by machines",
                url: "https://www.wikidata.org/wiki/Q11660",
                claimCount: 42
            })
        }
    });

    const result = await provider.researchQuery("Artificial intelligence");
    assert.equal(result.success, true);
    assert.equal(result.source, "dataSources.wikidataSearch");
    assert.equal(result.title, "artificial intelligence");
    assert.equal(result.summary, "intelligence demonstrated by machines");
    assert.equal(result.url, "https://www.wikidata.org/wiki/Q11660");
    assert.equal(result.metadata.claimCount, 42);
});

/* ============================================================
   4. Normalized result shape
============================================================ */

test("4. normalizeResult always includes every required field, success or failure", () => {
    const ok = normalizeResult({ query: "q", source: "s", success: true, title: "t", summary: "sum", url: "https://example.com" });
    for (const field of ["query", "source", "title", "summary", "url", "retrievedAt", "success", "error", "metadata"]) {
        assert.ok(Object.prototype.hasOwnProperty.call(ok, field), `missing field: ${field}`);
    }
    assert.equal(ok.error, null);

    const failed = normalizeResult({ query: "q", source: "s", success: false, error: "boom" });
    assert.equal(failed.title, null);
    assert.equal(failed.summary, null);
    assert.equal(failed.url, null);
    assert.equal(failed.error, "boom");
    assert.equal(failed.success, false);
});

test("4b. normalizeResult never fabricates a missing field", () => {
    const result = normalizeResult({ query: "q", source: "s", success: true });
    // success:true but no title/summary/url supplied -> must stay null, never invented.
    assert.equal(result.title, null);
    assert.equal(result.summary, null);
    assert.equal(result.url, null);
});

/* ============================================================
   5. Provenance
============================================================ */

test("5. proposal provenance preserves source, title, query, URL, timestamp, and evidence summary", async () => {
    const { engine } = buildEngine({
        researchProvider: new MultiSourceResearchProvider({
            wikipediaService: {
                summary: async () => ({
                    success: true,
                    title: "Core Brain (concept)",
                    extract: "A reasoning pipeline.",
                    url: "https://en.wikipedia.org/wiki/Core_Brain"
                })
            },
            dataSourcesService: {
                wikidataSearch: async () => ({ success: false, error: "no match" })
            }
        })
    });

    const result = await engine.start();
    assert.equal(result.success, true);
    const proposal = engine.getProposals()[0];
    assert.ok(Array.isArray(proposal.provenance));
    assert.equal(proposal.provenance.length, 2);

    const wikiProv = proposal.provenance.find((p) => p.source === "wikipedia");
    assert.equal(wikiProv.success, true);
    assert.equal(wikiProv.sourceTitle, "Core Brain (concept)");
    assert.equal(wikiProv.sourceUrl, "https://en.wikipedia.org/wiki/Core_Brain");
    assert.equal(typeof wikiProv.retrievedAt, "string");
    assert.match(wikiProv.evidenceSummary, /reasoning pipeline/);
    assert.ok(wikiProv.query);

    const wikidataProv = proposal.provenance.find((p) => p.source === "dataSources.wikidataSearch");
    assert.equal(wikidataProv.success, false);
    assert.equal(wikidataProv.error, "no match");
});

/* ============================================================
   6. Multi-source research
============================================================ */

test("6. multi-source research runs every configured adapter and returns all results", async () => {
    const provider = new MultiSourceResearchProvider({
        wikipediaService: { summary: async () => ({ success: true, title: "T1", extract: "E1", url: "https://en.wikipedia.org/wiki/T1" }) },
        dataSourcesService: { wikidataSearch: async () => ({ success: true, label: "T2", description: "E2", url: "https://www.wikidata.org/wiki/Q1" }) }
    });

    const research = await provider.research(SAMPLE_GOAL);
    assert.equal(research.results.length, 2);
    assert.deepEqual(research.succeededSources.sort(), ["dataSources.wikidataSearch", "wikipedia"]);
    assert.equal(research.failedSources.length, 0);
    assert.equal(research.findings.length, 2);
});

/* ============================================================
   7. Partial source failure
============================================================ */

test("7. partial source failure: research continues with valid results and records the failure", async () => {
    const provider = new MultiSourceResearchProvider({
        wikipediaService: { summary: async () => ({ success: true, title: "T1", extract: "E1", url: "https://en.wikipedia.org/wiki/T1" }) },
        dataSourcesService: { wikidataSearch: async () => ({ success: false, error: "Open Library-style failure" }) }
    });

    const research = await provider.research(SAMPLE_GOAL);
    assert.equal(research.results.length, 2);
    assert.equal(research.succeededSources.length, 1);
    assert.equal(research.succeededSources[0], "wikipedia");
    assert.equal(research.failedSources.length, 1);
    assert.equal(research.failedSources[0].source, "dataSources.wikidataSearch");
    assert.equal(research.failedSources[0].error, "Open Library-style failure");
    // The failure must never be silently dropped from findings/results.
    assert.ok(research.results.some((r) => r.success === false));
});

/* ============================================================
   8. Total source failure
============================================================ */

test("8. total source failure: research never claims success and says so explicitly", async () => {
    const provider = new MultiSourceResearchProvider({
        wikipediaService: { summary: async () => ({ success: false, error: "down" }) },
        dataSourcesService: { wikidataSearch: async () => ({ success: false, error: "down too" }) }
    });

    const research = await provider.research(SAMPLE_GOAL);
    assert.equal(research.succeededSources.length, 0);
    assert.equal(research.failedSources.length, 2);
    assert.match(research.findings[0], /No live research evidence could be retrieved/);
    assert.ok(research.results.every((r) => r.success === false));
});

/* ============================================================
   9. Timeout
============================================================ */

test("9. a source that never resolves is timed out rather than hanging research()", async () => {
    const hangingService = {
        summary: () => new Promise(() => {}) // never resolves
    };
    const provider = new WikipediaResearchProvider({ wikipediaService: hangingService, timeoutMs: 30 });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, false);
    assert.match(result.error, /timed out/);
});

/* ============================================================
   10. HTTP 4xx
============================================================ */

test("10. HTTP 4xx from a source is recorded as a normal failure, not a crash", async () => {
    const provider = new StructuredDataResearchProvider({
        dataSourcesService: {
            wikidataSearch: async () => ({ success: false, error: "Request failed (404) for www.wikidata.org" })
        }
    });
    const result = await provider.researchQuery("nonexistent-entity-xyz");
    assert.equal(result.success, false);
    assert.match(result.error, /404/);
});

/* ============================================================
   11. HTTP 5xx
============================================================ */

test("11. HTTP 5xx from a source is recorded as a normal failure, not a crash", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({ success: false, error: "Wikipedia request failed (503)" })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, false);
    assert.match(result.error, /503/);
});

/* ============================================================
   12. Invalid JSON
============================================================ */

test("12. invalid JSON from a source (service throws) is caught and normalized as a failure", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => {
                throw new Error("Wikipedia returned invalid JSON.");
            }
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, false);
    assert.match(result.error, /invalid JSON/);
});

/* ============================================================
   13. Empty response
============================================================ */

test("13. an empty-but-successful response never fabricates title/summary text", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({ success: true, title: "", extract: "", url: "" })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, true);
    assert.equal(result.title, null);
    assert.equal(result.summary, null);
    assert.equal(result.url, null);
});

/* ============================================================
   14. Oversized response
============================================================ */

test("14. an oversized response is truncated to the bounded evidence length", async () => {
    const huge = "x".repeat(MAX_SUMMARY_LENGTH + 5000);
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({ success: true, title: "Big", extract: huge, url: "https://en.wikipedia.org/wiki/Big" })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, true);
    assert.ok(result.summary.length <= MAX_SUMMARY_LENGTH + 1); // +1 for the ellipsis char
    assert.ok(result.summary.endsWith("…"));
});

/* ============================================================
   15. Cache hit
============================================================ */

test("15. a cache-hit response (offlineCache.cacheThrough) is surfaced as cached in metadata", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({
                success: true,
                title: "Cached title",
                extract: "Cached extract.",
                url: "https://en.wikipedia.org/wiki/Cached",
                fromCache: true,
                cachedAt: "2026-01-01T00:00:00.000Z"
            })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, true);
    assert.equal(result.metadata.cached, true);
});

/* ============================================================
   16. Offline cache fallback
============================================================ */

test("16. offline with a cache available falls back to cached evidence and marks it offline", async () => {
    const provider = new StructuredDataResearchProvider({
        dataSourcesService: {
            wikidataSearch: async () => ({
                success: true,
                label: "Offline label",
                description: "Offline description.",
                url: "https://www.wikidata.org/wiki/Q1",
                offline: true,
                fromCache: true
            })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, true);
    assert.equal(result.metadata.offline, true);
    assert.equal(result.metadata.cached, true);
});

/* ============================================================
   17. Offline with no cache
============================================================ */

test("17. offline with no cache available is a clear failure, never a fabricated result", async () => {
    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({ success: false, error: "Wikipedia request timed out.", offline: true })
        }
    });
    const result = await provider.researchQuery("anything");
    assert.equal(result.success, false);
    assert.equal(result.title, null);
    assert.equal(result.summary, null);
});

/* ============================================================
   18 & 19. Research evidence reaches EvolutionEngine / proposal provenance
============================================================ */

test("18-19. research evidence reaches EvolutionEngine and the resulting proposal carries provenance", async () => {
    const { engine } = buildEngine({
        researchProvider: new MultiSourceResearchProvider({
            wikipediaService: {
                summary: async () => ({
                    success: true,
                    title: "Evidence Title",
                    extract: "Evidence body text.",
                    url: "https://en.wikipedia.org/wiki/Evidence"
                })
            },
            dataSourcesService: {
                wikidataSearch: async () => ({ success: true, label: "Evidence Label", description: "Evidence desc.", url: "https://www.wikidata.org/wiki/Q9" })
            }
        })
    });

    const result = await engine.start();
    assert.equal(result.success, true);
    assert.equal(engine.state, "waiting_approval");

    const proposal = engine.getProposals()[0];
    assert.match(proposal.observedIssue, /Evidence Title|Evidence Label/);
    assert.equal(proposal.research.succeededSources.length, 2);
    assert.equal(proposal.provenance.length, 2);
    assert.ok(proposal.provenance.every((p) => typeof p.retrievedAt === "string"));
});

/* ============================================================
   20. Approval gate still blocks automatic application
============================================================ */

test("20. successful research never bypasses the approval gate", async () => {
    const { engine } = buildEngine({
        researchProvider: new MultiSourceResearchProvider({
            wikipediaService: { summary: async () => ({ success: true, title: "T", extract: "E", url: "https://en.wikipedia.org/wiki/T" }) },
            dataSourcesService: { wikidataSearch: async () => ({ success: true, label: "L", description: "D", url: "https://www.wikidata.org/wiki/Q1" }) }
        })
    });

    await engine.start();
    assert.equal(engine.state, "waiting_approval");

    // Permission is OFF by default -> approval must still be refused even
    // though research fully succeeded.
    const blocked = engine.approveProposal(engine.currentProposalId);
    assert.equal(blocked.success, false);
    assert.match(blocked.error, /permission/i);
    assert.equal(engine.state, "waiting_approval");

    engine.enableSessionPermission();
    const approved = engine.approveProposal(engine.currentProposalId);
    assert.equal(approved.success, true);
    assert.equal(engine.state, "completed");
});

/* ============================================================
   21. Fetched content is never executed
============================================================ */

test("21. fetched content is stored as inert data and is never executed", async () => {
    global.__PHASE5_SHOULD_NEVER_RUN__ = false;
    const malicious = "<script>global.__PHASE5_SHOULD_NEVER_RUN__ = true;</script> also `${(()=>{global.__PHASE5_SHOULD_NEVER_RUN__=true})()}`";

    const provider = new WikipediaResearchProvider({
        wikipediaService: {
            summary: async () => ({
                success: true,
                title: "Malicious-looking title",
                extract: malicious,
                url: "https://en.wikipedia.org/wiki/Malicious"
            })
        }
    });

    const result = await provider.researchQuery("anything");
    assert.equal(result.success, true);
    assert.equal(result.summary.includes("script"), true); // stored verbatim as text...
    assert.equal(global.__PHASE5_SHOULD_NEVER_RUN__, false); // ...but never executed
    delete global.__PHASE5_SHOULD_NEVER_RUN__;
});

test("21b. only https:// URLs are ever surfaced; other schemes are dropped, not executed/opened", () => {
    assert.equal(safeUrl("https://en.wikipedia.org/wiki/X"), "https://en.wikipedia.org/wiki/X");
    assert.equal(safeUrl("javascript:alert(1)"), null);
    assert.equal(safeUrl("file:///etc/passwd"), null);
    assert.equal(safeUrl("http://insecure.example.com"), null);
    assert.equal(safeUrl(""), null);
    assert.equal(safeUrl(null), null);
});

/* ============================================================
   22. Phase 2 regression
============================================================ */

test("22. Phase 2 regression: goalRegistry still seeds all 39 goals with the real research provider wired in", async () => {
    const { engine, goalRegistry } = buildEngine({
        researchProvider: new MultiSourceResearchProvider({
            wikipediaService: { summary: async () => ({ success: true, title: "T", extract: "E", url: "https://en.wikipedia.org/wiki/T" }) },
            dataSourcesService: { wikidataSearch: async () => ({ success: true, label: "L", description: "D", url: "https://www.wikidata.org/wiki/Q1" }) }
        })
    });
    assert.equal(goalRegistry.getAll().length, 39);
    await engine.start();
    assert.equal(goalRegistry.getAll().length, 39);
});

/* ============================================================
   23. Phase 3 regression
============================================================ */

test("23. Phase 3 regression: checkpoint reload still restores state exactly after an async research cycle", async () => {
    const dir = tempDir();
    goalRegistryModule.init(path.join(dir, "goalRegistry.json"));
    checkpointModule.init(path.join(dir, "checkpoint.json"));
    const engine = new EvolutionEngine({
        goalRegistry: goalRegistryModule,
        checkpoint: checkpointModule,
        storageDir: dir,
        researchProvider: new MultiSourceResearchProvider({
            wikipediaService: { summary: async () => ({ success: true, title: "T", extract: "E", url: "https://en.wikipedia.org/wiki/T" }) },
            dataSourcesService: { wikidataSearch: async () => ({ success: true, label: "L", description: "D", url: "https://www.wikidata.org/wiki/Q1" }) }
        })
    });

    await engine.start();
    const before = checkpointModule.getCheckpoint();

    checkpointModule.init(path.join(dir, "checkpoint.json")); // reload, restart-equivalent
    const after = checkpointModule.getCheckpoint();

    assert.deepEqual(after, before);
});

/* ============================================================
   24. Phase 4 regression
============================================================ */

test("24. Phase 4 regression: LocalDeterministicResearchProvider (default, network-free) still works unchanged", async () => {
    const { engine } = buildEngine({ researchProvider: new LocalDeterministicResearchProvider() });
    const result = await engine.start();
    assert.equal(result.success, true);
    assert.equal(engine.state, "waiting_approval");
    const proposal = engine.getProposals()[0];
    // No results[] from this provider -> provenance/research default safely to empty, never crash.
    assert.deepEqual(proposal.provenance, []);
    assert.deepEqual(proposal.research.succeededSources, []);
    assert.ok(proposal.observedIssue);
});

test("24b. EvolutionEngine still defaults to LocalDeterministicResearchProvider when no researchProvider is injected", async () => {
    const { engine } = buildEngine(); // no researchProvider override
    assert.ok(engine.researchProvider instanceof LocalDeterministicResearchProvider);
    const result = await engine.start();
    assert.equal(result.success, true);
});
