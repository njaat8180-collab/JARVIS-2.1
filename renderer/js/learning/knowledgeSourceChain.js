"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — KNOWLEDGE SOURCE CHAIN
 * renderer/js/learning/knowledgeSourceChain.js
 * ============================================================
 *
 * Wikipedia ki limit poori → Google use karo.
 * Google ki limit poori → agla platform.
 * Har source se seekha hua knowledge PERMANENTLY save.
 *
 * Priority chain (failover order):
 *   1. wikipedia      (free, no key, 500 searches/day)
 *   2. duckduckgo     (free, no key, 200 searches/day)
 *   3. google         (search API key — Google CSE / SerpAPI, 100/day)
 *   4. wikidata       (free, no key, 300 entity searches/day)
 *   5. external_api   (any custom provider, 100/day)
 *
 * Quota tracking per source, persisted across restarts
 * (localStorage). When a source hits its daily limit OR
 * reports rate-limiting (HTTP 429) OR fails 3 times in a
 * row, it enters cooldown and the chain AUTOMATICALLY
 * fails over to the next source.
 *
 * Dual-exported for Node testing.
 * ============================================================
 */

var KnowledgeSourceChain = (function () {

    var STORE_KEY = "jarvis.knowledgeSourceChain.v1";

    // Chain definition — LOWER priority number = tried FIRST
    var SOURCES = {
        wikipedia:    { priority: 1, dailyLimit: 500, cooldownMin: 15, label: "Wikipedia",    needsKey: false },
        duckduckgo:   { priority: 2, dailyLimit: 200, cooldownMin: 15, label: "DuckDuckGo",   needsKey: false },
        google:       { priority: 3, dailyLimit: 100, cooldownMin: 30, label: "Google",       needsKey: true  },
        wikidata:     { priority: 4, dailyLimit: 300, cooldownMin: 15, label: "Wikidata",     needsKey: false },
        external_api: { priority: 5, dailyLimit: 100, cooldownMin: 30, label: "External API",  needsKey: true  }
    };

    var FAILURE_THRESHOLD = 3; // consecutive failures → cooldown

    // --------------------------------------------------------
    // Persistence
    // --------------------------------------------------------

    function todayKey() {
        try { return new Date().toISOString().slice(0, 10); }
        catch (_) { return "unknown"; }
    }

    var memStore = null; // in-memory fallback when localStorage is unavailable (e.g. Node tests)

    function load() {
        try {
            if (typeof localStorage === "undefined") {
                if (!memStore) memStore = {};
                return memStore;
            }
            var raw = localStorage.getItem(STORE_KEY);
            var data = raw ? JSON.parse(raw) : {};
            var today = todayKey();
            // Reset daily counters if the day changed
            var changed = false;
            Object.keys(SOURCES).forEach(function (k) {
                if (!data[k] || data[k].date !== today) {
                    data[k] = { date: today, used: 0, failures: 0, limitHits: 0, cooldownUntil: null, totalUsed: (data[k] && data[k].totalUsed) || 0, lastSuccessAt: (data[k] && data[k].lastSuccessAt) || null, lastFailureAt: (data[k] && data[k].lastFailureAt) || null };
                    changed = true;
                }
            });
            if (changed) persist(data);
            return data;
        } catch (_) {
            return {};
        }
    }

    function persist(data) {
        try {
            if (typeof localStorage === "undefined") {
                memStore = data;
                return data;
            }
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
        } catch (_) {}
        return data;
    }

    // --------------------------------------------------------
    // Per-source state
    // --------------------------------------------------------

    function getState(source) {
        var data = load();
        if (!data[source]) {
            data[source] = { date: todayKey(), used: 0, failures: 0, limitHits: 0, cooldownUntil: null, totalUsed: 0, lastSuccessAt: null, lastFailureAt: null };
            persist(data);
        }
        return data[source];
    }

    function setState(source, patch) {
        var data = load();
        data[source] = Object.assign({}, data[source], patch);
        persist(data);
        return data[source];
    }

    // --------------------------------------------------------
    // Recording events
    // --------------------------------------------------------

    /**
     * A search on this source completed (success or not — counts toward quota).
     */
    function recordUse(source) {
        if (!SOURCES[source]) return false;
        var s = getState(source);
        setState(source, {
            used: (s.used || 0) + 1,
            failures: 0, // reset consecutive-failure streak on success
            totalUsed: (s.totalUsed || 0) + 1,
            lastSuccessAt: new Date().toISOString() // source health
        });
        return true;
    }

    /**
     * A search on this source failed (network/parse error).
     * FAILURE_THRESHOLD consecutive failures → cooldown.
     */
    function recordFailure(source) {
        if (!SOURCES[source]) return false;
        var s = getState(source);
        var failures = (s.failures || 0) + 1;
        var patch = { failures: failures, lastFailureAt: new Date().toISOString() };
        if (failures >= FAILURE_THRESHOLD) {
            patch.cooldownUntil = Date.now() + SOURCES[source].cooldownMin * 60000;
            patch.failures = 0;
        }
        setState(source, patch);
        return true;
    }

    /**
     * The source reported its limit (HTTP 429 / quota exhausted).
     * → immediate cooldown for the rest of the day OR cooldown minutes,
     *   whichever the caller indicates.
     */
    function recordLimit(source, restOfDay) {
        if (!SOURCES[source]) return false;
        var s = getState(source);
        var cooldownUntil = restOfDay
            ? new Date(new Date().setHours(23, 59, 59, 999)).getTime()
            : Date.now() + SOURCES[source].cooldownMin * 60000;
        setState(source, {
            limitHits: (s.limitHits || 0) + 1,
            cooldownUntil: cooldownUntil,
            failures: 0
        });
        return true;
    }

    /**
     * Manual cooldown (e.g. admin wants to pause a source).
     */
    function setCooldown(source, minutes) {
        if (!SOURCES[source]) return false;
        setState(source, { cooldownUntil: Date.now() + (Number(minutes) || 15) * 60000 });
        return true;
    }

    // --------------------------------------------------------
    // Availability
    // --------------------------------------------------------

    function hasKeyFor(source) {
        if (!SOURCES[source] || !SOURCES[source].needsKey) return true;
        try {
            if (typeof localStorage === "undefined") return false;
            if (source === "google") {
                return !!(localStorage.getItem("jarvis_google_cse_key") || localStorage.getItem("jarvis_search_api_key"));
            }
            if (source === "external_api") {
                return !!localStorage.getItem("jarvis_search_api_key");
            }
        } catch (_) {}
        return false;
    }

    /**
     * Is this source usable RIGHT NOW?
     * (within daily quota + not in cooldown + has key if required)
     */
    function isAvailable(source) {
        if (!SOURCES[source]) return false;
        var def = SOURCES[source];
        var s = getState(source);
        // daily limit
        if ((s.used || 0) >= def.dailyLimit) return false;
        // cooldown
        if (s.cooldownUntil && Date.now() < new Date(s.cooldownUntil).getTime()) return false;
        // key
        if (def.needsKey && !hasKeyFor(source)) return false;
        return true;
    }

    /**
     * Why is this source unavailable? (for the debug report)
     */
    function unavailabilityReason(source) {
        if (!SOURCES[source]) return "unknown_source";
        var def = SOURCES[source];
        var s = getState(source);
        if ((s.used || 0) >= def.dailyLimit) return "daily_limit_reached";
        if (s.cooldownUntil && Date.now() < new Date(s.cooldownUntil).getTime()) return "cooldown";
        if (def.needsKey && !hasKeyFor(source)) return "no_api_key";
        return null;
    }

    /**
     * The ordered list of currently-available sources.
     */
    function getChain(preferredOrder) {
        var list = Object.keys(SOURCES).filter(function (k) { return isAvailable(k); });
        if (preferredOrder && preferredOrder.length) {
            // Domain routing: keep only known sources, in the caller's
            // preferred order; any source NOT in the preferred list goes
            // to the end (by default priority) as a safety net.
            var rank = {};
            preferredOrder.forEach(function (s, i) { rank[s] = i; });
            list.sort(function (a, b) {
                var ra = rank.hasOwnProperty(a) ? rank[a] : 100 + SOURCES[a].priority;
                var rb = rank.hasOwnProperty(b) ? rank[b] : 100 + SOURCES[b].priority;
                return ra - rb;
            });
            return list;
        }
        return list.sort(function (a, b) { return SOURCES[a].priority - SOURCES[b].priority; });
    }

    /**
     * Full priority list with availability flags (for the debug UI).
     */
    function getUsageReport() {
        return Object.keys(SOURCES).map(function (k) {
            var s = getState(k);
            return {
                source: k,
                label: SOURCES[k].label,
                priority: SOURCES[k].priority,
                dailyLimit: SOURCES[k].dailyLimit,
                used: s.used || 0,
                remaining: Math.max(0, SOURCES[k].dailyLimit - (s.used || 0)),
                totalUsed: s.totalUsed || 0,
                limitHits: s.limitHits || 0,
                lastSuccessAt: s.lastSuccessAt || null,
                lastFailureAt: s.lastFailureAt || null,
                cooldownUntil: s.cooldownUntil,
                available: isAvailable(k),
                reason: unavailabilityReason(k)
            };
        }).sort(function (a, b) { return a.priority - b.priority; });
    }

    /**
     * Which source ACTUALLY served the last research? The chain
     * asks each searcher in priority order and stops at the first
     * that returns usable results.
     */
    function withTimeout(promise, ms, source) {
        if (!ms || typeof Promise.race !== "function") return promise;
        var timer = null;
        var timeoutPromise = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                reject(new Error("source_timeout:" + source + ":" + ms + "ms"));
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(function () {
            if (timer) clearTimeout(timer);
        });
    }

    function searchWithFallback(topic, searchers, options) {
        options = options || {};
        var chain = getChain(options.preferredOrder);
        var SOURCE_TIMEOUT_MS = Number(options.sourceTimeoutMs) || 0;
        var attempts = [];
        var tried = [];

        function tryNext(i) {
            if (i >= chain.length) {
                return Promise.resolve({
                    success: false,
                    topic: topic,
                    sourcesTried: tried,
                    attempts: attempts,
                    results: [],
                    reason: "all_sources_exhausted",
                    chainSnapshot: getUsageReport()
                });
            }
            var source = chain[i];
            var searcher = searchers && searchers[source];
            if (typeof searcher !== "function") {
                attempts.push({ source: source, skipped: true, reason: "no_searcher" });
                return tryNext(i + 1);
            }
            tried.push(source);
            return Promise.resolve()
                .then(function () { return withTimeout(searcher(topic), SOURCE_TIMEOUT_MS, source); })
                .then(function (result) {
                    recordUse(source);
                    var hasResults = result && result.success && Array.isArray(result.results) && result.results.length > 0;
                    attempts.push({ source: source, ok: !!hasResults, resultCount: hasResults ? result.results.length : 0, rateLimited: result && result.rateLimited });
                    if (result && result.rateLimited) recordLimit(source, result.restOfDay);
                    if (hasResults) {
                        // Tag every result with the source that served it
                        result.results.forEach(function (r) { if (r) r.source = source; });
                        return {
                            success: true,
                            topic: topic,
                            servedBy: source,
                            sourcesTried: tried,
                            attempts: attempts,
                            results: result.results,
                            chainSnapshot: getUsageReport()
                        };
                    }
                    // No results → fail over to the next source in the chain
                    return tryNext(i + 1);
                })
                .catch(function (err) {
                    recordFailure(source);
                    attempts.push({ source: source, ok: false, error: String((err && err.message) || err) });
                    return tryNext(i + 1);
                });
        }

        return tryNext(0);
    }

    // --------------------------------------------------------
    // Reset / config
    // --------------------------------------------------------

    function resetAll() {
        memStore = null;
        try {
            if (typeof localStorage !== "undefined") localStorage.removeItem(STORE_KEY);
        } catch (_) {}
    }

    function setDailyLimit(source, limit) {
        if (!SOURCES[source]) return false;
        SOURCES[source].dailyLimit = Math.max(1, Number(limit) || SOURCES[source].dailyLimit);
        return true;
    }

    function getSources() {
        return JSON.parse(JSON.stringify(SOURCES));
    }

    return {
        recordUse: recordUse,
        recordFailure: recordFailure,
        recordLimit: recordLimit,
        setCooldown: setCooldown,
        isAvailable: isAvailable,
        unavailabilityReason: unavailabilityReason,
        getChain: getChain,
        getUsageReport: getUsageReport,
        searchWithFallback: searchWithFallback,
        resetAll: resetAll,
        setDailyLimit: setDailyLimit,
        getSources: getSources,
        hasKeyFor: hasKeyFor
    };
})();

if (typeof window !== "undefined") window.JARVISKnowledgeSourceChain = KnowledgeSourceChain;
if (typeof module !== "undefined" && module.exports) module.exports = KnowledgeSourceChain;
