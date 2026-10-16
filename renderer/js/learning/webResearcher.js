"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — WEB RESEARCHER
 * renderer/js/learning/webResearcher.js
 * ============================================================
 *
 * Performs actual web research using legitimate APIs:
 *   1. Wikipedia API (free, no key required) — primary source
 *   2. DuckDuckGo Instant Answer API (free, no key) — supplementary
 *   3. Optional: external search API via env-configurable key
 *
 * Pipeline:
 *   Search → Source Collection → Content Extraction →
 *   Fact/Claim Extraction → Cross-Source Verification →
 *   Quality Check → Return verified knowledge candidates
 *
 * NO Google scraping (violates ToS).
 * NO cloud AI for content analysis (deterministic extraction only).
 *
 * API keys: only via environment variables / settings, never
 * hard-coded. Currently NO key is required for the default
 * Wikipedia + DDG pipeline.
 * ============================================================
 */

(function () {

    // ============================================================
    // CONFIG
    // ============================================================

    const DEFAULT_CONFIG = {
        requestTimeoutMs: 10000,
        maxSourcesPerTopic: 3,
        minVerificationSources: 2,
        minConfidence: 0.5,
        maxContentLength: 5000,
    };

    let config = { ...DEFAULT_CONFIG };

    function configure(overrides = {}) {
        config = { ...DEFAULT_CONFIG, ...overrides };
    }

    // ============================================================
    // HTTP FETCH (with timeout + graceful failure)
    // ============================================================

    async function fetchJSON(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { "Accept": "application/json", ...options.headers },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    // ============================================================
    // SEARCH PROVIDERS (all free, no API keys required)
    // ============================================================

    /**
     * Wikipedia search — returns article summaries.
     * Uses the official Wikipedia REST API (legitimate, no key).
     */
    async function searchWikipedia(query, lang = "en") {
        try {
            // Search for matching articles
            const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${config.maxSourcesPerTopic}&format=json&origin=*`;
            const searchResult = await fetchJSON(searchUrl);
            const articles = (searchResult?.query?.search || []).slice(0, config.maxSourcesPerTopic);

            // Get summary for each article
            const results = [];
            for (const article of articles) {
                try {
                    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.title)}`;
                    const summary = await fetchJSON(summaryUrl);
                    if (summary && summary.extract) {
                        results.push({
                            title: summary.title || article.title,
                            url: (summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page) || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
                            content: summary.extract,
                            source: "wikipedia",
                            quality: 0.85,
                        });
                    }
                } catch (_) {
                    // Individual article summary failure — skip
                }
            }
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error?.message || String(error), results: [] };
        }
    }

    /**
     * DuckDuckGo Instant Answer API — free, no key.
     * Returns abstract/related topics.
     */
    async function searchDuckDuckGo(query) {
        try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const result = await fetchJSON(url);

            const results = [];
            if (result && result.AbstractText) {
                results.push({
                    title: result.Heading || query,
                    url: result.AbstractURL || "",
                    content: result.AbstractText,
                    source: "duckduckgo",
                    quality: 0.65,
                });
            }
            // Related topics (max 2)
            if (result && Array.isArray(result.RelatedTopics)) {
                for (const topic of result.RelatedTopics.slice(0, 2)) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(" - ")[0] || query,
                            url: topic.FirstURL,
                            content: topic.Text,
                            source: "duckduckgo",
                            quality: 0.50,
                        });
                    }
                }
            }
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error?.message || String(error), results: [] };
        }
    }

    /**
     * Optional external search API (if key is provided via settings).
     * Uses SerpAPI-style (or any JSON search API) — key from env only.
     */
    async function searchExternal(query) {
        const apiKey = getExternalSearchKey();
        if (!apiKey) return { success: true, skipped: true, results: [] };

        try {
            const provider = getExternalSearchProvider();
            const url = provider.replace("{KEY}", encodeURIComponent(apiKey)).replace("{QUERY}", encodeURIComponent(query));
            const result = await fetchJSON(url);

            // Generic result parsing (works with most JSON search APIs)
            const results = (result.organic_results || result.results || []).slice(0, config.maxSourcesPerTopic).map(r => ({
                title: r.title || "",
                url: r.link || r.url || "",
                content: r.snippet || "",
                source: "external_api",
                quality: 0.60,
            }));
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error?.message, results: [] };
        }
    }

    function getExternalSearchKey() {
        // From settings or environment — NEVER hard-coded
        try {
            if (typeof process !== "undefined" && process.env && process.env.JARVIS_SEARCH_API_KEY) {
                return process.env.JARVIS_SEARCH_API_KEY;
            }
        } catch (_) {}
        try {
            return localStorage.getItem("jarvis_search_api_key") || null;
        } catch (_) {
            return null;
        }
    }

    function getExternalSearchProvider() {
        try {
            return localStorage.getItem("jarvis_search_api_url") ||
                "https://serpapi.com/search.json?api_key={KEY}&q={QUERY}";
        } catch (_) {
            return "https://serpapi.com/search.json?api_key={KEY}&q={QUERY}";
        }
    }

    // ============================================================
    // FACT / CLAIM EXTRACTION (deterministic, no AI)
    // ============================================================

    /**
     * Extract factual statements from text content.
     * Deterministic sentence-level extraction:
     *   - Split into sentences
     *   - Keep sentences with factual markers (is/are/was/were, dates, numbers)
     *   - Drop opinions, instructions, questions
     */
    function extractFacts(content) {
        const text = String(content || "").trim();
        if (!text) return [];

        // Split into sentences
        const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 300);

        const facts = [];
        const FACTUAL_MARKERS = /\b(?:is|are|was|were|has|have|had|can|will|consists?|contains?|includes?|provides?|supports?|offers?|allows?|enables?|requires?|uses?|based on|developed by|created by|founded|established|released|published|announced)\b/i;
        const DATE_MARKER = /\b(?:\d{4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\b/i;
        const NUMBER_MARKER = /\b\d+(?:\.\d+)?(?:\s?(?:million|billion|thousand|percent|%|km|kg|bytes|GB|MB))?\b/i;

        // Opinion / instruction / question markers — EXCLUDE
        const OPINION_MARKERS = /\b(?:I think|I believe|in my opinion|probably|maybe|might be|could be|arguably|best|worst|amazing|terrible)\b/i;
        const QUESTION_MARKER = /\?\s*$/;

        for (const sentence of sentences) {
            if (QUESTION_MARKER.test(sentence)) continue;
            if (OPINION_MARKERS.test(sentence)) continue;

            const hasFactualMarker = FACTUAL_MARKERS.test(sentence) || DATE_MARKER.test(sentence) || NUMBER_MARKER.test(sentence);
            if (!hasFactualMarker) continue;

            facts.push(sentence.trim());
        }

        return facts.slice(0, 10); // max 10 facts per source
    }

    /**
     * Extract the most representative fact (topic summary).
     */
    function extractPrimaryFact(content) {
        const facts = extractFacts(content);
        if (!facts.length) return "";
        // The first factual sentence is usually the definition/summary
        return facts[0];
    }

    // ============================================================
    // CROSS-SOURCE VERIFICATION
    // ============================================================

    /**
     * Compare facts from multiple sources for consistency.
     * Uses word-overlap similarity (deterministic).
     *
     * Returns {
     *   status: "verified" | "single_source" | "conflicting",
     *   confidence: 0..1,
     *   supportingSources: n
     * }
     */
    function verifyFacts(sources) {
        if (!sources || sources.length === 0) {
            return { status: "single_source", confidence: 0.2, supportingSources: 0 };
        }

        if (sources.length === 1) {
            return { status: "single_source", confidence: 0.45, supportingSources: 1 };
        }

        // Extract primary fact from each source
        const factsPerSource = sources.map(s => extractPrimaryFact(s.content));
        const validFacts = factsPerSource.filter(f => f.length > 0);

        if (validFacts.length < 2) {
            return { status: "single_source", confidence: 0.45, supportingSources: validFacts.length };
        }

        // Pairwise similarity
        let totalSim = 0;
        let comparisons = 0;
        let conflicts = 0;

        for (let i = 0; i < validFacts.length; i++) {
            for (let j = i + 1; j < validFacts.length; j++) {
                const sim = textSimilarity(validFacts[i], validFacts[j]);
                totalSim += sim;
                comparisons++;
                if (sim < 0.25) conflicts++;
            }
        }

        const avgSim = comparisons > 0 ? totalSim / comparisons : 0;

        // All sources say approximately the same thing
        if (conflicts === 0 && avgSim >= 0.30) {
            return {
                status: "verified",
                confidence: Math.min(0.95, 0.60 + (sources.length * 0.10) + (avgSim * 0.25)),
                supportingSources: sources.length,
            };
        }

        // Sources disagree
        if (conflicts > 0 && avgSim < 0.20) {
            return {
                status: "conflicting",
                confidence: 0.30,
                supportingSources: sources.length - conflicts,
            };
        }

        // Partial agreement
        return {
            status: "verified",
            confidence: Math.min(0.80, 0.45 + (avgSim * 0.35)),
            supportingSources: sources.length,
        };
    }

    /**
     * Word-overlap similarity between two texts (deterministic).
     */
    function textSimilarity(text1, text2) {
        const words1 = new Set(String(text1 || "").toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const words2 = new Set(String(text2 || "").toLowerCase().split(/\W+/).filter(w => w.length > 3));

        if (words1.size === 0 || words2.size === 0) return 0;

        let overlap = 0;
        for (const w of words1) {
            if (words2.has(w)) overlap++;
        }

        return overlap / Math.min(words1.size, words2.size);
    }

    // ============================================================
    // FULL RESEARCH CYCLE
    // ============================================================

    /**
     * Research a topic: search multiple sources, extract facts,
     * verify, and return knowledge candidates.
     *
     * Returns {
     *   success, topic, candidates: [{
     *     knowledge, confidence, verificationStatus,
     *     sourceTitle, sourceUrl, sources: [...]
     *   }],
     *   searchCount, failureReason
     * }
     */
    async function research(topic, options = {}) {
        const {
            allowedDomains = [],
            blockedDomains = [],
            maxSearches = 3,
        } = options;

        const log = window.JARVISKnowledgeStore?.log.bind(window.JARVISKnowledgeStore);

        log?.({ action: "research_start", topic });

        // ---- Step 1: Search (parallel across providers) ----
        const searchPromises = [
            searchWikipedia(topic),
            searchDuckDuckGo(topic),
        ];
        if (getExternalSearchKey()) {
            searchPromises.push(searchExternal(topic));
        }

        const searchResults = await Promise.allSettled(searchPromises);

        // ---- Step 2: Collect sources ----
        let allSources = [];
        let searchCount = 0;
        let failures = [];

        for (const result of searchResults) {
            if (result.status === "fulfilled") {
                const value = result.value;
                if (value.success && value.results) {
                    searchCount++;
                    for (const src of value.results) {
                        // Domain filtering
                        if (window.JARVISSafetyFilter) {
                            if (window.JARVISSafetyFilter.isDomainBlocked(src.url, blockedDomains)) continue;
                            if (!window.JARVISSafetyFilter.isDomainAllowed(src.url, allowedDomains)) continue;
                        }
                        allSources.push(src);
                    }
                } else if (!value.success) {
                    failures.push(value.error);
                }
            } else {
                failures.push(String(result.reason || "search_failed"));
            }
        }

        // Limit sources
        allSources = allSources.slice(0, Math.max(1, maxSearches * config.maxSourcesPerTopic));

        if (allSources.length === 0) {
            log?.({ action: "research_failed", topic, reason: "no_sources", failures });
            return {
                success: false,
                topic,
                candidates: [],
                searchCount,
                failureReason: failures[0] || "No valid sources found (offline or all blocked).",
            };
        }

        log?.({ action: "sources_found", topic, count: allSources.length });

        // ---- Step 3: Safety check each source ----
        const safeSources = [];
        for (const src of allSources) {
            if (!window.JARVISSafetyFilter) { safeSources.push(src); continue; }
            const checkResult = window.JARVISSafetyFilter.check(src.content);
            if (checkResult.safe) {
                safeSources.push(src);
            } else {
                log?.({
                    action: "source_blocked",
                    topic,
                    url: src.url,
                    reasons: checkResult.reasons,
                    threats: (checkResult.threats || []).map(t => t.reason),
                });
            }
        }

        if (safeSources.length === 0) {
            return {
                success: false,
                topic,
                candidates: [],
                searchCount,
                failureReason: "All sources failed safety checks.",
            };
        }

        // ---- Step 4: Source quality scoring ----
        for (const src of safeSources) {
            const quality = window.JARVISSafetyFilter
                ? window.JARVISSafetyFilter.sourceQuality(src.url)
                : 0.40;
            src.quality = Math.max(src.quality || 0, quality);
        }

        // ---- Step 5: Fact extraction + verification ----
        const verification = verifyFacts(safeSources);
        log?.({
            action: "verification",
            topic,
            status: verification.status,
            confidence: verification.confidence,
            sources: verification.supportingSources,
        });

        // ---- Step 6: Build candidates ----
        const candidates = [];

        if (verification.status !== "conflicting") {
            // Primary knowledge: from the highest-quality source
            const bestSource = safeSources.sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
            const primaryFact = extractPrimaryFact(bestSource.content);

            if (primaryFact) {
                candidates.push({
                    topic,
                    knowledge: primaryFact,
                    confidence: Math.min(0.95, verification.confidence * 0.6 + (bestSource.quality || 0.5) * 0.4),
                    verificationStatus: verification.status === "verified" ? "verified" : "unverified",
                    category: categorizeTopic(topic),
                    sourceTitle: bestSource.title,
                    sourceUrl: bestSource.url,
                    source: bestSource.source || "web",
                    sourceType: "web",
                    sources: safeSources.map(s => ({
                        url: s.url, title: s.title, confidence: s.quality || 0.5,
                    })),
                    tags: [topic.toLowerCase().split(/\s+/)[0]],
                });
            }

            // Secondary facts from other sources (up to 2 more)
            const otherFacts = [];
            for (const src of safeSources.slice(1)) {
                const fact = extractPrimaryFact(src.content);
                if (fact && !otherFacts.includes(fact)) otherFacts.push(fact);
            }
            for (const fact of otherFacts.slice(0, 2)) {
                const src = safeSources.find(s => extractPrimaryFact(s.content) === fact);
                if (src) {
                    candidates.push({
                        topic: topic + " — " + (src.title || "additional"),
                        knowledge: fact,
                        confidence: (src.quality || 0.5) * 0.8,
                        verificationStatus: "unverified",
                        category: categorizeTopic(topic),
                        sourceTitle: src.title,
                        sourceUrl: src.url,
                        source: src.source || "web",
                        sourceType: "web",
                        sources: [{ url: src.url, title: src.title, confidence: src.quality || 0.5 }],
                        tags: [topic.toLowerCase().split(/\s+/)[0]],
                    });
                }
            }
        } else {
            // Conflicting — return as conflicting candidate for user decision
            candidates.push({
                topic,
                knowledge: `[CONFLICTING SOURCES] Sources disagree about "${topic}". Primary sources: ${safeSources.slice(0, 2).map(s => s.title).join(" vs ")}`,
                confidence: 0.30,
                verificationStatus: "conflicting",
                category: categorizeTopic(topic),
                sourceTitle: safeSources[0]?.title || "",
                sourceUrl: safeSources[0]?.url || "",
                source: "web",
                sourceType: "web",
                sources: safeSources.map(s => ({
                    url: s.url, title: s.title, confidence: s.quality || 0.5,
                })),
                tags: [topic.toLowerCase().split(/\s+/)[0]],
            });
        }

        log?.({
            action: "research_complete",
            topic,
            candidates: candidates.length,
            status: verification.status,
        });

        return {
            success: true,
            topic,
            candidates,
            searchCount,
            verification,
        };
    }

    // ============================================================
    // TOPIC CATEGORIZATION
    // ============================================================

    function categorizeTopic(topic) {
        const t = String(topic || "").toLowerCase();
        if (/(?:technology|software|programming|computer|api|framework|library|javascript|python|node|electron|react|ai|machine learning)/.test(t)) return "technology";
        if (/(?:current|news|today|latest|recent|2024|2025|2026)/.test(t)) return "current";
        if (/(?:history|ancient|empire|war|dynasty|century)/.test(t)) return "history";
        if (/(?:science|physics|chemistry|biology|space|astronomy)/.test(t)) return "science";
        if (/(?:documentation|docs|guide|tutorial|reference|manual)/.test(t)) return "documentation";
        return "general";
    }

    // ============================================================
    // OFFLINE CHECK
    // ============================================================

    async function isOnline() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const response = await fetch("https://en.wikipedia.org/api/rest_v1/#", { signal: controller.signal, mode: "no-cors" });
            clearTimeout(timeout);
            return true;
        } catch (_) {
            // no-cors always throws for opaque — treat network error as offline,
            // but TypeError fetch failure = definitely offline
            return navigator.onLine !== false;
        }
    }

    // ============================================================
    // KNOWLEDGE SOURCE CHAIN (v2.3) — Wikipedia → DDG → Google →
    // Wikidata, automatic failover when a source's limit is hit.
    // Every result is permanently saved by learningManager.
    // ============================================================

    /**
     * Wikidata entity search — free, no key.
     * https://www.wikidata.org/w/api.php (wbsearchentities)
     */
    async function searchWikidata(query) {
        try {
            const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=${config.maxSourcesPerTopic}&format=json&origin=*`;
            const result = await fetchJSON(url);
            const entities = (result && result.search) || [];
            const results = entities.slice(0, config.maxSourcesPerTopic).map(e => ({
                title: (e.label || query) + (e.description ? ` (${e.description})` : ""),
                url: e.concepturi || `https://www.wikidata.org/wiki/${e.id}`,
                content: (e.description ? e.description + ". " : "") +
                    `Wikidata entity ${e.id}${e.match ? (" — " + (e.match.text || "")) : ""}.`,
                source: "wikidata",
                quality: 0.55,
            }));
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error?.message, results: [] };
        }
    }

    /**
     * Google search — TWO modes (whichever is configured):
     *   a) Google Programmable Search JSON API (key + cx)
     *   b) Generic external search API key (SerpAPI etc.)
     */
    async function searchGoogle(query) {
        // Mode a: Google CSE
        let cseKey = null, cseCx = null;
        try {
            cseKey = localStorage.getItem("jarvis_google_cse_key") || null;
            cseCx = localStorage.getItem("jarvis_google_cse_cx") || null;
        } catch (_) {}
        if (cseKey && cseCx) {
            try {
                const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(cseKey)}&cx=${encodeURIComponent(cseCx)}&q=${encodeURIComponent(query)}&num=${Math.min(10, config.maxSourcesPerTopic * 2)}`;
                const result = await fetchJSON(url);
                if (result && result.error && result.error.code === 429) {
                    return { success: false, rateLimited: true, restOfDay: true, error: "Google CSE quota exceeded", results: [] };
                }
                const items = (result.items || []).slice(0, config.maxSourcesPerTopic).map(r => ({
                    title: r.title || "",
                    url: r.link || "",
                    content: r.snippet || "",
                    source: "google",
                    quality: 0.7,
                }));
                return { success: true, results: items };
            } catch (error) {
                return { success: false, error: error?.message, results: [] };
            }
        }
        // Mode b: fall back to the generic external search key
        const ext = await searchExternal(query);
        return {
            success: ext.success,
            rateLimited: ext.rateLimited,
            results: (ext.results || []).map(r => ({ ...r, source: "google" })),
            error: ext.error
        };
    }

    /**
     * Sequential research THROUGH the source chain:
     *   wikipedia → duckduckgo → google → wikidata → external
     *
     * When a source hits its daily limit / cooldown, the chain
     * AUTOMATICALLY moves to the next one. Cross-source
     * verification happens across whatever sources replied.
     * All returned candidates are marked `permanent: true` —
     * learningManager stores them with expiresAt: null.
     */
    async function researchViaChain(topic, options = {}) {
        const chain = window.JARVISKnowledgeSourceChain;
        if (!chain) {
            // Chain module not loaded — degrade to classic parallel research
            return research(topic, options);
        }
        // Per-source timeout (default 8s) — a hung source must never
        // block the chain; the failover continues to the next source.
        if (!options.sourceTimeoutMs) options.sourceTimeoutMs = 8000;

        const log = window.JARVISKnowledgeStore?.log?.bind(window.JARVISKnowledgeStore);
        log?.({ action: "chain_research_start", topic });

        const searchers = {
            wikipedia:    searchWikipedia,
            duckduckgo:   searchDuckDuckGo,
            google:       searchGoogle,
            wikidata:     searchWikidata,
            external_api: searchExternal,
        };

        const chainResult = await chain.searchWithFallback(topic, searchers, options);

        if (!chainResult.success || !chainResult.results.length) {
            log?.({ action: "chain_research_failed", topic, reason: chainResult.reason, tried: chainResult.sourcesTried });
            return {
                success: false,
                topic,
                candidates: [],
                searchCount: chainResult.sourcesTried.length,
                servedBy: null,
                sourcesTried: chainResult.sourcesTried,
                failureReason: "All knowledge sources exhausted (" + chainResult.sourcesTried.join(", ") + ")",
            };
        }

        const safeSources = [];
        for (const src of chainResult.results) {
            if (!window.JARVISSafetyFilter) { safeSources.push(src); continue; }
            const checkResult = window.JARVISSafetyFilter.check(src.content);
            if (checkResult.safe) safeSources.push(src);
            else log?.({ action: "chain_source_blocked", topic, url: src.url, reasons: checkResult.reasons });
        }

        // FRESHNESS RULE — stable knowledge (general facts, science,
        // history…) is saved permanently; time-sensitive domains
        // (weather/news/currency/sports) get a short domain TTL so
        // stale data is NEVER returned as current.
        const domainRoute = (window.JARVISDomainRouter && options.domain)
            ? window.JARVISDomainRouter.routeFor(options.domain)
            : { ttl: null };

        const candidates = safeSources.map(src => {
            const facts = extractFacts(src.content);
            return {
                topic: normalizeTopicKey(topic),
                knowledge: extractPrimaryFact(src.content) || facts[0] || String(src.content).slice(0, 300),
                facts,
                category: categorizeTopic(src.title + " " + src.content),
                source: src.source || "chain",
                sourceTitle: src.title,
                sourceUrl: src.url,
                confidence: src.quality || 0.5,
                verificationStatus: "single_source",
                domain: options.domain || "general",
                permanent: domainRoute.ttl === null, // stable → forever; time-sensitive → domain TTL
            };
        }).filter(c => c.knowledge && c.knowledge.length > 0);

        log?.({ action: "chain_research_done", topic, servedBy: chainResult.servedBy, candidates: candidates.length });

        return {
            success: true,
            topic,
            candidates,
            searchCount: chainResult.sourcesTried.length,
            servedBy: chainResult.servedBy,
            sourcesTried: chainResult.sourcesTried,
            chainReport: chainResult.chainSnapshot,
        };
    }

    function normalizeTopicKey(topic) {
        return String(topic || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISWebResearcher = ({ // not frozen: tests mock isOnline/searchWikipedia for offline/rate-limit scenarios
        version: "WR-V2",
        research,
        researchViaChain,
        searchWikipedia,
        searchDuckDuckGo,
        searchGoogle,
        searchWikidata,
        extractFacts,
        extractPrimaryFact,
        verifyFacts,
        textSimilarity,
        categorizeTopic,
        isOnline,
        configure,
    });

    console.log("JARVIS Web Researcher WR-V2 READY (chain: Wikipedia → DDG → Google → Wikidata)");

})();
