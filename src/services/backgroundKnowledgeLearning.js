"use strict";

/**
 * JARVIS PRO MAX — Autonomous Background Knowledge Learning
 *
 * Main-process worker. It is deliberately separate from the renderer's
 * legacy BackgroundLearningEngine: this worker performs real network calls,
 * persists structured knowledge through the existing offline-cache store,
 * and emits only facts about work that actually happened.
 */

const crypto = require("crypto");

const DEFAULT_CONFIG = Object.freeze({
    pollingIntervalMs: 120000,
    requestTimeoutMs: 12000,
    retryCount: 1,
    maxRequestsPerCycle: 2,
    maxKnowledgeItemsPerSession: 100,
    topicFreshnessMs: 7 * 24 * 60 * 60 * 1000,
    failureBackoffBaseMs: 60 * 1000,
    failureBackoffMaxMs: 60 * 60 * 1000
});

const TOPICS = [
    { topic: "Artificial Intelligence", category: "Technology" },
    { topic: "Machine Learning", category: "Science" },
    { topic: "JavaScript", category: "Programming" },
    { topic: "Python programming", category: "Programming" },
    { topic: "Computer Science", category: "Education" },
    { topic: "Cybersecurity", category: "Technology" },
    { topic: "Quantum Computing", category: "Science" },
    { topic: "Photosynthesis", category: "Science" },
    { topic: "Human Brain", category: "Science" },
    { topic: "DNA", category: "Science" },
    { topic: "Evolution", category: "Science" },
    { topic: "Solar System", category: "Space" },
    { topic: "Mars", category: "Space" },
    { topic: "Black Hole", category: "Space" },
    { topic: "International Space Station", category: "Space" },
    { topic: "James Webb Space Telescope", category: "Space" },
    { topic: "Taj Mahal", category: "History" },
    { topic: "Mughal Empire", category: "History" },
    { topic: "Indian Independence Movement", category: "History" },
    { topic: "Maurya Empire", category: "History" },
    { topic: "Gupta Empire", category: "History" },
    { topic: "Aryabhata", category: "History" },
    { topic: "Agra", category: "Geography" },
    { topic: "India", category: "Geography" },
    { topic: "Himalayas", category: "Geography" },
    { topic: "Ganges", category: "Geography" },
    { topic: "Kerala", category: "Geography" },
    { topic: "Climate Change", category: "Science" },
    { topic: "Renewable Energy", category: "Science" },
    { topic: "Solar Power", category: "Technology" },
    { topic: "Electric Vehicle", category: "Technology" },
    { topic: "World Wide Web", category: "Technology" },
    { topic: "Blockchain", category: "Technology" },
    { topic: "Robotics", category: "Technology" },
    { topic: "Operating system", category: "Programming" },
    { topic: "Database", category: "Programming" },
    { topic: "Data Structure", category: "Programming" },
    { topic: "Physics", category: "Science" },
    { topic: "Chemistry", category: "Science" },
    { topic: "Mathematics", category: "Education" },
    { topic: "Geography", category: "Geography" },
    { topic: "Ancient India", category: "History" },
    { topic: "Cricket World Cup", category: "Sports" },
    { topic: "Olympic Games", category: "Sports" },
    { topic: "Chess", category: "Games" },
    { topic: "Meditation", category: "Health" },
    { topic: "Yoga", category: "Health" },
    { topic: "Nutrition", category: "Health" },
    { topic: "Photosynthesis", category: "Biology" },
    { topic: "Ecosystem", category: "Biology" },
    { topic: "Indian Cuisine", category: "Culture" },
    { topic: "Bollywood", category: "Culture" },
    { topic: "Indian classical music", category: "Culture" }
];

const EVENTS = Object.freeze({
    LEARNING_STARTED: "LEARNING_STARTED",
    LEARNING_STOPPED: "LEARNING_STOPPED",
    INTERNET_CONNECTED: "INTERNET_CONNECTED",
    INTERNET_DISCONNECTED: "INTERNET_DISCONNECTED",
    SOURCE_SELECTED: "SOURCE_SELECTED",
    FETCH_STARTED: "FETCH_STARTED",
    FETCH_COMPLETED: "FETCH_COMPLETED",
    PROCESSING_STARTED: "PROCESSING_STARTED",
    PROCESSING_COMPLETED: "PROCESSING_COMPLETED",
    DUPLICATE_FOUND: "DUPLICATE_FOUND",
    KNOWLEDGE_VERIFIED: "KNOWLEDGE_VERIFIED",
    KNOWLEDGE_SAVED: "KNOWLEDGE_SAVED",
    KNOWLEDGE_REJECTED: "KNOWLEDGE_REJECTED",
    LEARNING_ERROR: "LEARNING_ERROR",
    LEARNING_IDLE: "LEARNING_IDLE",
    KNOWLEDGE_UPDATED: "KNOWLEDGE_UPDATED",
    RETRY_SCHEDULED: "RETRY_SCHEDULED"
});

function cleanText(value, max = 12000) {
    return String(value == null ? "" : value)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function hashContent(topic, content) {
    return crypto.createHash("sha256")
        .update(`${String(topic).toLowerCase()}\n${String(content).toLowerCase()}`)
        .digest("hex");
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

function safeUrl(url) {
    return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

class BackgroundKnowledgeLearning {
    constructor({ offlineCache, wikipediaService, dataSourcesService, emit, config = {} } = {}) {
        if (!offlineCache) throw new Error("offlineCache is required.");
        if (!wikipediaService) throw new Error("wikipediaService is required.");
        if (!dataSourcesService) throw new Error("dataSourcesService is required.");

        this.offlineCache = offlineCache;
        this.wikipedia = wikipediaService;
        this.dataSources = dataSourcesService;
        this.emit = typeof emit === "function" ? emit : () => {};
        this.config = { ...DEFAULT_CONFIG, ...config };

        this.running = false;
        this.enabled = this._loadPreference();
        this.timer = null;
        this.cyclePromise = null;
        this.sessionItems = 0;
        this.sequence = 0;
        this.lastOnline = null;
        this.lastError = null;
        this.lastSuccessfulCollection = null;
        this.lastCollectedTopic = null;
        this.nextScheduledAt = null;
        this.topicState = new Map();
        this.sourceState = new Map();
        this.current = {
            activity: "Idle",
            source: null,
            sourceUrl: null,
            topic: null,
            action: "Waiting",
            processingStatus: "IDLE",
            storageStatus: "Not active"
        };
        this.stats = {
            cycles: 0,
            successfulFetches: 0,
            failedFetches: 0,
            saved: 0,
            updated: 0,
            duplicates: 0,
            rejected: 0
        };
    }

    _loadPreference() {
        try {
            const stored = this.offlineCache.getText("__background_learning_preference__");
            return stored?.value?.enabled === true;
        } catch (_) {
            return false;
        }
    }

    _persistPreference(enabled) {
        try {
            this.offlineCache.setText("__background_learning_preference__", { enabled: !!enabled }, {
                type: "setting",
                title: "Background learning preference"
            });
        } catch (_) {}
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this._persistPreference(this.enabled);
        if (!this.enabled) {
            this.stop(false);
        }
        return this.getStatus();
    }

    restorePreference() {
        this.enabled = this._loadPreference();
        return this.getStatus();
    }

    configure(config = {}) {
        this.config = { ...this.config, ...config };
        if (this.running) {
            this._scheduleNext(true);
        }
        return this.getStatus();
    }

    start(options = {}) {
        const persist = options.persist !== false;
        this.enabled = true;
        if (persist) this._persistPreference(true);
        if (this.running) return this.getStatus();

        this.running = true;
        this.sessionItems = 0;
        this.lastError = null;
        this._event(EVENTS.LEARNING_STARTED, {
            message: "Learning Engine started"
        });
        this._setCurrent({
            activity: "Starting",
            action: "Checking internet",
            processingStatus: "STARTING"
        });

        // Fire-and-forget: UI/voice/chat are never blocked by the worker.
        this._runCycle().catch((error) => this._handleError(error, "startup-cycle"));
        return this.getStatus();
    }

    stop(persist = true) {
        if (persist) {
            this.enabled = false;
            this._persistPreference(false);
        }
        if (!this.running) return this.getStatus();

        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.nextScheduledAt = null;

        this._setCurrent({
            activity: "Idle",
            action: "Stopped",
            processingStatus: "OFF",
            storageStatus: "Local knowledge available"
        });
        this._event(EVENTS.LEARNING_STOPPED, {
            message: "Learning Engine stopped"
        });
        return this.getStatus();
    }

    async shutdown() {
        this.running = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.nextScheduledAt = null;
        if (this.cyclePromise) {
            try { await this.cyclePromise; } catch (_) {}
        }
    }

    getStatus() {
        return {
            success: true,
            enabled: this.enabled,
            running: this.running,
            internet: this.lastOnline,
            current: { ...this.current },
            stats: { ...this.stats },
            sessionItems: this.sessionItems,
            config: { ...this.config },
            lastError: this.lastError,
            lastSuccessfulCollection: this.lastSuccessfulCollection,
            lastCollectedTopic: this.lastCollectedTopic,
            nextScheduledTask: this.nextScheduledAt ? new Date(this.nextScheduledAt).toISOString() : null,
            sourceHealth: Object.fromEntries([...this.sourceState.entries()].map(([source, state]) => [source, { ...state }])),
            topicHealth: Object.fromEntries([...this.topicState.entries()].map(([topic, state]) => [topic, { ...state }]))
        };
    }

    async getDashboard() {
        let storage = {};
        try {
            storage = this.offlineCache.knowledgeStats();
        } catch (_) {}
        return {
            ...this.getStatus(),
            storage,
            recent: this.offlineCache.recentKnowledge(12)
        };
    }

    async cycleNow() {
        if (!this.running) {
            return { success: false, error: "Learning Engine is OFF." };
        }
        await this._runCycle();
        return this.getStatus();
    }

    _event(type, payload = {}) {
        const event = {
            id: `${Date.now()}-${++this.sequence}`,
            type,
            timestamp: new Date().toISOString(),
            ...payload
        };
        try { this.emit(event); } catch (_) {}
    }

    _setCurrent(patch = {}) {
        this.current = { ...this.current, ...patch };
        this._event("STATE_CHANGED", { current: { ...this.current } });
    }

    _scheduleNext(immediate = false) {
        if (!this.running) return;
        if (this.timer) clearTimeout(this.timer);

        let delay = immediate ? 0 : Math.max(5000, Number(this.config.pollingIntervalMs) || DEFAULT_CONFIG.pollingIntervalMs);
        if (!immediate) {
            const nextTopicAt = this._nextTopicDueAt();
            if (Number.isFinite(nextTopicAt)) {
                delay = Math.max(5000, Math.min(delay, nextTopicAt - Date.now()));
            }
        }

        this.nextScheduledAt = Date.now() + delay;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.nextScheduledAt = null;
            this._runCycle().catch((error) => this._handleError(error, "scheduled-cycle"));
        }, delay);
    }

    _nextTopicDueAt() {
        const now = Date.now();
        let earliest = Infinity;
        for (const topic of TOPICS) {
            const state = this.topicState.get(topic.topic.toLowerCase());
            const source = this._sourceFor(topic);
            const sourceState = this.sourceState.get(String(source.name).toLowerCase());
            const learned = this._lastLearnedAt(topic.topic);
            const freshnessDue = learned ? learned + Number(this.config.topicFreshnessMs) : now;
            const eligible = Math.max(freshnessDue, state?.nextEligibleAt || 0, sourceState?.nextEligibleAt || 0);
            if (eligible < earliest) earliest = eligible;
        }
        return earliest;
    }

    _lastLearnedAt(topicName) {
        try {
            const rows = this.offlineCache.recentKnowledge(1000);
            const row = rows.find(item => String(item.topic || "").toLowerCase() === String(topicName).toLowerCase());
            return row ? (Date.parse(row.timestamp || row.savedAt || "") || 0) : 0;
        } catch (_) {
            return 0;
        }
    }

    async _runCycle() {
        if (!this.running || this.cyclePromise) return;
        this.cyclePromise = this._cycle();
        try {
            await this.cyclePromise;
        } finally {
            this.cyclePromise = null;
            if (this.running) this._scheduleNext(false);
        }
    }

    async _cycle() {
        this.stats.cycles++;

        let online = false;
        try {
            online = await this.offlineCache.isOnline();
        } catch (_) {
            online = false;
        }

        if (online !== this.lastOnline) {
            const wasOffline = this.lastOnline === false;
            this.lastOnline = online;
            this._event(online ? EVENTS.INTERNET_CONNECTED : EVENTS.INTERNET_DISCONNECTED, {
                message: online
                    ? (wasOffline ? "Internet connection restored; resuming background learning" : "Internet connection verified")
                    : "Internet unavailable; background learning paused"
            });
        }

        if (!online) {
            this._setCurrent({
                activity: "Paused",
                source: null,
                sourceUrl: null,
                topic: null,
                action: "Offline",
                processingStatus: "PAUSED",
                storageStatus: "Local knowledge available"
            });
            this._event(EVENTS.LEARNING_IDLE, { reason: "offline" });
            return;
        }

        if (this.sessionItems >= Number(this.config.maxKnowledgeItemsPerSession)) {
            this._setCurrent({
                activity: "Session limit reached",
                action: "Waiting",
                processingStatus: "IDLE",
                storageStatus: "Session limit reached"
            });
            this._event(EVENTS.LEARNING_IDLE, { reason: "session-limit" });
            return;
        }

        const topic = this._selectTopic();
        if (!topic) {
            this._event(EVENTS.LEARNING_IDLE, { reason: "no-topic-available" });
            return;
        }

        await this._learnTopic(topic);
    }

    _selectTopic() {
        const now = Date.now();
        const freshness = Math.max(0, Number(this.config.topicFreshnessMs) || DEFAULT_CONFIG.topicFreshnessMs);
        const candidates = TOPICS.map(topic => {
            const key = topic.topic.toLowerCase();
            const state = this.topicState.get(key) || {};
            const source = this._sourceFor(topic);
            const sourceState = this.sourceState.get(String(source.name).toLowerCase()) || {};
            const learnedAt = this._lastLearnedAt(topic.topic);
            const dueAt = learnedAt ? learnedAt + freshness : 0;
            return { topic, key, state, sourceState, learnedAt, dueAt };
        }).filter(item => {
            if ((item.state.nextEligibleAt || 0) > now) return false;
            if ((item.sourceState.nextEligibleAt || 0) > now) return false;
            return !item.learnedAt || item.dueAt <= now;
        });

        if (!candidates.length) return null;

        // Prefer never-collected topics, then the stalest topic. A source
        // with recent failures is excluded by its topic/source cooldown.
        candidates.sort((a, b) => {
            if (!a.learnedAt && b.learnedAt) return -1;
            if (a.learnedAt && !b.learnedAt) return 1;
            return (a.learnedAt || 0) - (b.learnedAt || 0);
        });
        return candidates[0]?.topic || null;
    }

    _sourceFor(topic) {
        // Explicit allowlist only. No arbitrary URL crawling.

        // Research/ML topics → OpenAlex academic papers
        if (topic.category === "Science" && /research|machine learning|climate/i.test(topic.topic)) {
            return {
                name: "OpenAlex",
                fetch: () => this.dataSources.researchPaperSearch(topic.topic, 3),
                normalize: (data) => {
                    const papers = Array.isArray(data?.papers) ? data.papers : [];
                    const content = papers
                        .map(p => `${cleanText(p.title, 300)}${p.year ? ` (${p.year})` : ""}${p.citedBy != null ? ` — citations: ${p.citedBy}` : ""}`)
                        .filter(Boolean)
                        .join("\n");
                    return {
                        title: topic.topic,
                        content,
                        sourceUrl: papers[0]?.url || "https://openalex.org/",
                        metadata: { resultCount: papers.length, category: topic.category }
                    };
                }
            };
        }

        // Indian/Historical/Cultural topics → try Hindi Wikipedia first,
        // fall back to English Wikipedia
        if (/indian|taj|mughal|maurya|gupta|aryabhata|agra|india|himalaya|ganges|kerala|bollywood|cricket|yoga|meditation|cuisine|ancient india|independence/i.test(topic.topic)) {
            const wikiSummary = this.wikipedia;
            return {
                name: "Wikipedia Hindi+English",
                fetch: async () => {
                    // Try Hindi first for Indian topics
                    try {
                        const hindiResult = await wikiSummary.summary(topic.topic, "hi");
                        if (hindiResult && hindiResult.extract) {
                            return hindiResult;
                        }
                    } catch (_) {
                        // Hindi failed, fall through to English
                    }
                    return wikiSummary.summary(topic.topic, "en");
                },
                normalize: (data) => ({
                    title: cleanText(data?.title || topic.topic, 300),
                    content: cleanText(data?.extract, 12000),
                    sourceUrl: safeUrl(data?.url),
                    metadata: {
                        category: topic.category,
                        language: data?.lang || "en",
                        cachedResponse: !!data?.fromCache
                    }
                })
            };
        }

        // Default → English Wikipedia
        return {
            name: "Wikipedia API",
            fetch: () => this.wikipedia.summary(topic.topic, "en"),
            normalize: (data) => ({
                title: cleanText(data?.title || topic.topic, 300),
                content: cleanText(data?.extract, 12000),
                sourceUrl: safeUrl(data?.url),
                metadata: {
                    category: topic.category,
                    language: data?.lang || "en",
                    cachedResponse: !!data?.fromCache
                }
            })
        };
    }

    async _learnTopic(topic) {
        const source = this._sourceFor(topic);
        this._setCurrent({
            activity: "Selecting source",
            source: source.name,
            sourceUrl: null,
            topic: topic.topic,
            action: "Selecting",
            processingStatus: "SOURCE_SELECTION",
            storageStatus: "Waiting"
        });
        this._event(EVENTS.SOURCE_SELECTED, {
            source: source.name,
            topic: topic.topic
        });

        let result = null;
        let lastError = null;
        const attempts = Math.max(1, Number(this.config.retryCount) + 1);

        for (let attempt = 1; attempt <= attempts; attempt++) {
            if (!this.running) return;

            this._setCurrent({
                activity: "Fetching knowledge",
                action: `Fetching (attempt ${attempt}/${attempts})`,
                processingStatus: "FETCHING"
            });
            this._event(EVENTS.FETCH_STARTED, {
                source: source.name,
                topic: topic.topic,
                attempt
            });

            try {
                result = await withTimeout(
                    source.fetch(),
                    Number(this.config.requestTimeoutMs) || DEFAULT_CONFIG.requestTimeoutMs,
                    source.name
                );
                if (result && result.success !== false) break;
                lastError = new Error(result?.error || "Source returned no usable result.");
            } catch (error) {
                lastError = error;
            }
        }

        if (!result || result.success === false) {
            this.stats.failedFetches++;
            this.lastError = lastError?.message || "Unknown source error";
            this._recordFailure(topic.topic, source.name, this.lastError);
            this._setCurrent({
                activity: "Fetch failed",
                action: "Not stored",
                processingStatus: "ERROR",
                storageStatus: "Failed — Not Saved"
            });
            this._event(EVENTS.LEARNING_ERROR, {
                source: source.name,
                topic: topic.topic,
                message: this.lastError
            });
            return;
        }

        this.stats.successfulFetches++;
        this.lastSuccessfulCollection = new Date().toISOString();
        this.lastCollectedTopic = topic.topic;
        this._recordSuccess(topic.topic, source.name);
        this._event(EVENTS.FETCH_COMPLETED, {
            source: source.name,
            topic: topic.topic
        });

        this._setCurrent({
            activity: "Processing knowledge",
            action: "Cleaning → Normalizing",
            processingStatus: "PROCESSING"
        });
        this._event(EVENTS.PROCESSING_STARTED, {
            source: source.name,
            topic: topic.topic
        });

        const normalized = source.normalize(result);
        const content = cleanText(normalized.content, 12000);

        if (!content) {
            this.stats.rejected++;
            this._setCurrent({
                activity: "Knowledge rejected",
                action: "No usable content",
                processingStatus: "REJECTED",
                storageStatus: "Rejected — Low Quality"
            });
            this._event(EVENTS.KNOWLEDGE_REJECTED, {
                source: source.name,
                topic: topic.topic,
                reason: "No usable content returned by source."
            });
            return;
        }

        const record = {
            id: hashContent(topic.topic, content),
            topic: topic.topic,
            category: topic.category,
            content,
            source: source.name,
            sourceUrl: safeUrl(normalized.sourceUrl),
            timestamp: new Date().toISOString(),
            verified: false,
            confidence: 0.75,
            metadata: normalized.metadata || {}
        };

        this._event(EVENTS.PROCESSING_COMPLETED, {
            source: source.name,
            topic: topic.topic,
            contentLength: content.length
        });

        // Duplicate/update handling is delegated to the existing local
        // knowledge store. Same topic/source + identical content is a
        // duplicate; changed content updates the existing record in place.
        const existing = this.offlineCache.findKnowledge(topic.topic, "", "", source.name);
        if (existing && String(existing.content || "").trim() === content.trim()) {
            this.stats.duplicates++;
            this._setCurrent({
                activity: "Duplicate found",
                action: "Not stored",
                processingStatus: "DUPLICATE",
                storageStatus: "Duplicate — Not Saved"
            });
            this._event(EVENTS.DUPLICATE_FOUND, {
                source: source.name,
                topic: topic.topic
            });
            return;
        }

        // Cross-check only where a second existing trusted source can
        // answer the same stable topic. No claim of verification is made
        // if the second source fails.
        let verification = null;
        if (source.name === "Wikipedia API" && Number(this.config.maxRequestsPerCycle) >= 2) {
            this._setCurrent({
                activity: "Verifying knowledge",
                action: "Cross-checking Wikidata",
                processingStatus: "VERIFYING"
            });
            try {
                verification = await withTimeout(
                    this.dataSources.wikidataSearch(topic.topic, "en"),
                    Number(this.config.requestTimeoutMs) || DEFAULT_CONFIG.requestTimeoutMs,
                    "Wikidata verification"
                );
            } catch (_) {
                verification = null;
            }
        }

        if (verification?.success) {
            record.verified = true;
            record.confidence = 0.9;
            record.metadata.verificationSource = "Wikidata";
            record.metadata.verificationUrl = safeUrl(verification.url);
            this._event(EVENTS.KNOWLEDGE_VERIFIED, {
                source: source.name,
                verificationSource: "Wikidata",
                topic: topic.topic,
                confidence: record.confidence
            });
        }

        this._setCurrent({
            activity: "Saving knowledge",
            action: "Storing locally",
            processingStatus: "STORING",
            storageStatus: "Saving..."
        });

        const stored = typeof this.offlineCache.upsertKnowledge === "function"
            ? this.offlineCache.upsertKnowledge(record)
            : { success: !!this.offlineCache.saveKnowledge(record), action: "saved", record };

        if (!stored.success) {
            this._setCurrent({
                activity: "Storage failed",
                action: "Not saved",
                processingStatus: "ERROR",
                storageStatus: "Failed — Not Saved"
            });
            this._event(EVENTS.LEARNING_ERROR, {
                source: source.name,
                topic: topic.topic,
                message: stored.error || "Local knowledge storage failed."
            });
            return;
        }

        if (stored.action === "duplicate") {
            this.stats.duplicates++;
            this._event(EVENTS.DUPLICATE_FOUND, { source: source.name, topic: topic.topic });
            return;
        }

        this.sessionItems++;
        if (stored.action === "updated") this.stats.updated++;
        else this.stats.saved++;

        this._setCurrent({
            activity: stored.action === "updated" ? "Knowledge updated" : "Knowledge saved",
            source: source.name,
            sourceUrl: record.sourceUrl,
            topic: topic.topic,
            action: stored.action === "updated"
                ? "Fetching → Processing → Verifying → Updating"
                : "Fetching → Processing → Verifying → Storing",
            processingStatus: "COMPLETE",
            storageStatus: stored.action === "updated" ? "Updated ✓" : "Saved ✓"
        });
        this._event(stored.action === "updated" ? "KNOWLEDGE_UPDATED" : EVENTS.KNOWLEDGE_SAVED, {
            source: source.name,
            sourceUrl: record.sourceUrl,
            topic: topic.topic,
            content: record.content,
            verified: record.verified,
            confidence: record.confidence,
            storageStatus: stored.action === "updated" ? "Updated ✓" : "Saved ✓"
        });
    }

    _recordSuccess(topic, source) {
        const topicKey = String(topic).toLowerCase();
        const sourceKey = String(source).toLowerCase();
        const now = Date.now();
        const topicState = this.topicState.get(topicKey) || { failures: 0 };
        topicState.failures = 0;
        topicState.lastSuccessAt = now;
        topicState.nextEligibleAt = 0;
        this.topicState.set(topicKey, topicState);

        const sourceState = this.sourceState.get(sourceKey) || { failures: 0, successes: 0 };
        sourceState.failures = 0;
        sourceState.successes++;
        sourceState.lastSuccessAt = now;
        sourceState.nextEligibleAt = 0;
        this.sourceState.set(sourceKey, sourceState);
    }

    _recordFailure(topic, source, errorMessage) {
        const now = Date.now();
        const topicKey = String(topic).toLowerCase();
        const sourceKey = String(source).toLowerCase();
        const topicState = this.topicState.get(topicKey) || { failures: 0 };
        topicState.failures = (topicState.failures || 0) + 1;
        const topicDelay = Math.min(
            Number(this.config.failureBackoffMaxMs) || DEFAULT_CONFIG.failureBackoffMaxMs,
            (Number(this.config.failureBackoffBaseMs) || DEFAULT_CONFIG.failureBackoffBaseMs) * Math.pow(2, Math.max(0, topicState.failures - 1))
        );
        topicState.nextEligibleAt = now + topicDelay;
        topicState.lastError = errorMessage;
        this.topicState.set(topicKey, topicState);

        const sourceState = this.sourceState.get(sourceKey) || { failures: 0, successes: 0 };
        sourceState.failures = (sourceState.failures || 0) + 1;
        sourceState.lastError = errorMessage;
        sourceState.nextEligibleAt = now + topicDelay;
        this.sourceState.set(sourceKey, sourceState);
        this._event(EVENTS.RETRY_SCHEDULED, {
            topic,
            source,
            retryAt: new Date(now + topicDelay).toISOString(),
            delayMs: topicDelay
        });
    }

    _handleError(error, context) {
        this.lastError = error?.message || String(error);
        this._event(EVENTS.LEARNING_ERROR, {
            message: this.lastError,
            context
        });
        this._setCurrent({
            activity: "Worker error",
            action: "Waiting before retry",
            processingStatus: "ERROR"
        });
    }
}

module.exports = {
    BackgroundKnowledgeLearning,
    DEFAULT_CONFIG,
    TOPICS,
    EVENTS
};
