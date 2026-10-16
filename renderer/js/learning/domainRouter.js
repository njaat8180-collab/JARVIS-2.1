"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — DOMAIN-AWARE KNOWLEDGE ROUTER
 * renderer/js/learning/domainRouter.js
 * ============================================================
 * Routes a question to the RIGHT source instead of using one
 * universal source for everything — deterministic, ZERO AI.
 *
 *   Weather   → weather IPC (Open-Meteo)          TTL 10 min
 *   News      → news IPC                          TTL 1 hour
 *   Currency  → currency IPC                     TTL 1 hour
 *   Books     → books IPC (Open Library)         TTL 30 days
 *   Country   → Wikidata / REST Countries         TTL ∞ (stable)
 *   Weather/Sports/Finance = SHORT TTL
 *   General factual → chain (Wikipedia first)     TTL by category
 *   Current web info → chain (search first)
 *
 * Dual-exported for Node testing.
 * ============================================================
 */

var DomainRouter = (function () {

    // --------------------------------------------------------
    // Freshness TTLs per domain (ms). null = permanent/stable.
    // --------------------------------------------------------
    var DAY = 24 * 60 * 60 * 1000;
    var HOUR = 60 * 60 * 1000;
    var MINUTE = 60 * 1000;

    var DOMAINS = {
        weather: {
            ttl: 10 * MINUTE,
            keywords: /\b(weather|mausam|temperature|forecast|barish|baarish|rain|snow|humidity|wind|garmi|thand|hot|cold)\b/i,
            preferredOrder: ["duckduckgo", "wikipedia", "wikidata"], // live data first
            note: "Live data — never serve stale cached weather as current."
        },
        news: {
            ttl: 1 * HOUR,
            keywords: /\b(news|khabar|headlines|headline|aaj ki|today'?s news|breaking)\b/i,
            preferredOrder: ["duckduckgo", "google", "wikipedia"],
            note: "News ages fast — 1 hour TTL."
        },
        currency: {
            ttl: 1 * HOUR,
            keywords: /\b(dollar|rupee|euro|pound|yen|exchange rate|convert|currency|forex|inr|usd|cad|aud)\b/i,
            preferredOrder: ["duckduckgo", "google"],
            note: "Rates move — 1 hour TTL."
        },
        sports: {
            ttl: 1 * HOUR,
            keywords: /\b(score|match|cricket|football|goal|ipl|world cup|tournament|kl Rahul|kohli)\b/i,
            preferredOrder: ["duckduckgo", "google", "wikipedia"],
            note: "Scores change — 1 hour TTL."
        },
        books: {
            ttl: 30 * DAY,
            keywords: /\b(book|books|kitaab|kitab|novel|author|likha|writer|wrote)\b/i,
            preferredOrder: ["wikipedia", "wikidata", "duckduckgo"],
            note: "Publishing metadata is stable for ~a month."
        },
        country: {
            ttl: null, // stable facts
            keywords: /\b(country|capital|population|language of|continent|rajya|desh|dhani|population kya)\b/i,
            preferredOrder: ["wikidata", "wikipedia", "duckduckgo"],
            note: "Stable factual data — permanent once verified."
        },
        science: {
            ttl: null, // stable
            keywords: /\b(physics|chemistry|biology|mathematics|theorem|equation|quantum|element|atom)\b/i,
            preferredOrder: ["wikipedia", "wikidata", "duckduckgo"],
            note: "Stable science — permanent."
        },
        history: {
            ttl: null, // stable
            keywords: /\b(history|itihās|itihas|empire|war|ancient|century|king|raja|dynasty)\b/i,
            preferredOrder: ["wikipedia", "wikidata", "duckduckgo"],
            note: "Historical facts — permanent."
        },
        technology: {
            ttl: 90 * DAY,
            keywords: /\b(software|framework|library|api|version|release|programming|javascript|python|node)\b/i,
            preferredOrder: ["wikipedia", "duckduckgo", "wikidata"],
            note: "Software info — 3 month TTL."
        }
    };

    var DEFAULT_ROUTE = {
        domain: "general",
        ttl: null,
        preferredOrder: ["wikipedia", "duckduckgo", "google", "wikidata", "external_api"],
        note: "General factual — Wikipedia first, permanent once verified."
    };

    // --------------------------------------------------------
    // Question classifier (deterministic)
    // --------------------------------------------------------
    function classifyQuestion(text) {
        var t = String(text || "");
        if (!t.trim()) return routeFor("general");

        // Longest-match-first: check each domain's keywords
        var best = null;
        Object.keys(DOMAINS).forEach(function (name) {
            var def = DOMAINS[name];
            if (def.keywords.test(t)) {
                if (!best || String(def.keywords).length > String(DOMAINS[best].keywords).length) {
                    best = name;
                }
            }
        });

        return routeFor(best || "general");
    }

    function routeFor(domain) {
        var def = DOMAINS[domain];
        if (!def) {
            return {
                domain: "general",
                ttl: DEFAULT_ROUTE.ttl,
                preferredOrder: DEFAULT_ROUTE.preferredOrder.slice(),
                note: DEFAULT_ROUTE.note
            };
        }
        return {
            domain: domain,
            ttl: def.ttl,
            preferredOrder: def.preferredOrder.slice(),
            note: def.note
        };
    }

    // --------------------------------------------------------
    // Freshness helpers
    // --------------------------------------------------------

    /**
     * Is a stored knowledge entry still fresh for its domain?
     * null/missing expiresAt = permanent → always fresh.
     */
    function isFresh(entry, domainTtl) {
        if (!entry) return false;
        if (!entry.expiresAt) return true; // permanent
        try {
            return new Date(entry.expiresAt).getTime() > Date.now();
        } catch (_) {
            return false;
        }
    }

    /**
     * Compute an expiresAt timestamp for a newly learned entry,
     * honoring the domain TTL (shorter wins vs category TTL).
     */
    function computeDomainExpiry(domain, categoryExpiry) {
        var def = DOMAINS[domain];
        var domainTtl = def ? def.ttl : null;

        if (domainTtl === null) return categoryExpiry || null; // stable → category rule (may be null = permanent)
        var domainExpiry = new Date(Date.now() + domainTtl).toISOString();
        if (!categoryExpiry) return domainExpiry;
        // shorter lifetime wins — freshness never lies
        return new Date(categoryExpiry).getTime() < new Date(domainExpiry).getTime()
            ? categoryExpiry
            : domainExpiry;
    }

    function listDomains() {
        return Object.keys(DOMAINS).map(function (k) {
            return { domain: k, ttl: DOMAINS[k].ttl, preferredOrder: DOMAINS[k].preferredOrder.slice() };
        });
    }

    return {
        classifyQuestion: classifyQuestion,
        routeFor: routeFor,
        isFresh: isFresh,
        computeDomainExpiry: computeDomainExpiry,
        listDomains: listDomains,
        DOMAINS: DOMAINS
    };
})();

if (typeof window !== "undefined") window.JARVISDomainRouter = DomainRouter;
if (typeof module !== "undefined" && module.exports) module.exports = DomainRouter;
