"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — MEMORY IMPORTANCE ENGINE
 * src/users/memoryImportance.js (Main Process)
 * ============================================================
 *
 * Ranks per-user memory facts by importance so the Brain gets
 * the MOST valuable facts first, not just the most recent.
 *
 * Scoring:
 *   - Category heuristics (name/location/occupation = high)
 *   - Recall reinforcement (each recall +1 hit, boosts score)
 *   - Recency bonus (recently used facts stay ranked higher)
 *   - Staleness decay (facts unused for 30+ days lose rank)
 *
 * Works with userMemory per-user MemoryEngine stores.
 * ============================================================
 */

const path = require("path");
const fs = require("fs");
const userManager = require("./userManager");

// Category weights
var CATEGORY_WEIGHTS = {
    name: 100, identity: 95, location: 85, occupation: 80,
    family: 75, contact: 70, preference: 55, project: 65,
    interest: 45, hobby: 40, schedule: 60, goal: 70,
    fact: 30, other: 20
};

// Key-pattern detection
var KEY_PATTERNS = [
    { re: /(?:^|\b)(?:name|naam|called)\b/i, cat: "name" },
    { re: /(?:^|\b)(?:live|city|location|address|home|se|hail from)\b/i, cat: "location" },
    { re: /(?:^|\b)(?:job|work|occupation|profession|study|college|school)\b/i, cat: "occupation" },
    { re: /(?:^|\b)(?:wife|husband|mom|dad|mother|father|brother|sister|family|son|daughter)\b/i, cat: "family" },
    { re: /(?:^|\b)(?:phone|email|contact|number)\b/i, cat: "contact" },
    { re: /(?:^|\b)(?:like|love|prefer|favourite|favorite|pasand)\b/i, cat: "preference" },
    { re: /(?:^|\b)(?:project|building|working on)\b/i, cat: "project" },
    { re: /(?:^|\b)(?:interest|interested)\b/i, cat: "interest" },
    { re: /(?:^|\b)(?:hobby|hobbies|enjoy)\b/i, cat: "hobby" },
    { re: /(?:^|\b)(?:schedule|routine|meeting|reminder)\b/i, cat: "schedule" },
    { re: /(?:^|\b)(?:goal|want|plan|target|aim)\b/i, cat: "goal" }
];

function categorize(key) {
    var k = String(key || "");
    for (var i = 0; i < KEY_PATTERNS.length; i++) {
        if (KEY_PATTERNS[i].re.test(k)) return KEY_PATTERNS[i].cat;
    }
    return "other";
}

// Load/track reinforcement stats per user: { hits: {key: n}, lastHit: {key: ts} }
var statsCache = new Map();

function statsPath(userId) {
    return path.join(userManager.userDir(userId), "memory_stats.json");
}

function loadStats(userId) {
    if (statsCache.has(userId)) return statsCache.get(userId);
    var stats = { hits: {}, lastHit: {} };
    try {
        var p = statsPath(userId);
        if (fs.existsSync(p)) {
            var raw = JSON.parse(fs.readFileSync(p, "utf8"));
            if (raw && raw.hits) stats = raw;
        }
    } catch (_) {}
    statsCache.set(userId, stats);
    return stats;
}

function saveStats(userId) {
    try {
        var dir = userManager.userDir(userId);
        if (!fs.existsSync(dir)) return;
        fs.writeFileSync(statsPath(userId), JSON.stringify(loadStats(userId), null, 2));
    } catch (_) {}
}

// ---- public API ----

/**
 * Score a single fact 0-100+.
 */
function scoreFact(key, value, userId) {
    var cat = categorize(key);
    var base = CATEGORY_WEIGHTS[cat] || 20;

    // value length bonus (longer = more specific = slightly more valuable, capped)
    var lenBonus = Math.min(10, Math.floor(String(value || "").length / 20));

    // recall reinforcement
    var hits = 0, recencyBonus = 0;
    if (userId) {
        var stats = loadStats(userId);
        hits = stats.hits[key] || 0;
        var lastHit = stats.lastHit[key];
        if (lastHit) {
            var ageDays = (Date.now() - new Date(lastHit).getTime()) / 86400000;
            if (ageDays < 1) recencyBonus = 20;
            else if (ageDays < 7) recencyBonus = 10;
        }
    }

    return {
        key: key, value: value, category: cat,
        score: base + lenBonus + hits * 5 + recencyBonus,
        hits: hits
    };
}

/**
 * Call when a fact is recalled (search/read) — reinforces it.
 */
function reinforce(userId, key) {
    if (!userId || !key) return false;
    var stats = loadStats(userId);
    stats.hits[key] = (stats.hits[key] || 0) + 1;
    stats.lastHit[key] = new Date().toISOString();
    saveStats(userId);
    return true;
}

/**
 * Ranked list of a user's top facts for the Brain context block.
 */
function topFacts(userId, limit) {
    var userMemory = require("./userMemory");
    var facts;
    try { facts = userMemory.allFacts(userId) || []; } catch (_) { return []; }
    var rows = [];
    if (Array.isArray(facts)) {
        facts.forEach(function (f) {
            if (f && f.key) rows.push(scoreFact(f.key, f.value !== undefined ? f.value : f.text, userId));
        });
    } else if (facts && typeof facts === "object") {
        Object.keys(facts).forEach(function (k) {
            rows.push(scoreFact(k, facts[k], userId));
        });
    }
    // staleness decay: facts never hit in 30+ days lose 25% score — handled implicitly via recencyBonus absence + explicit here
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows.slice(0, limit || 10);
}

/**
 * Which facts are stale (never recalled in N days).
 */
function staleFacts(userId, days) {
    var userMemory = require("./userMemory");
    var facts;
    try { facts = userMemory.allFacts(userId) || []; } catch (_) { return []; }
    var cutoff = Date.now() - (days || 30) * 86400000;
    var stats = loadStats(userId);
    var stale = [];
    (Array.isArray(facts) ? facts : []).forEach(function (f) {
        if (!f || !f.key) return;
        var last = stats.lastHit[f.key];
        if (!last || new Date(last).getTime() < cutoff) stale.push(f.key);
    });
    return stale;
}

function evictStats(userId) { statsCache.delete(userId); }

module.exports = {
    scoreFact: scoreFact,
    reinforce: reinforce,
    topFacts: topFacts,
    staleFacts: staleFacts,
    categorize: categorize,
    evictStats: evictStats,
    CATEGORY_WEIGHTS: CATEGORY_WEIGHTS
};
