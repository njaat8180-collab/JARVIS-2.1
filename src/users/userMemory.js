"use strict";

/*
 * ============================================================
 * JARVIS PRO MAX — USER MEMORY MANAGER (Main Process)
 * src/users/userMemory.js
 * ============================================================
 *
 * STRICT MEMORY ISOLATION between users.
 *
 * Each user gets their OWN MemoryEngine instance with their OWN
 * storage path: <Electron userData>/database/users/<userId>/memory.json
 *
 * User A's memory can NEVER be accessed by User B.
 *
 * The existing MemoryEngine class (src/ai/memory.js) is REUSED —
 * not duplicated. Each instance just points at a different file.
 * ============================================================
 */

const path = require("path");
const { MemoryEngine } = require("../ai/memory");
const userManager = require("./userManager");

// Cache of per-user MemoryEngine instances (userId → engine)
const engineCache = new Map();

// ============================================================
// GET ENGINE — one MemoryEngine per user
// ============================================================

/**
 * Get (or create) the MemoryEngine for a specific user.
 * Each user's engine points to their OWN memory.json.
 *
 * @param {string} userId - Valid user ID
 * @returns {MemoryEngine|null}
 */
function getEngine(userId) {
    if (!userId || !userManager.isValidUserId(userId)) {
        console.warn("[UserMemory] Invalid userId:", userId);
        return null;
    }

    if (engineCache.has(userId)) {
        return engineCache.get(userId);
    }

    const userDir = userManager.userDir(userId);
    const memoryPath = path.join(userDir, "memory.json");

    try {
        const engine = new MemoryEngine({ storagePath: memoryPath });
        engineCache.set(userId, engine);
        return engine;
    } catch (error) {
        console.error(`[UserMemory] Failed to init engine for ${userId}:`, error.message);
        return null;
    }
}

// ============================================================
// VALIDATION — always check userId before any operation
// ============================================================

function requireEngine(userId) {
    const engine = getEngine(userId);
    if (!engine) {
        throw new Error(`Memory engine unavailable for user: ${userId}`);
    }
    return engine;
}

// ============================================================
// MEMORY OPERATIONS — all scoped to a user
// ============================================================

/**
 * Remember a fact for a user.
 */
function remember(userId, key, value, options = {}) {
    const engine = requireEngine(userId);
    return engine.remember(key, value, options);
}

/**
 * Recall a fact for a user.
 */
function recall(userId, key) {
    const engine = requireEngine(userId);
    return engine.recall(key);
}

/**
 * Get all facts for a user.
 */
function allFacts(userId) {
    const engine = requireEngine(userId);
    return engine.allFacts();
}

/**
 * Search a user's memory.
 */
function search(userId, query, options = {}) {
    const engine = requireEngine(userId);
    return engine.search(query, options);
}

/**
 * Extract facts from a message and store for a user.
 */
function extractFromMessage(userId, message, options = {}) {
    const engine = requireEngine(userId);
    return engine.extractFromMessage(message, options);
}

/**
 * Push a conversation turn to a user's working memory.
 */
function pushTurn(userId, role, text) {
    const engine = requireEngine(userId);
    return engine.pushTurn(role, text);
}

/**
 * Get a user's working memory (recent conversation).
 */
function getWorkingMemory(userId) {
    const engine = requireEngine(userId);
    return engine.getWorkingMemory();
}

/**
 * Clear a user's working memory.
 */
function clearWorkingMemory(userId) {
    const engine = requireEngine(userId);
    return engine.clearWorkingMemory();
}

/**
 * Forget a fact by key for a user.
 */
function forgetByKey(userId, key) {
    const engine = requireEngine(userId);
    return engine.forgetByKey(key);
}

/**
 * Forget all memory for a user.
 */
function forgetAll(userId, confirm = false) {
    if (!confirm) {
        const engine = requireEngine(userId);
        const count = engine.allRecords ? engine.allRecords().length : 0;
        return { success: false, error: `This will forget ${count} fact(s). Confirm required.`, count };
    }
    const engine = requireEngine(userId);
    const count = engine.forgetAll();
    return { success: true, count };
}

/**
 * List memory records for a user.
 */
function list(userId, options = {}) {
    const engine = requireEngine(userId);
    return engine.list(options);
}

/**
 * Get memory stats for a user.
 */
function stats(userId) {
    const engine = requireEngine(userId);
    if (typeof engine.stats === "function") {
        return engine.stats();
    }
    // Fallback stats
    const facts = engine.allFacts();
    return { total: facts.length };
}

/**
 * Get the user's memory context block for the Brain
 * (what JARVIS knows about THIS user).
 */
function buildContextBlock(userId) {
    const engine = getEngine(userId);
    if (!engine) return "";
    if (typeof engine.buildContextBlock === "function") {
        return engine.buildContextBlock();
    }
    const facts = engine.allFacts();
    return facts.map(f => `- ${f.fact || f.value}`).join("\n");
}

// ============================================================
// ACTIVE USER HELPERS — convenience for the Brain
// ============================================================

/**
 * Get the engine for the CURRENTLY ACTIVE user.
 */
function getActiveEngine() {
    const activeId = userManager.getActiveUserId();
    if (!activeId) return null;
    return getEngine(activeId);
}

/**
 * Remember a fact for the CURRENTLY ACTIVE user.
 */
function rememberActive(key, value, options = {}) {
    const activeId = userManager.getActiveUserId();
    if (!activeId) return false;
    try {
        remember(activeId, key, value, options);
        return true;
    } catch (_) {
        return false;
    }
}

// ============================================================
// CLEANUP — called on user switch/deletion
// ============================================================

/**
 * Evict a user's engine from cache (frees memory, forces reload on next access).
 */
function evict(userId) {
    engineCache.delete(userId);
}

/**
 * Evict all engines (on app shutdown or mass change).
 */
function evictAll() {
    engineCache.clear();
}

// ============================================================
// PRIVACY-AWARE WRITE GUARD
// ============================================================

/**
 * Explicit user-requested saves follow the master memory switch. The
 * conversation auto-capture preference is checked separately.
 */
function canWrite(userId) {
    const privacy = userManager.getPrivacy(userId);
    if (!privacy) return true; // no privacy file = default allow
    return privacy.memoryEnabled !== false;
}

function canRecordConversation(userId) {
    const privacy = userManager.getPrivacy(userId);
    return canWrite(userId) && (!privacy || privacy.saveConversationMemory !== false);
}

/**
 * Remember with privacy check — silently skips if user disabled memory.
 */
function rememberIfAllowed(userId, key, value, options = {}) {
    if (!canRecordConversation(userId)) {
        return { skipped: true, reason: "memory_disabled_by_user" };
    }
    try {
        remember(userId, key, value, options);
        return { stored: true };
    } catch (error) {
        return { error: error.message };
    }
}

// ============================================================
// MODULE EXPORTS
// ============================================================

module.exports = {
    getEngine,
    getActiveEngine,
    remember,
    recall,
    allFacts,
    search,
    extractFromMessage,
    pushTurn,
    getWorkingMemory,
    clearWorkingMemory,
    forgetByKey,
    forgetAll,
    list,
    stats,
    buildContextBlock,
    rememberActive,
    rememberIfAllowed,
    canWrite,
    canRecordConversation,
    evict,
    evictAll,
};
