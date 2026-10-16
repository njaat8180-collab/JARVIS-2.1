"use strict";

/**
 * ============================================================
 * JARVIS EVOLUTION RESEARCH BOUNDARY (Phase 4 + Phase 5)
 * ============================================================
 *
 * This module is the ONLY seam between the Background Evolution
 * Engine and the outside world. EvolutionEngine.js never talks to
 * a research API directly — it only ever calls
 * `provider.research(goal)` on whatever provider it was
 * constructed with, and awaits the result. Every provider below
 * implements that same tiny interface:
 *
 *   research(goal) -> { source, generatedAt, query, findings: string[],
 *                        results: NormalizedResult[],
 *                        succeededSources: string[],
 *                        failedSources: {source, error}[] }
 *
 * (LocalDeterministicResearchProvider — Phase 4 — returns a smaller
 * shape, {source, generatedAt, findings}, with no `results`. Callers
 * (EvolutionEngine._buildProposal) treat every field beyond
 * `findings` as optional for exactly this reason.)
 *
 * ------------------------------------------------------------
 * Phase 4 — LocalDeterministicResearchProvider
 * ------------------------------------------------------------
 * Makes ZERO network requests. It only reads fields already present
 * on the goal object (knownProblems, description, nextAction,
 * status) and turns them into plain descriptive strings. It invents
 * no facts about the outside world and calls no AI/LLM of any kind.
 * This remains the engine's DEFAULT provider (see EvolutionEngine's
 * constructor) — a real research provider is only used when one is
 * explicitly injected, which is how main.js wires Phase 5 in.
 *
 * ------------------------------------------------------------
 * Phase 5 — MultiSourceResearchProvider (+ its two source adapters)
 * ------------------------------------------------------------
 * Real, but still strictly READ-ONLY, research against services that
 * already exist in this project:
 *   - src/services/wikipedia.js       (summary())
 *   - src/services/dataSources.js     (wikidataSearch())
 *
 * It does NOT implement HTTP itself, does NOT create a second cache,
 * and does NOT create a second Wikipedia/Wikidata client — it is a
 * thin adapter that calls the existing service functions (which the
 * caller may already have wrapped with src/services/offlineCache.js's
 * wrapModule()/cacheThrough(), exactly like every other command in
 * this project) and normalizes whatever comes back.
 *
 * Security (see the Phase 5 project brief, "STEP 8 — SECURITY"):
 *   - Fetched content is DATA ONLY. Nothing returned by a research
 *     service is ever eval'd, require'd, written to disk, or passed
 *     to a shell. Every value pulled out below is read as a plain
 *     string/number field on the parsed JSON response.
 *   - Every provider call runs through _withTimeout() as an extra,
 *     defense-in-depth bound on top of the timeout the underlying
 *     service already enforces (wikipedia.js / dataSources.js both
 *     have their own REQUEST_TIMEOUT_MS) — a hung promise from an
 *     injected/mocked service in a test can never hang research().
 *   - Only https:// URLs are ever surfaced in a normalized result or
 *     proposal provenance; anything else is dropped rather than
 *     shown to the user.
 *   - Evidence text is bounded (MAX_SUMMARY_LENGTH) before being
 *     stored/returned, so a single oversized response can't bloat
 *     proposals.json / evolutionHistory.json without limit.
 * ============================================================
 */

const PROVIDER_TIMEOUT_MS = 12000;
const MAX_SUMMARY_LENGTH = 2000;

function nowIso() {
    return new Date().toISOString();
}

/** Only ever surface https:// URLs in evidence/provenance. */
function safeUrl(url) {
    return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

/** Bounds evidence text length; never throws on non-string input. */
function safeSummary(text) {
    const str = text === null || text === undefined ? "" : String(text);
    return str.length > MAX_SUMMARY_LENGTH ? `${str.slice(0, MAX_SUMMARY_LENGTH)}…` : str;
}

function classifySourceFailure(error) {
    const value = String(error?.message || error || "").trim();
    if (/\b404\b|not found/i.test(value)) return "http_404";
    if (/ERR_BLOCKED_BY_CLIENT|blocked by (?:the )?client|request was blocked/i.test(value)) return "blocked_network_request";
    if (/timed out|timeout|ETIMEDOUT/i.test(value)) return "timeout";
    if (/ENOTFOUND|ECONNREFUSED|ENETUNREACH|network unavailable|failed to fetch/i.test(value)) return "source_unavailable";
    return "source_error";
}

/**
 * Normalizes any single source's outcome into the predictable shape
 * required by the Phase 5 project brief ("STEP 4 — NORMALIZED
 * RESULT"): query, source, title, summary/content, URL when
 * available, retrievedAt, success, error, metadata. Never fabricates
 * a field it wasn't given — a failed lookup gets title/summary/url
 * of null, never an invented placeholder.
 */
function normalizeResult({ query, source, success, title, summary, url, error, errorType, metadata }) {
    return {
        query: query || null,
        source,
        title: success ? title || null : null,
        summary: success ? safeSummary(summary) || null : null,
        url: success ? safeUrl(url) : null,
        retrievedAt: nowIso(),
        success: !!success,
        error: success ? null : (error || "Unknown research failure."),
        errorType: success ? null : (errorType || classifySourceFailure(error)),
        metadata: metadata || {}
    };
}

/** Defense-in-depth timeout wrapper around a single source call. */
function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Phase 4's deterministic, network-free provider. Unchanged in
 * behavior/shape from Phase 4 — kept as-is (and as the engine's
 * default) so existing callers/tests that never inject a
 * researchProvider keep working exactly as before.
 */
class LocalDeterministicResearchProvider {
    /**
     * @param {object} goal - a goal record from goalRegistry.getAll()/getById().
     * @returns {{source:string, generatedAt:string, findings:string[]}}
     */
    research(goal) {
        const findings = [];

        if (Array.isArray(goal.knownProblems) && goal.knownProblems.length > 0) {
            findings.push(`Recorded known problem: ${goal.knownProblems[0]}`);
        } else {
            findings.push(
                `No known problems recorded yet for "${goal.name}"; description on file: ${goal.description}`
            );
        }

        findings.push(`Current recorded status: ${goal.status} (${goal.completionPercentage}% complete).`);
        findings.push(`Recorded next action: ${goal.nextAction || "none recorded yet."}`);

        return {
            source: "local-deterministic",
            generatedAt: new Date().toISOString(),
            findings
        };
    }
}

/**
 * Adapter over src/services/wikipedia.js's summary(). Read-only:
 * calls the existing exported function, never touches https/fetch
 * itself.
 */
class WikipediaResearchProvider {
    /**
     * @param {object} [deps]
     * @param {object} [deps.wikipediaService] - defaults to requiring the
     *   real src/services/wikipedia.js. Tests inject a mock here instead
     *   of hitting the network.
     * @param {string} [deps.lang] - "en" | "hi", passed through to summary().
     */
    constructor({ wikipediaService, lang = "en", timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
        this.wikipediaService = wikipediaService || require("../services/wikipedia");
        this.lang = lang;
        this.timeoutMs = timeoutMs;
    }

    async researchQuery(query) {
        const source = "wikipedia";
        try {
            const page = await withTimeout(
                this.wikipediaService.summary(query, this.lang),
                this.timeoutMs,
                "Wikipedia research"
            );

            if (!page || page.success === false) {
                return normalizeResult({
                    query,
                    source,
                    success: false,
                    error: (page && page.error) || "Wikipedia returned no result."
                });
            }

            return normalizeResult({
                query,
                source,
                success: true,
                title: page.title,
                summary: page.extract,
                url: page.url,
                metadata: {
                    lang: page.lang || this.lang,
                    thumbnail: page.thumbnail || null,
                    cached: !!page.fromCache,
                    offline: !!page.offline
                }
            });
        } catch (error) {
            return normalizeResult({
                query,
                source,
                success: false,
                error: error.message || String(error)
            });
        }
    }
}

/**
 * Adapter over src/services/dataSources.js's structured lookups.
 * Phase 5 uses wikidataSearch() as the default structured source
 * (broad entity/fact coverage matches any goal name), but the
 * adapter accepts any function name already exported by
 * dataSources.js so a future goal-specific lookup (e.g.
 * npmPackageInfo for a coding-related goal) can be swapped in
 * without adding a second client.
 */
class StructuredDataResearchProvider {
    /**
     * @param {object} [deps]
     * @param {object} [deps.dataSourcesService] - defaults to requiring the
     *   real src/services/dataSources.js. Tests inject a mock here.
     * @param {string} [deps.fnName] - which exported dataSources.js
     *   function to call. Defaults to "wikidataSearch".
     */
    constructor({ dataSourcesService, fnName = "wikidataSearch", timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
        this.dataSourcesService = dataSourcesService || require("../services/dataSources");
        this.fnName = fnName;
        this.timeoutMs = timeoutMs;
    }

    async researchQuery(query) {
        const source = `dataSources.${this.fnName}`;
        const fn = this.dataSourcesService && this.dataSourcesService[this.fnName];

        if (typeof fn !== "function") {
            return normalizeResult({
                query,
                source,
                success: false,
                error: `dataSources.${this.fnName} is not available.`
            });
        }

        try {
            const data = await withTimeout(
                fn(query, "en"),
                this.timeoutMs,
                `Structured data research (${this.fnName})`
            );

            if (!data || data.success === false) {
                return normalizeResult({
                    query,
                    source,
                    success: false,
                    error: (data && data.error) || `${this.fnName} returned no result.`
                });
            }

            return normalizeResult({
                query,
                source,
                success: true,
                title: data.label || data.name || query,
                summary: data.description || data.summary || "",
                url: data.url,
                metadata: {
                    claimCount: typeof data.claimCount === "number" ? data.claimCount : undefined,
                    cached: !!data.fromCache,
                    offline: !!data.offline
                }
            });
        } catch (error) {
            return normalizeResult({
                query,
                source,
                success: false,
                error: error.message || String(error)
            });
        }
    }
}

/**
 * The provider EvolutionEngine is actually constructed with in
 * main.js (Phase 5). Fans a single goal-derived query out to every
 * configured source adapter, in parallel, and returns ALL results —
 * succeeded and failed — so a partial-source failure never silently
 * disappears (project brief "STEP 6 — MULTI-SOURCE RESEARCH").
 *
 * A source failing never throws: research() always resolves. If
 * every source fails, findings[0] says so explicitly rather than
 * ever implying research succeeded when it didn't (project brief
 * "STEP 5 — PROVENANCE": "If research fails, do not claim that
 * research succeeded.").
 */
class MultiSourceResearchProvider {
    /**
     * @param {object} [deps]
     * @param {object} [deps.wikipediaService] - passed straight through to
     *   WikipediaResearchProvider (may already be offlineCache-wrapped).
     * @param {object} [deps.dataSourcesService] - passed straight through
     *   to StructuredDataResearchProvider (may already be
     *   offlineCache-wrapped).
     * @param {Array<{researchQuery:Function}>} [deps.adapters] - fully
     *   custom adapter list for tests; overrides
     *   wikipediaService/dataSourcesService entirely when provided.
     */
    constructor({ wikipediaService, dataSourcesService, adapters } = {}) {
        this.adapters =
            adapters ||
            [
                new WikipediaResearchProvider({ wikipediaService }),
                new StructuredDataResearchProvider({ dataSourcesService, fnName: "wikidataSearch" })
            ];
    }

    /**
     * @param {object} goal - a goal record from goalRegistry.getAll()/getById().
     */
    async research(goal) {
        const query = String((goal && goal.name) || "").trim();
        const generatedAt = nowIso();

        if (!query) {
            const failResult = normalizeResult({
                query,
                source: "multi-source-research",
                success: false,
                error: "Goal has no name to research."
            });
            return {
                source: "multi-source-research",
                generatedAt,
                query,
                findings: ["No research query could be derived from this goal (missing name)."],
                results: [failResult],
                succeededSources: [],
            failedSources: [{ source: failResult.source, error: failResult.error, errorType: failResult.errorType }]
            };
        }

        const results = await Promise.all(
            this.adapters.map((adapter) =>
                adapter.researchQuery(query).catch((error) =>
                    normalizeResult({
                        query,
                        source: (adapter && adapter.constructor && adapter.constructor.name) || "unknown-source",
                        success: false,
                        error: error.message || String(error),
                        errorType: classifySourceFailure(error)
                    })
                )
            )
        );

        const succeeded = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        const findings =
            succeeded.length > 0
                ? succeeded.map((r) => `${r.source}: ${r.title ? `${r.title} — ` : ""}${r.summary || "(no summary)"}`)
                : [
                      `No live research evidence could be retrieved for "${query}". ` +
                          `${results.length} source(s) attempted, 0 succeeded.`
                  ];

        return {
            source: "multi-source-research",
            generatedAt,
            query,
            findings,
            results,
            succeededSources: succeeded.map((r) => r.source),
            failedSources: failed.map((r) => ({ source: r.source, error: r.error, errorType: r.errorType }))
        };
    }
}

module.exports = {
    LocalDeterministicResearchProvider,
    WikipediaResearchProvider,
    StructuredDataResearchProvider,
    MultiSourceResearchProvider,
    normalizeResult,
    classifySourceFailure,
    safeUrl,
    safeSummary,
    MAX_SUMMARY_LENGTH,
    PROVIDER_TIMEOUT_MS
};
