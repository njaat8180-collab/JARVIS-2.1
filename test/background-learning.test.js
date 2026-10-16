const test = require("node:test");
const assert = require("node:assert/strict");
const { BackgroundKnowledgeLearning } = require("../src/services/backgroundKnowledgeLearning");

function makeWorker(overrides = {}) {
    const knowledge = [];
    const events = [];
    const offlineCache = {
        isOnline: async () => true,
        recentKnowledge: () => knowledge.slice().reverse(),
        findKnowledge: (topic, id, content) => knowledge.find(x => x.id === id) || null,
        saveKnowledge: (record) => { knowledge.push(record); return true; },
        knowledgeStats: () => ({
            success: true,
            knowledgeItems: knowledge.length,
            sourcesUsed: new Set(knowledge.map(x => x.source)).size,
            topicsLearned: new Set(knowledge.map(x => x.topic)).size
        }),
        ...overrides
    };
    const worker = new BackgroundKnowledgeLearning({
        offlineCache,
        wikipediaService: {
            summary: async (topic) => ({
                success: true,
                title: topic,
                extract: `${topic} is real knowledge returned by Wikipedia.`,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`
            })
        },
        dataSourcesService: {
            wikidataSearch: async (topic) => ({
                success: true,
                label: topic,
                description: `Wikidata description for ${topic}`,
                url: `https://www.wikidata.org/wiki/Q1`
            })
        },
        emit: e => events.push(e),
        config: { pollingIntervalMs: 60000, requestTimeoutMs: 1000, retryCount: 0 }
    });
    return { worker, knowledge, events };
}

test("background worker is OFF by default", () => {
    const { worker } = makeWorker();
    assert.equal(worker.getStatus().running, false);
});

test("real source response becomes structured local knowledge and emits events", async () => {
    const { worker, knowledge, events } = makeWorker();
    worker.running = true;
    worker._scheduleNext = () => {};
    await worker._runCycle();
    worker.running = false;

    assert.equal(knowledge.length, 1);
    assert.equal(knowledge[0].source, "Wikipedia API");
    assert.match(knowledge[0].sourceUrl, /^https:\/\//);
    assert.equal(knowledge[0].verified, true);
    assert.ok(events.some(e => e.type === "FETCH_STARTED"));
    assert.ok(events.some(e => e.type === "KNOWLEDGE_VERIFIED"));
    assert.ok(events.some(e => e.type === "KNOWLEDGE_SAVED"));
});

test("offline cycle does not call source and emits disconnected", async () => {
    let calls = 0;
    const { worker, events } = makeWorker({
        isOnline: async () => false
    });
    worker.wikipedia.summary = async () => { calls++; throw new Error("should not fetch"); };
    worker.running = true;
    worker._scheduleNext = () => {};
    await worker._runCycle();
    worker.running = false;

    assert.equal(calls, 0);
    assert.ok(events.some(e => e.type === "INTERNET_DISCONNECTED"));
    assert.ok(events.some(e => e.type === "LEARNING_IDLE"));
});

test("changed knowledge updates the existing topic record instead of duplicating it", async () => {
    let current = null;
    const events = [];
    const offlineCache = {
        isOnline: async () => true,
        getText: () => null,
        setText: () => true,
        recentKnowledge: () => current ? [current] : [],
        findKnowledge: (topic, id, content, source) => {
            if (!current) return null;
            if (String(current.topic).toLowerCase() === String(topic).toLowerCase() &&
                String(current.source).toLowerCase() === String(source).toLowerCase()) return current;
            return null;
        },
        upsertKnowledge: (record) => {
            if (current && current.topic === record.topic && current.source === record.source) {
                if (current.content === record.content) return { success: true, action: "duplicate", record: current };
                const previous = current;
                current = { ...record, id: previous.id };
                return { success: true, action: "updated", record: current, previous };
            }
            current = record;
            return { success: true, action: "saved", record };
        },
        knowledgeStats: () => ({ knowledgeItems: current ? 1 : 0, sourcesUsed: 1, topicsLearned: 1 }),
        recentKnowledge: () => current ? [current] : []
    };
    let version = 1;
    const worker = new BackgroundKnowledgeLearning({
        offlineCache,
        wikipediaService: {
            summary: async (topic) => ({ success: true, title: topic, extract: `Version ${version} of ${topic}`, url: `https://en.wikipedia.org/wiki/${topic}` })
        },
        dataSourcesService: { wikidataSearch: async () => ({ success: true, url: "https://www.wikidata.org/wiki/Q1" }) },
        emit: e => events.push(e),
        config: { pollingIntervalMs: 60000, requestTimeoutMs: 1000, retryCount: 0 }
    });
    worker.running = true;
    worker._scheduleNext = () => {};
    await worker._runCycle();
    const originalId = current.id;
    version = 2;
    await worker._learnTopic({ topic: "Artificial Intelligence", category: "Technology" });
    worker.running = false;

    assert.equal(current.id, originalId);
    assert.match(current.content, /Version 2/);
    assert.equal(worker.stats.updated, 1);
    assert.ok(events.some(e => e.type === "KNOWLEDGE_UPDATED"));
});

test("enabled preference persists and is restored", () => {
    let saved = null;
    const offlineCache = {
        getText: () => saved ? { value: saved } : null,
        setText: (_key, value) => { saved = value; return true; },
        isOnline: async () => false,
        recentKnowledge: () => [],
        knowledgeStats: () => ({ knowledgeItems: 0, sourcesUsed: 0, topicsLearned: 0 })
    };
    const make = () => new BackgroundKnowledgeLearning({
        offlineCache,
        wikipediaService: {},
        dataSourcesService: {},
        config: { pollingIntervalMs: 60000 }
    });
    const first = make();
    assert.equal(first.enabled, false);
    first.start();
    assert.equal(saved.enabled, true);
    first.stop();
    assert.equal(saved.enabled, false);
    saved.enabled = true;
    const restored = make();
    assert.equal(restored.enabled, true);
});
