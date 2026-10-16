"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — LEARNING SCHEDULER
 * renderer/js/learning/learningScheduler.js
 * ============================================================
 *
 * Background learning scheduler.
 *
 * Schedules:
 *   manual  — only when user triggers
 *   daily   — once per 24 hours
 *   weekly  — once per 7 days
 *
 * Controls (from config):
 *   maxSearchesPerCycle, maxItemsPerCycle,
 *   allowedDomains, blockedDomains, requireVerification,
 *   requireUserApproval
 *
 * SAFETY:
 *   - Never runs if learning is disabled or permission is DENIED
 *   - Rate-limited to avoid hammering APIs
 *   - Silent mode (no TTS announcements) unless idle
 *   - Never blocks the main app (all async, catch-all)
 * ============================================================
 */

(function () {

    const LAST_RUN_KEY = "jarvis_learning_last_cycle";
    const CYCLE_HISTORY_KEY = "jarvis_learning_cycle_history";
    const DAY_MS = 24 * 60 * 60 * 1000;

    let timer = null;
    let running = false;

    // ============================================================
    // CYCLE HISTORY
    // ============================================================

    function getCycleHistory() {
        try {
            return JSON.parse(localStorage.getItem(CYCLE_HISTORY_KEY) || "[]");
        } catch (_) {
            return [];
        }
    }

    function addCycleRecord(record) {
        const history = getCycleHistory();
        history.push({ timestamp: new Date().toISOString(), ...record });
        try {
            localStorage.setItem(CYCLE_HISTORY_KEY, JSON.stringify(history.slice(-50)));
        } catch (_) {}
    }

    function getLastRun() {
        try {
            const v = localStorage.getItem(LAST_RUN_KEY);
            return v ? new Date(v) : null;
        } catch (_) {
            return null;
        }
    }

    function setLastRun() {
        try {
            localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
        } catch (_) {}
    }

    // ============================================================
    // SCHEDULE CHECK — is it time to run?
    // ============================================================

    function isDue(schedule) {
        if (schedule === "manual") return false;
        const last = getLastRun();
        if (!last) return true; // never run — due

        const elapsed = Date.now() - last.getTime();
        if (schedule === "daily") return elapsed >= DAY_MS;
        if (schedule === "weekly") return elapsed >= 7 * DAY_MS;
        return false;
    }

    // ============================================================
    // RUN CYCLE
    // ============================================================

    /**
     * Run one learning cycle:
     *   1. Check enabled + permission
     *   2. Check internet
     *   3. For each autoLearnTopic (or outdated knowledge topic):
     *      research → verify → store
     *   4. Clean expired knowledge
     *   5. Record cycle
     *
     * All wrapped in try-catch — never crashes the app.
     */
    async function runCycle(opts = {}) {
        if (running) {
            return { success: false, reason: "already_running" };
        }

        const manager = window.JARVISLearningManager;
        if (!manager) return { success: false, reason: "manager_not_loaded" };

        const config = manager.getConfig();

        if (!config.enabled && !opts.force) {
            return { success: false, reason: "learning_disabled" };
        }

        const perm = window.JARVISLearningPermission?.getState();
        if (perm === "DENIED") {
            return { success: false, reason: "permission_denied" };
        }

        running = true;
        const cycleStart = Date.now();

        try {
            // Check internet
            const online = window.JARVISWebResearcher ? await window.JARVISWebResearcher.isOnline() : false;
            if (!online) {
                addCycleRecord({ success: false, reason: "offline", topics: 0, stored: 0 });
                return { success: false, reason: "offline" };
            }

            // Determine topics to research
            let topics = [...(config.autoLearnTopics || [])];

            // Add topics from outdated knowledge (expired or near-expiry)
            if (window.JARVISKnowledgeStore) {
                const stats = window.JARVISKnowledgeStore.stats();
                // Refresh recently expired topics (re-research)
                // The store cleans expired automatically; we re-research
                // topics that were most recently learned and verified
                // (these are most likely still relevant)
                // (handled via autoLearnTopics + learnNow)
            }

            // Default topics if none configured (only in AUTO_LEARN mode)
            if (!topics.length && perm === "AUTO_LEARN") {
                topics = [
                    "latest technology news",
                    "programming best practices",
                ];
            }

            if (!topics.length) {
                addCycleRecord({ success: true, topics: 0, stored: 0, reason: "no_topics" });
                return { success: true, topics: 0, stored: 0, reason: "no_topics" };
            }

            // Limit topics per cycle
            topics = topics.slice(0, config.maxSearchesPerCycle);

            let totalStored = 0;
            let totalSearches = 0;
            let failures = 0;

            for (const topic of topics) {
                try {
                    const result = await manager.researchTopic(topic, {
                        silent: true, // scheduler is silent — no TTS spam
                    });
                    totalSearches += (result.searchCount || 0);
                    totalStored += (result.stored || 0);
                    if (!result.success) failures++;
                } catch (topicError) {
                    console.warn("[LearningScheduler] topic failed:", topic, topicError);
                    failures++;
                }

                // Rate limit — small delay between searches
                await new Promise(r => setTimeout(r, 500));
            }

            // Clean expired knowledge
            if (window.JARVISKnowledgeStore) {
                window.JARVISKnowledgeStore.cleanExpired();
            }

            setLastRun();

            const record = {
                success: failures < topics.length,
                topics: topics.length,
                stored: totalStored,
                searches: totalSearches,
                failures,
                durationMs: Date.now() - cycleStart,
            };
            addCycleRecord(record);

            window.JARVISKnowledgeStore?.log({
                action: "cycle_complete",
                ...record,
            });

            return { success: true, ...record };

        } catch (error) {
            console.error("[LearningScheduler] cycle error:", error);
            addCycleRecord({ success: false, reason: "error", error: String(error) });
            return { success: false, reason: "error", error: String(error) };
        } finally {
            running = false;
        }
    }

    // ============================================================
    // SCHEDULER LOOP — check every 30 minutes if due
    // ============================================================

    function start() {
        stop();
        const CHECK_INTERVAL = 30 * 60 * 1000; // 30 min

        const tick = async () => {
            try {
                const config = window.JARVISLearningManager?.getConfig();
                if (!config) return;
                if (!config.enabled) return;
                if (isDue(config.schedule)) {
                    console.log("[LearningScheduler] cycle due — running");
                    await runCycle();
                }
            } catch (_) {}
        };

        // Initial check after 30s (let the app boot first)
        setTimeout(tick, 30000);
        // Then every 30 min
        timer = setInterval(tick, CHECK_INTERVAL);
        console.log("[LearningScheduler] started (checking every 30 min)");
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
            console.log("[LearningScheduler] stopped");
        }
    }

    function isRunning() {
        return running;
    }

    function getStatus() {
        const config = window.JARVISLearningManager?.getConfig() || {};
        const lastRun = getLastRun();
        return {
            active: timer !== null,
            running,
            schedule: config.schedule || "manual",
            enabled: config.enabled !== false,
            lastRun: lastRun ? lastRun.toISOString() : null,
            nextDue: getNextDueTime(config.schedule),
            history: getCycleHistory().slice(-5),
        };
    }

    function getNextDueTime(schedule) {
        const last = getLastRun();
        if (!last) return "now";
        const elapsed = Date.now() - last.getTime();
        if (schedule === "daily") {
            const remaining = DAY_MS - elapsed;
            return remaining <= 0 ? "now" : `in ${Math.ceil(remaining / (60 * 60 * 1000))}h`;
        }
        if (schedule === "weekly") {
            const remaining = 7 * DAY_MS - elapsed;
            return remaining <= 0 ? "now" : `in ${Math.ceil(remaining / DAY_MS)}d`;
        }
        return "manual";
    }

    // ============================================================
    // EXPORT
    // ============================================================

    window.JARVISLearningScheduler = Object.freeze({
        version: "LS-V1",
        runCycle,
        start,
        stop,
        isRunning,
        isDue,
        getStatus,
        getLastRun,
    });

    // Auto-start on load (harmless — checks enabled + due before doing anything)
    // Guarded for non-browser environments (tests)
    try {
        if (typeof document !== "undefined") {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => setTimeout(start, 5000), { once: true });
            } else if (document.body) {
                // Only auto-start in a REAL browser DOM (readyState complete
                // AND a body element). Test harnesses stub a minimal document
                // without body — they drive the scheduler explicitly.
                setTimeout(start, 5000);
            }
        }
    } catch (_) {}

    console.log("JARVIS Learning Scheduler LS-V1 READY");

})();
