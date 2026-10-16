"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — KNOWLEDGE STORE
 * renderer/js/learning/knowledgeStore.js
 * ============================================================
 *
 * Structured knowledge storage with:
 *   - Provenance (source URL, title, type)
 *   - Confidence scoring (0..1)
 *   - Verification status (verified / unverified / conflicting)
 *   - User approval tracking
 *   - Expiry / freshness management
 *   - Duplicate prevention (topic-based dedup)
 *   - Version history (increment on update, preserve old)
 *
 * Storage: localStorage (consistent with existing knowledgeEngine.js)
 *
 * Each knowledge item:
 * {
 *   id, topic, knowledge, category,
 *   source, sourceType, sourceTitle, sourceUrl,
 *   learnedAt, confidence, verificationStatus,
 *   approvedByUser, tags, version, expiresAt,
 *   sources: [{url, title, confidence, verified}]
 * }
 * ============================================================
 */

(function () {

    const STORAGE_KEY = "jarvis_autonomous_knowledge";
    const LOG_KEY = "jarvis_learning_log";
    const MAX_ITEMS = 2000;
    const MAX_LOG = 500;

    let cache = null;
    let logCache = null;

    // ============================================================
    // LOAD / SAVE
    // ============================================================

    function load() {
        if (cache !== null) return cache;
        try {
            cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch (_) {
            cache = [];
        }
        return cache;
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.error("[KnowledgeStore] save error:", e);
        }
    }

    function loadLog() {
        if (logCache !== null) return logCache;
        try {
            logCache = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
        } catch (_) {
            logCache = [];
        }
        return logCache;
    }

    function saveLog() {
        try {
            if (logCache.length > MAX_LOG) {
                logCache = logCache.slice(-MAX_LOG);
            }
            localStorage.setItem(LOG_KEY, JSON.stringify(logCache));
        } catch (_) {}
    }

    // ============================================================
    // ID GENERATION
    // ============================================================

    function genId() {
        return "k_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    // ============================================================
    // NORMALIZE TOPIC (for dedup comparison)
    // ============================================================

    function normalizeTopic(topic) {
        return String(topic || "")
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    // ============================================================
    // FIND EXISTING (by topic similarity)
    // ============================================================

    function findExisting(topic) {
        const norm = normalizeTopic(topic);
        if (!norm) return null;
        const items = load();
        // Exact normalized match
        for (const item of items) {
            if (normalizeTopic(item.topic) === norm) return item;
        }
        // Substring match (topic is contained or contains)
        for (const item of items) {
            const it = normalizeTopic(item.topic);
            if (it && (it.includes(norm) || norm.includes(it)) && norm.length > 3) {
                return item;
            }
        }
        return null;
    }

    // ============================================================
    // ADD / STORE KNOWLEDGE
    // ============================================================

    function add(entry) {
        const items = load();
        const existing = findExisting(entry.topic);

        if (existing) {
            // UPDATE existing — only if newer/better
            const newConfidence = entry.confidence || 0.5;
            const shouldUpdate = (
                newConfidence > (existing.confidence || 0) ||
                entry.verificationStatus === "verified" && existing.verificationStatus !== "verified" ||
                entry._forceUpdate === true
            );

            if (!shouldUpdate) {
                // Just add source to history
                if (entry.sourceUrl) {
                    existing.sources = existing.sources || [];
                    if (!existing.sources.some(s => s.url === entry.sourceUrl)) {
                        existing.sources.push({
                            url: entry.sourceUrl,
                            title: entry.sourceTitle || "",
                            confidence: newConfidence,
                            verified: entry.verificationStatus === "verified",
                        });
                    }
                }
                save();
                return { action: "source_added", item: existing };
            }

            // Preserve old version
            existing.previousVersions = existing.previousVersions || [];
            existing.previousVersions.push({
                knowledge: existing.knowledge,
                confidence: existing.confidence,
                learnedAt: existing.learnedAt,
                version: existing.version,
            });

            existing.knowledge = entry.knowledge;
            existing.confidence = newConfidence;
            existing.verificationStatus = entry.verificationStatus || existing.verificationStatus;
            existing.approvedByUser = entry.approvedByUser !== undefined ? entry.approvedByUser : existing.approvedByUser;
            existing.learnedAt = new Date().toISOString();
            existing.updatedAt = new Date().toISOString(); // evidence: last refresh
            existing.version = (existing.version || 1) + 1;
            existing.source = entry.source || existing.source;
            existing.sourceUrl = entry.sourceUrl || existing.sourceUrl;
            existing.sourceTitle = entry.sourceTitle || existing.sourceTitle;
            existing.expiresAt = entry.expiresAt || existing.expiresAt;
            existing.tags = [...new Set([...(existing.tags || []), ...(entry.tags || [])])];

            // Add source to history
            if (entry.sourceUrl) {
                existing.sources = existing.sources || [];
                if (!existing.sources.some(s => s.url === entry.sourceUrl)) {
                    existing.sources.push({
                        url: entry.sourceUrl,
                        title: entry.sourceTitle || "",
                        confidence: newConfidence,
                        verified: entry.verificationStatus === "verified",
                    });
                }
            }

            save();
            return { action: "updated", item: existing };
        }

        // NEW entry
        const item = {
            id: genId(),
            topic: entry.topic,
            knowledge: entry.knowledge,
            category: entry.category || "general",
            source: entry.source || "web",
            sourceType: entry.sourceType || "web",
            sourceTitle: entry.sourceTitle || "",
            sourceUrl: entry.sourceUrl || "",
            learnedAt: new Date().toISOString(),
            retrievedAt: entry.retrievedAt || new Date().toISOString(), // evidence: when fetched from source
            updatedAt: new Date().toISOString(), // evidence: when last refreshed locally
            freshness: entry.freshness || null, // domain TTL context (see domainRouter)
            conflictStatus: entry.conflictStatus || "none", // none | conflicting
            confidence: entry.confidence || 0.5,
            verificationStatus: entry.verificationStatus || "unverified",
            approvedByUser: entry.approvedByUser || false,
            tags: entry.tags || [],
            version: 1,
            expiresAt: entry.expiresAt || null,
            sources: entry.sourceUrl ? [{
                url: entry.sourceUrl,
                title: entry.sourceTitle || "",
                confidence: entry.confidence || 0.5,
                verified: entry.verificationStatus === "verified",
            }] : [],
            previousVersions: [],
        };

        items.push(item);

        // Enforce max items
        if (items.length > MAX_ITEMS) {
            // Remove oldest unverified items first
            items.sort((a, b) => {
                if (a.approvedByUser !== b.approvedByUser) return a.approvedByUser ? 1 : -1;
                return new Date(a.learnedAt) - new Date(b.learnedAt);
            });
            cache = items.slice(-MAX_ITEMS);
        }

        save();
        return { action: "created", item };
    }

    // ============================================================
    // RETRIEVE KNOWLEDGE
    // ============================================================

    function search(query, options = {}) {
        const items = load();
        const norm = normalizeTopic(query);
        if (!norm) return [];

        const limit = options.limit || 5;
        const results = [];

        for (const item of items) {
            const topicNorm = normalizeTopic(item.topic);
            let score = 0;

            // Exact match
            if (topicNorm === norm) score = 1.0;
            // Substring match
            else if (topicNorm.includes(norm) || norm.includes(topicNorm)) score = 0.7;
            // Tag match
            else if (item.tags && item.tags.some(t => normalizeTopic(t).includes(norm))) score = 0.5;
            // Knowledge text contains query
            else if (normalizeTopic(item.knowledge).includes(norm)) score = 0.4;

            if (score > 0) {
                // Boost by confidence
                score *= (0.5 + (item.confidence || 0.5) * 0.5);
                // Penalize expired
                if (item.expiresAt && new Date(item.expiresAt) < new Date()) score *= 0.3;
                // Boost verified
                if (item.verificationStatus === "verified") score *= 1.2;

                results.push({ ...item, _score: Math.min(1.0, score) });
            }
        }

        results.sort((a, b) => b._score - a._score);
        return results.slice(0, limit);
    }

    function getById(id) {
        return load().find(item => item.id === id) || null;
    }

    function getRecent(limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
        return load()
            .filter(item => item && (item.approvedByUser || item.verificationStatus === "verified"))
            .slice()
            .sort((a, b) => new Date(b.updatedAt || b.learnedAt || 0) - new Date(a.updatedAt || a.learnedAt || 0))
            .slice(0, safeLimit)
            .map(item => ({ ...item, tags: Array.isArray(item.tags) ? item.tags.slice() : [] }));
    }

    function remove(id) {
        const items = load();
        const idx = items.findIndex(item => item.id === id);
        if (idx >= 0) {
            const removed = items.splice(idx, 1)[0];
            save();
            return removed;
        }
        return null;
    }

    function clear() {
        cache = [];
        save();
    }

    // ============================================================
    // STATS
    // ============================================================

    function stats() {
        const items = load();
        return {
            total: items.length,
            verified: items.filter(i => i.verificationStatus === "verified").length,
            unverified: items.filter(i => i.verificationStatus === "unverified").length,
            conflicting: items.filter(i => i.verificationStatus === "conflicting").length,
            approved: items.filter(i => i.approvedByUser).length,
            pendingApproval: items.filter(i => !i.approvedByUser && i.verificationStatus !== "verified").length,
            byCategory: items.reduce((acc, i) => {
                acc[i.category || "general"] = (acc[i.category || "general"] || 0) + 1;
                return acc;
            }, {}),
            lastLearnedAt: items.length > 0
                ? items.sort((a, b) => new Date(b.learnedAt) - new Date(a.learnedAt))[0].learnedAt
                : null,
        };
    }

    // ============================================================
    // LEARNING LOG
    // ============================================================

    function log(entry) {
        const log = loadLog();
        log.push({
            timestamp: new Date().toISOString(),
            ...entry,
        });
        saveLog();
    }

    function getLog(limit = 50) {
        const log = loadLog();
        return log.slice(-limit).reverse();
    }

    function clearLog() {
        logCache = [];
        saveLog();
    }

    // ============================================================
    // EXPIRY MANAGEMENT
    // ============================================================

    function cleanExpired() {
        const items = load();
        const now = new Date();
        let removed = 0;
        const kept = items.filter(item => {
            if (item.expiresAt && new Date(item.expiresAt) < now) {
                removed++;
                return false;
            }
            return true;
        });
        if (removed > 0) {
            cache = kept;
            save();
            log({ action: "expired_cleaned", count: removed });
        }
        return removed;
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISKnowledgeStore = Object.freeze({
        version: "KS-V1",
        add,
        search,
        getById,
        getRecent,
        remove,
        clear,
        stats,
        findExisting,
        log,
        getLog,
        clearLog,
        cleanExpired,
        normalizeTopic,
    });

    console.log("JARVIS Knowledge Store KS-V1 READY");

})();
