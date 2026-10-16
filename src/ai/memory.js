"use strict";

/**
 * ============================================================
 * JARVIS MEMORY ENGINE
 * ============================================================
 *
 * Phase 9 of the Memory + Conversation Context upgrade: MEMORY
 * UPDATE / CONTRADICTION HANDLING. Phase 7 added the durable record store
 * and Phase 8 added conservative extraction; this phase adds safe
 * replacement history without leaving contradictory values active.
 * MEMORY STORAGE. This is still the same file/class prior phases
 * and `main.js` already depend on (`MemoryEngine`) — the public API
 * every existing caller uses (`remember`, `recall`, `recallEntry`,
 * `forget`, `allFacts`, `extractFromMessage`, `buildContextBlock`,
 * `pushTurn`, `getWorkingMemory`, `clearWorkingMemory`) is UNCHANGED
 * and still behaves exactly as before. What changed is what's
 * underneath it.
 *
 * DECISION RECORD (per the master brief's Phase 7 note asking this
 * be confirmed before starting): extend the existing JSON-file store
 * with the full structured schema, rather than introducing SQLite.
 * Reasoning:
 *   - This sandbox has no network access, so a new dependency like
 *     `better-sqlite3` cannot be `npm install`-ed here.
 *   - `package.json` has no SQLite dependency today, and nothing
 *     elsewhere in the project uses one.
 *   - The structured schema the brief asks for (id/type/key/value/
 *     source/createdAt/updatedAt/confidence/importance/lastUsedAt/
 *     status) is a data-shape requirement, not a storage-engine
 *     requirement — a JSON file can hold it just as well for this
 *     project's scale (a handful to a few hundred facts, not millions
 *     of rows needing indexed queries).
 *   - This keeps the change low-risk and fully testable in this
 *     environment (no network/display needed), matching the "minimum
 *     safe change" rule in the brief.
 *   If the user wants SQLite later, that's a clean follow-up: install
 *   the dependency locally, then swap this file's load()/save() for
 *   a `better-sqlite3`-backed implementation behind the exact same
 *   public method signatures — no caller elsewhere would need to
 *   change.
 *
 * Storage format (src/database/memory.json), v2 (this phase):
 * {
 *   "version": 2,
 *   "records": [
 *     {
 *       "id": "a1b2c3d4-...",
 *       "type": "USER_PROFILE",
 *       "key": "user.name",
 *       "value": "Nakul",
 *       "source": "conversation",
 *       "createdAt": 1730000000000,
 *       "updatedAt": 1730000000000,
 *       "confidence": 0.9,
 *       "importance": 0.5,
 *       "lastUsedAt": 1730000000000,
 *       "status": "ACTIVE"
 *     }
 *   ],
 *   "episodic": []
 * }
 *
 * v1 (pre-Phase-7) files — `{ "facts": { "<key>": {...} }, "episodic":
 * [] }` — are auto-migrated to v2 the first time they're loaded (see
 * `_migrateFromV1()`), then saved back in the v2 shape. No data is
 * dropped: every v1 fact becomes exactly one v2 record.
 *
 * Record `type` values (per the brief): USER_PROFILE,
 * USER_PREFERENCE, USER_INTEREST, USER_PROJECT, USER_WORKFLOW,
 * USER_FACT, CONVERSATION_SUMMARY, IMPORTANT_CONTEXT. Not enforced
 * as a hard enum (a caller can pass any string) so this doesn't
 * become a brittle gate — but `remember()` defaults sensibly (see
 * `CATEGORY_TO_TYPE` below) and every value this project's own code
 * currently writes maps onto that list.
 *
 * Record `status` values: ACTIVE, SUPERSEDED, DELETED.
 *   - Phase 9 uses SUPERSEDED when a new value contradicts/replaces
 *     the currently ACTIVE value for the same key.
 *   - DELETED remains reserved for a future memory-command/soft-delete
 *     decision; `forget()` is still a hard delete for compatibility.
 *   `remember()` keeps the existing ACTIVE record when the normalized
 *   value is unchanged, but a genuinely different value creates a new
 *   record and marks the old ACTIVE record SUPERSEDED. This preserves
 *   history without leaving contradictory values active at the same time.
 *
 * Scope reminder (unchanged from pre-Phase-7, still true):
 *   - Only stores facts that are ACTUALLY present in the
 *     conversation ("My name is Nakul") or explicitly supplied by
 *     the caller. It never invents memories.
 *   - Two tiers, as specified:
 *       - Working memory   -> in-process only, cleared on restart,
 *                             holds the last N turns for continuity.
 *       - Long-term memory -> durable structured records, persisted
 *                             to disk (the configured local storage path),
 *                             surviving restart (this phase's work).
 *   - No episodic/event log yet (out of scope for this pass) — the
 *     `episodic` array is present as a documented, empty extension
 *     point rather than being silently omitted.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_STORE_PATH = path.join(__dirname, "..", "database", "memory.json");

// Keep this module dependency-free by design: memory must remain a local,
// deterministic store with only Node built-ins. Windows may reject rename()
// when replacing an open target, so use a complete-file copy fallback while
// preserving the old file until the new payload has been fully written.
function writeMemoryJsonAtomic(filePath, payload) {
    const target = path.resolve(filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
        fs.writeFileSync(tmp, payload, "utf8");
        try {
            fs.renameSync(tmp, target);
        } catch (error) {
            if (!new Set(["EPERM", "EEXIST", "EBUSY", "ENOTEMPTY"]).has(error?.code)) throw error;
            fs.copyFileSync(tmp, target);
            fs.unlinkSync(tmp);
        }
    } catch (error) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
        throw error;
    }
}

const MAX_WORKING_MEMORY = 20;

// ----------------------------------------------------------------
// PHASE 8 — schema version bump (v2 -> v3). v3 is purely additive:
// every v2 field remains, plus tags/pinned/expiresAt/accessCount/
// lastAccessedAt/metadata/category. Old v2 (and v1) files are
// migrated automatically on load; see _migrateFromV1() / _upgradeV2ToV3().
// ----------------------------------------------------------------
const STORE_VERSION = 3;

// ----------------------------------------------------------------
// PHASE 8 — deterministic size/security limits. These exist purely
// to prevent uncontrolled growth / abuse of the local JSON store;
// they are not AI-driven and never silently truncate user data —
// violations return/throw a structured error instead.
// ----------------------------------------------------------------
const LIMITS = Object.freeze({
    MAX_KEY_LENGTH: 200,
    MAX_VALUE_LENGTH: 4000,
    MAX_TAGS: 20,
    MAX_TAG_LENGTH: 60,
    MAX_METADATA_BYTES: 8 * 1024,      // 8KB serialized
    MAX_RECORDS: 20000,
    MAX_STORE_BYTES: 25 * 1024 * 1024  // 25MB serialized store
});

// Keys that must never be accepted into a plain object we later
// merge/spread, to guard against prototype-pollution style payloads
// arriving as memory `key`/`category`/`tags`/`metadata` values.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

class MemoryValidationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "MemoryValidationError";
        this.code = code || "VALIDATION_ERROR";
    }
}

const STATUS = Object.freeze({
    ACTIVE: "ACTIVE",
    SUPERSEDED: "SUPERSEDED",
    DELETED: "DELETED"
});

const RETENTION = Object.freeze({
    TEMPORARY: "TEMPORARY",
    LONG_TERM: "LONG_TERM"
});

// Maps the old free-text `category` option (still accepted for
// backward compatibility) onto the brief's structured `type` values.
// Anything not listed here falls back to USER_FACT.
const CATEGORY_TO_TYPE = {
    identity: "USER_PROFILE",
    context: "USER_FACT",
    preference: "USER_PREFERENCE",
    interest: "USER_INTEREST",
    project: "USER_PROJECT",
    workflow: "USER_WORKFLOW",
    summary: "CONVERSATION_SUMMARY",
    important: "IMPORTANT_CONTEXT",
    general: "USER_FACT"
};

const DEFAULT_TYPE = "USER_FACT";
const DEFAULT_IMPORTANCE = 0.5;

function makeId() {
    if (crypto && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback for older Node builds without crypto.randomUUID().
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveType({ type, category }) {
    if (typeof type === "string" && type.trim()) {
        return type.trim();
    }
    if (typeof category === "string" && CATEGORY_TO_TYPE[category]) {
        return CATEGORY_TO_TYPE[category];
    }
    return DEFAULT_TYPE;
}

/**
 * Memory extraction is deliberately rule-based. A rule must match an
 * explicit first-person statement; ordinary questions and commands do
 * not become memories merely because they contain interesting words.
 *
 * `FACT_RULES` remains exported for compatibility with earlier phases.
 * The richer `EXTRACTION_RULES` below is the active Phase 8 rule set.
 */
const FACT_RULES = [
    {
        key: "user.name",
        category: "identity",
        regex: /\b(?:my name is|call me)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,40}?)(?=\s*(?:[.!?,]|$|\b(?:and|but)\b))/i
    },
    {
        key: "user.name",
        category: "identity",
        // "mera naam Nakul hai" / "mera naam Nakul"
        regex: /mera\s+naam\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,40}?)\s*(?:hai\b|$)/i
    },
    {
        key: "user.location",
        category: "context",
        regex: /\b(?:i live in|i'm from|i am from|i reside in)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,40}?)(?=\s*(?:[.!?,]|$|\b(?:and|but)\b))/i
    }
];

const IMPORTANCE_BY_CATEGORY = Object.freeze({
    identity: 0.9,
    preference: 0.8,
    project: 0.8,
    workflow: 0.7,
    interest: 0.6,
    context: 0.6,
    general: DEFAULT_IMPORTANCE
});

const TEMPORARY_MARKERS = /\b(?:today|right now|currently|at the moment|for now|this week|aaj|abhi|filhaal|filhal)\b/i;

// This is intentionally narrower than a generic "sensitive word" block.
// "I am building a password manager" is harmless project context, while
// "my API key is ..." must never be written to the memory store.
const SENSITIVE_MEMORY_PATTERNS = [
    /\b(?:my|mera|meri)\s+(?:password|passcode|pin|secret|api[\s_-]?key|access[\s_-]?token|auth(?:entication)?[\s_-]?token)\b/i,
    /\b(?:password|passcode|pin|secret|api[\s_-]?key|access[\s_-]?token|auth(?:entication)?[\s_-]?token)\s*(?:is|=|:)\s*\S+/i,
    /\bcredit\s*card\b.*\b(?:\d[ -]*){8,}\b/i
];

const NAME_STOP_WORDS = new Set([
    "a", "an", "the", "building", "developing", "working", "living",
    "from", "in", "interested", "trying", "making", "creating",
    "looking", "learning", "going", "planning", "currently"
]);

function hasSensitiveMemoryContent(message) {
    return SENSITIVE_MEMORY_PATTERNS.some(pattern => pattern.test(message));
}

function normalizeCapturedValue(raw) {
    return cleanValue(raw)
        .replace(/\s+/g, " ")
        .replace(/^(?:that|this)\s+/i, "")
        .replace(/\s+(?:and|but|because|so|while)\s+.*$/i, "")
        .trim();
}

function isValidName(value) {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) return false;
    return !NAME_STOP_WORDS.has(words[0].toLowerCase()) &&
        !/\d/.test(value) &&
        value.length <= 60;
}

function preferenceKey(value) {
    const lower = value.toLowerCase();
    if (/\b(concis\w*|brief|short|detailed|long|verbose|answer|response)\b/.test(lower)) {
        return "user.preference.response_style";
    }
    if (/\b(dark|light|theme|ui|interface|mode)\b/.test(lower)) {
        return "user.preference.ui_theme";
    }
    return "user.preference";
}

function createRule({
    key,
    category,
    type,
    importance,
    regex,
    validate,
    valueFromMatch,
    transformKey,
    retention = RETENTION.LONG_TERM
}) {
    return { key, category, type, importance, regex, validate, valueFromMatch, transformKey, retention };
}

const EXTRACTION_RULES = [
    ...FACT_RULES.map(rule => ({
        ...rule,
        type: resolveType({ category: rule.category }),
        importance: IMPORTANCE_BY_CATEGORY[rule.category]
    })),
    createRule({
        key: "user.name",
        category: "identity",
        type: "USER_PROFILE",
        importance: 0.9,
        regex: /\bi\s+(?:am|'m)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,40}?)(?=\s*(?:[.!?,]|$|\b(?:and|but)\b))/i,
        validate: isValidName
    }),
    createRule({
        key: "user.location",
        category: "context",
        type: "USER_FACT",
        importance: 0.6,
        regex: /\b(?:my home is in|my city is|i live in|i'm from|i am from|i reside in)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,60}?)(?=\s*(?:[.!?,]|$|\b(?:and|but)\b))/i
    }),
    createRule({
        key: "user.location",
        category: "context",
        type: "USER_FACT",
        importance: 0.6,
        regex: /(?:mera\s+(?:shehar|shahar|city)\s+)([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,50}?)(?:\s+hai\b|$)/i
    }),
    createRule({
        key: "user.occupation",
        category: "identity",
        type: "USER_PROFILE",
        importance: 0.8,
        regex: /\b(?:i work as|my job is|my profession is)\s+(?:an?\s+|the\s+)?([a-zA-Z][a-zA-Z .'-]{1,50}?)(?=\s*(?:[.!?,]|$|\b(?:and|but)\b))/i
    }),
    createRule({
        key: "user.preference",
        category: "preference",
        type: "USER_PREFERENCE",
        importance: 0.8,
        regex: /\b(?:i prefer|my preference is|i like|i don't like|i do not like)\s+(.{2,80}?)(?=\s*(?:[.!?,]|$|\b(?:but|because|when)\b))/i,
        transformKey: preferenceKey
    }),
    createRule({
        key: "user.preference",
        category: "preference",
        type: "USER_PREFERENCE",
        importance: 0.8,
        regex: /mujhe\s+(.{2,80}?)\s+pasand\s+(hai|nah[ií]n\s+hai)\b/i,
        valueFromMatch: match => `${match[1]}${/nah[ií]n/i.test(match[2]) ? " (not preferred)" : ""}`,
        transformKey: preferenceKey
    }),
    createRule({
        key: "user.favorite",
        category: "preference",
        type: "USER_PREFERENCE",
        importance: 0.8,
        // "my favorite color is blue" / "mera favourite game is chess"
        // FIX: this common memory-command phrasing previously matched no
        // rule, so "remember that my favorite color is blue" was refused
        // with "could not find a safe, explicit fact".
        regex: /\b(?:my|mera|meri)\s+(?:favo[u]?rite|favo[u]?rit)\s+([a-z][a-z ]{1,30}?)\s+(?:is|hai)\s+(.{2,60}?)(?=\s*(?:[.!?]|$|\b(?:and|but|because)\b))/i,
        valueFromMatch: match => `${match[1].trim()}: ${match[2].trim()}`,
        transformKey: value => "user.favorite." +
            String(value).split(":")[0].trim().toLowerCase()
                .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    }),
    createRule({
        key: "user.interest",
        category: "interest",
        type: "USER_INTEREST",
        importance: 0.6,
        regex: /\b(?:i am interested in|i'm interested in|my interests include|i enjoy|i love)\s+(.{2,80}?)(?=\s*(?:[.!?,]|$|\b(?:but|because|when)\b))/i
    }),
    createRule({
        key: "user.interest",
        category: "interest",
        type: "USER_INTEREST",
        importance: 0.6,
        regex: /mujhe\s+(.{2,80}?)\s+mein\s+interest\s+hai\b/i
    }),
    createRule({
        key: "user.project",
        category: "project",
        type: "USER_PROJECT",
        importance: 0.8,
        regex: /\b(?:i am building|i'm building|i am developing|i'm developing|i am working on|i'm working on|my project is)\s+(.{2,100}?)(?=\s*(?:[.!?,]|$|\b(?:and|but|because)\b))/i
    }),
    createRule({
        key: "user.project",
        category: "project",
        type: "USER_PROJECT",
        importance: 0.8,
        regex: /mera\s+project\s+(?:hai|is)\s+(.{2,100}?)(?=\s*(?:[.!?,]|$|\b(?:aur|lekin|because)\b))/i
    }),
    createRule({
        key: "user.workflow",
        category: "workflow",
        type: "USER_WORKFLOW",
        importance: 0.7,
        regex: /\b(?:i usually|i always|my workflow is|i generally)\s+(.{2,100}?)(?=\s*(?:[.!?,]|$|\b(?:but|because)\b))/i
    })
];

const TEMPORARY_RULES = [
    createRule({
        key: "session.location",
        category: "context",
        type: "IMPORTANT_CONTEXT",
        importance: 0.3,
        retention: RETENTION.TEMPORARY,
        regex: /\b(?:today i am in|right now i am in|currently i am in|at the moment i am in)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,50}?)(?=\s*(?:[.!?,]|$))/i
    }),
    createRule({
        key: "session.location",
        category: "context",
        type: "IMPORTANT_CONTEXT",
        importance: 0.3,
        retention: RETENTION.TEMPORARY,
        regex: /(?:aaj|abhi|filhaal|filhal)\s+main\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'-]{1,50}?)\s+(?:mein|me)\s+hoon\b/i
    })
];

function cleanValue(raw) {
    return String(raw || "")
        .trim()
        .replace(/[.,!?]+$/g, "")
        .trim();
}

/* ------------------------------------------------------------
   PHASE 8 — VALIDATION / SECURITY HELPERS
   Deterministic only. No AI/heuristic scoring. These exist to keep
   the on-disk store well-formed and bounded, and to make sure a
   memory VALUE is always treated as inert data, never as something
   that gets executed, interpolated into a shell command, or used as
   an object key that could climb the prototype chain.
------------------------------------------------------------ */

function isSafeIdentifierString(value) {
    return typeof value === "string" && !DANGEROUS_KEYS.has(value);
}

/** Throws MemoryValidationError if `key` is unsafe or too long. */
function assertSafeKey(key) {
    const cleanKey = String(key == null ? "" : key).trim();
    if (!cleanKey) {
        throw new MemoryValidationError("Memory key must not be empty.", "EMPTY_KEY");
    }
    if (!isSafeIdentifierString(cleanKey)) {
        throw new MemoryValidationError(`Unsafe memory key: "${cleanKey}"`, "UNSAFE_KEY");
    }
    if (cleanKey.length > LIMITS.MAX_KEY_LENGTH) {
        throw new MemoryValidationError(
            `Memory key exceeds ${LIMITS.MAX_KEY_LENGTH} characters.`,
            "KEY_TOO_LONG"
        );
    }
    return cleanKey;
}

/** Throws MemoryValidationError if `value` is too long. Empty is allowed to fall through to callers that treat empty as "no-op". */
function assertSafeValue(value) {
    const cleanVal = cleanValue(value);
    if (cleanVal.length > LIMITS.MAX_VALUE_LENGTH) {
        throw new MemoryValidationError(
            `Memory value exceeds ${LIMITS.MAX_VALUE_LENGTH} characters.`,
            "VALUE_TOO_LONG"
        );
    }
    return cleanVal;
}

/** Sanitizes a category/type-like short string; rejects dangerous identifiers. */
function sanitizeShortString(value, fallback = null) {
    if (value == null) return fallback;
    const str = String(value).trim();
    if (!str) return fallback;
    if (!isSafeIdentifierString(str)) {
        throw new MemoryValidationError(`Unsafe value: "${str}"`, "UNSAFE_VALUE");
    }
    return str;
}

/** Deterministic tag normalization: array of short strings, deduped, size-bounded. */
function sanitizeTags(tags) {
    if (tags == null) return [];
    const arr = Array.isArray(tags) ? tags : [tags];
    if (arr.length > LIMITS.MAX_TAGS) {
        throw new MemoryValidationError(
            `Too many tags (max ${LIMITS.MAX_TAGS}).`,
            "TOO_MANY_TAGS"
        );
    }
    const seen = new Set();
    const out = [];
    for (const raw of arr) {
        const tag = String(raw == null ? "" : raw).trim().toLowerCase();
        if (!tag) continue;
        if (!isSafeIdentifierString(tag)) {
            throw new MemoryValidationError(`Unsafe tag: "${tag}"`, "UNSAFE_TAG");
        }
        if (tag.length > LIMITS.MAX_TAG_LENGTH) {
            throw new MemoryValidationError(
                `Tag exceeds ${LIMITS.MAX_TAG_LENGTH} characters.`,
                "TAG_TOO_LONG"
            );
        }
        if (!seen.has(tag)) {
            seen.add(tag);
            out.push(tag);
        }
    }
    return out;
}

/**
 * Recursively checks a plain-data value for prototype-pollution style
 * keys (__proto__/constructor/prototype) and non-JSON-serializable
 * content (functions, symbols). Memory metadata is DATA ONLY — never
 * executed, never merged unsafely into another object.
 */
function assertPlainSerializable(value, depth = 0) {
    if (depth > 6) {
        throw new MemoryValidationError("Metadata nesting too deep.", "METADATA_TOO_DEEP");
    }
    if (value === null || value === undefined) return;
    const type = typeof value;
    if (type === "function" || type === "symbol") {
        throw new MemoryValidationError("Metadata must be plain, serializable data.", "METADATA_NOT_SERIALIZABLE");
    }
    if (type !== "object") return; // string/number/boolean are fine
    if (Array.isArray(value)) {
        for (const item of value) assertPlainSerializable(item, depth + 1);
        return;
    }
    for (const k of Object.keys(value)) {
        if (DANGEROUS_KEYS.has(k)) {
            throw new MemoryValidationError(`Unsafe metadata key: "${k}"`, "UNSAFE_METADATA_KEY");
        }
        assertPlainSerializable(value[k], depth + 1);
    }
}

/** Sanitizes metadata: plain object, size-bounded, prototype-pollution safe. */
function sanitizeMetadata(metadata) {
    if (metadata == null) return {};
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new MemoryValidationError("Metadata must be a plain object.", "INVALID_METADATA");
    }
    assertPlainSerializable(metadata);

    let serialized;
    try {
        serialized = JSON.stringify(metadata);
    } catch (e) {
        throw new MemoryValidationError("Metadata must be JSON-serializable.", "METADATA_NOT_SERIALIZABLE");
    }
    if (Buffer.byteLength(serialized, "utf8") > LIMITS.MAX_METADATA_BYTES) {
        throw new MemoryValidationError(
            `Metadata exceeds ${LIMITS.MAX_METADATA_BYTES} bytes.`,
            "METADATA_TOO_LARGE"
        );
    }
    // Rebuild via JSON round-trip so the stored object is a fresh
    // plain object with no prototype-chain surprises whatsoever.
    return JSON.parse(serialized);
}

/** True if a record has a non-null expiresAt in the past. */
function isExpired(record, now = Date.now()) {
    return Boolean(record && record.expiresAt != null && Number(record.expiresAt) <= now);
}

class MemoryEngine {
    constructor({ storagePath } = {}) {
        this.storagePath = storagePath || DEFAULT_STORE_PATH;
        this.records = []; // structured long-term memory records (v3 schema)
        this.episodic = [];
        this.working = []; // { role, text, timestamp } — most recent MAX_WORKING_MEMORY turns
        this.storeVersion = STORE_VERSION;
        this.load();
    }

    /* ------------------------------------------------------------
       PERSISTENCE
    ------------------------------------------------------------ */

    load() {
        try {
            if (fs.existsSync(this.storagePath)) {
                const raw = fs.readFileSync(this.storagePath, "utf8").trim();

                if (raw) {
                    let parsed;
                    try {
                        parsed = JSON.parse(raw);
                    } catch (parseError) {
                        // PHASE 8: corrupt JSON must never be silently
                        // discarded. Back the raw bytes up first, then
                        // start clean, so the user's data is recoverable
                        // rather than lost.
                        this._backupCorruptFile(raw, parseError);
                        this.records = [];
                        this.episodic = [];
                        this.storeVersion = STORE_VERSION;
                        return;
                    }

                    if (parsed && Array.isArray(parsed.records)) {
                        const version = Number(parsed.version) || 2;
                        // Malformed individual records must not crash the
                        // whole load — drop only the bad ones, keep the
                        // rest (partial-corruption recovery).
                        let records = parsed.records.filter(r => r && typeof r === "object" && !Array.isArray(r));
                        const droppedCount = parsed.records.length - records.length;
                        if (droppedCount > 0) {
                            console.warn(`[MEMORY] Dropped ${droppedCount} malformed record(s) while loading.`);
                        }

                        if (version < 3) {
                            records = records.map(r => this._upgradeRecordToV3(r));
                        } else {
                            records = records.map(r => this._repairRecordShape(r));
                        }

                        this.records = records;
                        this.episodic = Array.isArray(parsed.episodic) ? parsed.episodic : [];
                        this.storeVersion = STORE_VERSION;

                        if (version < STORE_VERSION) {
                            this.save();
                            console.log(`[MEMORY] Migrated store from v${version} to v${STORE_VERSION}.`);
                        }
                    } else if (parsed && typeof parsed.facts === "object" && parsed.facts !== null) {
                        // v1 file — migrate in memory, then persist as v3 below.
                        this.records = this._migrateFromV1(parsed.facts).map(r => this._upgradeRecordToV3(r));
                        this.episodic = Array.isArray(parsed.episodic) ? parsed.episodic : [];
                        this.storeVersion = STORE_VERSION;
                        this.save();
                        console.log(`[MEMORY] Migrated ${this.records.length} v1 fact(s) to the v${STORE_VERSION} structured schema.`);
                    } else {
                        this.records = [];
                        this.episodic = [];
                        this.storeVersion = STORE_VERSION;
                    }
                } else {
                    // Empty file on disk — treat as an empty, valid store.
                    this.records = [];
                    this.episodic = [];
                    this.storeVersion = STORE_VERSION;
                }
            } else {
                this.storeVersion = STORE_VERSION;
            }
        } catch (error) {
            // Any other unexpected failure must never crash JARVIS.
            // Start clean instead (per "fail gracefully" requirement).
            console.error("[MEMORY] Failed to load memory store, starting clean:", error.message);
            this.records = [];
            this.episodic = [];
            this.storeVersion = STORE_VERSION;
        }
    }

    /** Copies an unparsable store file aside before it is discarded. */
    _backupCorruptFile(rawContent, parseError) {
        try {
            const backupPath = `${this.storagePath}.corrupt-${Date.now()}.bak`;
            fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
            fs.writeFileSync(backupPath, rawContent, "utf8");
            console.error(
                `[MEMORY] memory store was corrupt JSON (${parseError.message}). ` +
                `Backed up unparsable content to ${backupPath} and starting a clean store.`
            );
        } catch (backupError) {
            console.error("[MEMORY] Failed to back up corrupt memory store:", backupError.message);
        }
    }

    /** Adds Phase-8 v3 fields (with safe defaults) to a v2-or-earlier record, preserving everything else. */
    _upgradeRecordToV3(record) {
        return this._repairRecordShape(record);
    }

    /** Fills in any missing required fields on an already-v3-shaped record (defensive, for hand-edited/partial files). */
    _repairRecordShape(record) {
        const now = Date.now();
        const r = (record && typeof record === "object") ? record : {};
        return {
            id: typeof r.id === "string" && r.id ? r.id : makeId(),
            type: typeof r.type === "string" && r.type ? r.type : DEFAULT_TYPE,
            key: typeof r.key === "string" ? r.key : "",
            value: typeof r.value === "string" ? r.value : cleanValue(r.value),
            source: typeof r.source === "string" && r.source ? r.source : "conversation",
            createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
            updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now,
            confidence: Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 1,
            importance: Number.isFinite(r.importance) ? Math.max(0, Math.min(1, r.importance)) : DEFAULT_IMPORTANCE,
            lastUsedAt: Number.isFinite(r.lastUsedAt) ? r.lastUsedAt : now,
            status: [STATUS.ACTIVE, STATUS.SUPERSEDED, STATUS.DELETED].includes(r.status) ? r.status : STATUS.ACTIVE,
            category: typeof r.category === "string" && r.category ? r.category : (typeof r.type === "string" && r.type ? r.type : DEFAULT_TYPE),
            tags: Array.isArray(r.tags) ? r.tags : [],
            pinned: Boolean(r.pinned),
            expiresAt: Number.isFinite(r.expiresAt) ? r.expiresAt : null,
            accessCount: Number.isFinite(r.accessCount) ? r.accessCount : 0,
            lastAccessedAt: Number.isFinite(r.lastAccessedAt) ? r.lastAccessedAt : now,
            metadata: (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)) ? r.metadata : {}
        };
    }

    /**
     * Converts a v1 `{ "<key>": { value, confidence, source,
     * category, updatedAt } }` facts map into v2 structured records.
     * Pure function of its input — no disk access — so it's easy to
     * unit test in isolation.
     */
    _migrateFromV1(facts) {
        const now = Date.now();

        return Object.keys(facts).map((key) => {
            const old = facts[key] && typeof facts[key] === "object" ? facts[key] : {};
            const updatedAt = Number.isFinite(old.updatedAt) ? old.updatedAt : now;

            return {
                id: makeId(),
                type: resolveType({ category: old.category }),
                key,
                value: cleanValue(old.value),
                source: typeof old.source === "string" && old.source ? old.source : "conversation",
                createdAt: updatedAt,
                updatedAt,
                confidence: Number.isFinite(old.confidence) ? Math.max(0, Math.min(1, old.confidence)) : 1,
                importance: DEFAULT_IMPORTANCE,
                lastUsedAt: updatedAt,
                status: STATUS.ACTIVE
            };
        });
    }

    save() {
        try {
            const payload = JSON.stringify(
                { version: STORE_VERSION, records: this.records, episodic: this.episodic },
                null,
                2
            );

            if (Buffer.byteLength(payload, "utf8") > LIMITS.MAX_STORE_BYTES) {
                console.error(
                    `[MEMORY] Refusing to save: store size exceeds ${LIMITS.MAX_STORE_BYTES} bytes. ` +
                    "Run cleanup (removeExpired/removeDuplicates/compact) to shrink it."
                );
                return false;
            }

            fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });

            // PHASE 8: atomic write — write to a temp file in the same
            // directory, then rename over the real path. This avoids a
            // truncated/corrupt store if the process is killed mid-write
            // (app crash, forced restart, etc.).
            writeMemoryJsonAtomic(this.storagePath, payload);
            return true;
        } catch (error) {
            console.error("[MEMORY] Failed to save memory store:", error.message);
            return false;
        }
    }

    /* ------------------------------------------------------------
       LONG-TERM MEMORY (structured records)
    ------------------------------------------------------------ */

    /**
     * Finds the ACTIVE record for a key, if any. Internal helper —
     * `status !== ACTIVE` records (SUPERSEDED/DELETED, once a later
     * phase starts writing them) are invisible to normal lookups.
     */
    _findActive(key, { includeExpired = false } = {}) {
        const cleanKey = String(key || "").trim();
        if (!cleanKey) return null;
        return this.records.find(r =>
            r.key === cleanKey &&
            r.status === STATUS.ACTIVE &&
            (includeExpired || !isExpired(r))
        ) || null;
    }

    /**
     * Store a fact/record. Overwrites the existing ACTIVE record for
     * the same key in place (updating `value`/`updatedAt`/etc. but
     * preserving `id`/`createdAt`) — same observable behavior as
     * before Phase 7. Never called with invented content — callers
     * must supply text that was actually present in the conversation.
     *
     * Accepts the original options (`confidence`, `source`,
     * `category`) plus two new ones this phase adds (`type`,
     * `importance`) — `type` takes precedence over `category` if
     * both are given; `category` is kept only for backward
     * compatibility with existing call sites.
     */
    remember(key, value, {
        confidence = 1,
        source = "conversation",
        category = "general",
        type,
        importance,
        tags,
        pinned = false,
        expiresAt = null,
        metadata
    } = {}) {
        const rawKey = String(key || "").trim();
        const cleanVal = cleanValue(value);

        // Preserve the original, permissive "no-op on empty input"
        // behavior that pre-Phase-8 callers depend on.
        if (!rawKey || !cleanVal) {
            return null;
        }

        // PHASE 8: everything past this point is real, well-formed
        // input, so it is held to the deterministic safety/size
        // limits. These throw MemoryValidationError (never silently
        // truncate) so callers get a clear, structured error.
        const cleanKey = assertSafeKey(rawKey);
        assertSafeValue(cleanVal);
        const safeCategory = sanitizeShortString(category, "general");
        const safeType = type ? sanitizeShortString(type) : undefined;
        const safeTags = sanitizeTags(tags);
        const safeMetadata = sanitizeMetadata(metadata);
        if (safeCategory) assertSafeKey(safeCategory); // category doubles as an identifier — same danger-key guard
        const safeExpiresAt = expiresAt == null ? null : Number(expiresAt);
        if (safeExpiresAt != null && !Number.isFinite(safeExpiresAt)) {
            throw new MemoryValidationError("expiresAt must be a timestamp (ms) or null.", "INVALID_EXPIRES_AT");
        }

        const now = Date.now();
        const resolvedType = resolveType({ type: safeType, category: safeCategory });
        const resolvedConfidence = Math.max(0, Math.min(1, Number(confidence)));
        const resolvedImportance = Number.isFinite(importance)
            ? Math.max(0, Math.min(1, Number(importance)))
            : DEFAULT_IMPORTANCE;

        const activeRecords = this.records.filter(
            record => record && record.key === cleanKey && record.status === STATUS.ACTIVE
        );

        // Deterministic dedup: normalize (lowercase + collapse
        // whitespace/punctuation, already done by cleanValue) before
        // comparing. Repeating the same fact is not a contradiction —
        // keep the existing record/id and refresh its metadata.
        const normalizedNewValue = cleanVal.toLowerCase();
        const sameValue = activeRecords.find(record => String(record.value || "").toLowerCase() === normalizedNewValue);

        if (sameValue) {
            sameValue.confidence = resolvedConfidence;
            sameValue.source = source;
            sameValue.type = resolvedType;
            sameValue.category = safeCategory || sameValue.category;
            sameValue.importance = resolvedImportance;
            sameValue.updatedAt = now;
            sameValue.lastUsedAt = now;
            if (tags !== undefined) sameValue.tags = safeTags;
            if (pinned !== undefined) sameValue.pinned = Boolean(pinned);
            if (expiresAt !== undefined) sameValue.expiresAt = safeExpiresAt;
            if (metadata !== undefined) sameValue.metadata = safeMetadata;

            // Defensive repair for malformed stores containing multiple
            // ACTIVE records for one key.
            for (const record of activeRecords) {
                if (record !== sameValue) {
                    record.status = STATUS.SUPERSEDED;
                    record.updatedAt = now;
                    console.log(`[MEMORY] Superseded duplicate: ${cleanKey} = "${record.value}" (replaced by "${cleanVal}")`);
                }
            }
        } else {
            if (this.records.length >= LIMITS.MAX_RECORDS) {
                throw new MemoryValidationError(
                    `Memory store is at its limit of ${LIMITS.MAX_RECORDS} records. Run cleanup before adding more.`,
                    "STORE_FULL"
                );
            }

            // A different value for the same key is a contradiction/
            // replacement. Preserve the old record for history, but
            // make it non-active before creating the new ACTIVE record.
            // Pinned records are preserved (kept ACTIVE-history-wise via
            // SUPERSEDED, never silently dropped) — pinning only
            // protects against cleanup, not against an explicit update.
            for (const record of activeRecords) {
                record.status = STATUS.SUPERSEDED;
                record.updatedAt = now;
                console.log(`[MEMORY] Superseded: ${cleanKey} = "${record.value}" (replaced by "${cleanVal}")`);
            }

            this.records.push({
                id: makeId(),
                type: resolvedType,
                category: safeCategory || resolvedType,
                key: cleanKey,
                value: cleanVal,
                source,
                createdAt: now,
                updatedAt: now,
                confidence: resolvedConfidence,
                importance: resolvedImportance,
                lastUsedAt: now,
                lastAccessedAt: now,
                accessCount: 0,
                status: STATUS.ACTIVE,
                tags: safeTags,
                pinned: Boolean(pinned),
                expiresAt: safeExpiresAt,
                metadata: safeMetadata
            });
        }

        this.save();

        const stored = this._findActive(cleanKey, { includeExpired: true });
        console.log(`[MEMORY] Stored: ${cleanKey} = "${cleanVal}" (source: ${source}, type: ${resolvedType})`);

        return stored;
    }

    recall(key) {
        const entry = this._findActive(key);
        if (!entry) return null;

        // A read is a use — keep lastUsedAt/accessCount/lastAccessedAt
        // current for future relevance-based retrieval to build on.
        // Best-effort: a failed save here must never make recall() fail.
        const now = Date.now();
        entry.lastUsedAt = now;
        entry.lastAccessedAt = now;
        entry.accessCount = (Number.isFinite(entry.accessCount) ? entry.accessCount : 0) + 1;
        this.save();

        return entry.value;
    }

    /**
     * Returns the full structured record for a key (id/type/key/
     * value/source/createdAt/updatedAt/confidence/importance/
     * lastUsedAt/status/category/tags/pinned/expiresAt/accessCount/
     * lastAccessedAt/metadata), or null.
     */
    recallEntry(key) {
        const entry = this._findActive(key);
        return entry ? { ...entry } : null;
    }

    /**
     * PHASE 8 — alias of recallEntry() using the brief's preferred
     * name, and tracks access the same way recall() does.
     */
    get(key) {
        const entry = this._findActive(key);
        if (!entry) return null;
        const now = Date.now();
        entry.lastAccessedAt = now;
        entry.accessCount = (Number.isFinite(entry.accessCount) ? entry.accessCount : 0) + 1;
        this.save();
        return { ...entry };
    }

    /**
     * Return ACTIVE records whose key/type/value matches a simple
     * case-insensitive query. This is intentionally bounded and local;
     * it is used by natural-language memory commands rather than by the
     * general knowledge/search pipeline.
     */
    /**
     * Deterministic search with predictable ordering:
     *   1. exact key match
     *   2. exact normalized value match
     *   3. category match
     *   4. tag match
     *   5. partial text match (key/type/category/value/tags)
     *   6. ties broken by importance desc, then recency (updatedAt) desc
     * No AI/embeddings/fuzzy similarity — pure deterministic rules.
     */
    search(query, { limit = 20 } = {}) {
        const needle = String(query || "").trim().toLowerCase();
        const max = Math.max(1, Math.min(100, Number(limit) || 20));
        const pool = this.allRecords();

        if (!needle) {
            return pool
                .sort((a, b) => (b.importance - a.importance) || (b.updatedAt - a.updatedAt))
                .slice(0, max);
        }

        const RANK = { key: 0, value: 1, category: 2, tag: 3, partial: 4 };
        const stopWords = new Set(["what", "do", "you", "about", "the", "my", "is", "in", "on", "and", "or", "please", "jarvis", "kya", "hai", "mere", "meri", "mujhe", "ke", "baare", "mein"]);
        const tokens = [...new Set(needle.split(/[^a-z0-9\u0900-\u097f]+/i).filter(token => token.length > 1 && !stopWords.has(token)))];

        const scored = [];
        for (const record of pool) {
            let bestRank = null;
            let tokenScore = 0;
            if (String(record.key || "").toLowerCase() === needle) bestRank = RANK.key;
            else if (String(record.value || "").toLowerCase() === needle) bestRank = RANK.value;
            else if (String(record.category || record.type || "").toLowerCase() === needle) bestRank = RANK.category;
            else if ((record.tags || []).some(t => String(t).toLowerCase() === needle)) bestRank = RANK.tag;
            else if (
                [record.key, record.type, record.category, record.value, ...(record.tags || [])]
                    .some(value => String(value || "").toLowerCase().includes(needle))
            ) bestRank = RANK.partial;

            if (bestRank === null && tokens.length) {
                const keyText = String(record.key || "").toLowerCase();
                const categoryText = `${record.type || ""} ${record.category || ""} ${(record.tags || []).join(" ")}`.toLowerCase();
                const valueText = String(record.value || "").toLowerCase();
                for (const token of tokens) {
                    if (keyText.includes(token)) tokenScore += 3;
                    if (categoryText.includes(token)) tokenScore += 2;
                    if (valueText.includes(token)) tokenScore += 1;
                }
                if (tokenScore > 0) bestRank = RANK.partial;
            }

            if (bestRank !== null) scored.push({ record, rank: bestRank, tokenScore });
        }

        return scored
            .sort((a, b) =>
                (a.rank - b.rank) ||
                (b.tokenScore - a.tokenScore) ||
                (b.record.importance - a.record.importance) ||
                (b.record.updatedAt - a.record.updatedAt)
            )
            .map(s => s.record)
            .slice(0, max);
    }

    /**
     * PHASE 8 — deterministic filtered listing. Does not do free-text
     * matching (use search() for that); this is for structured
     * browsing (by category/type/tag/pinned) and pagination.
     */
    list({ category, type, tag, pinned, includeExpired = false, limit = 100, offset = 0 } = {}) {
        let records = includeExpired ? this.allRecordsIncludingExpired() : this.allRecords();

        if (category) records = records.filter(r => r.category === category);
        if (type) records = records.filter(r => r.type === type);
        if (tag) records = records.filter(r => (r.tags || []).includes(String(tag).toLowerCase()));
        if (pinned !== undefined) records = records.filter(r => Boolean(r.pinned) === Boolean(pinned));

        records = records.sort((a, b) => (b.importance - a.importance) || (b.updatedAt - a.updatedAt));

        const start = Math.max(0, Number(offset) || 0);
        const max = Math.max(1, Math.min(1000, Number(limit) || 100));
        return records.slice(start, start + max);
    }

    /** Soft-delete the ACTIVE record for a key. */
    forgetByKey(key) {
        const cleanKey = String(key || "").trim();
        const record = this.records.find(r => r.key === cleanKey && r.status === STATUS.ACTIVE);
        if (!record) return false;

        record.status = STATUS.DELETED;
        record.updatedAt = Date.now();
        this.save();
        return true;
    }

    /** Soft-delete all ACTIVE records of a structured type. */
    forgetByType(type) {
        const cleanType = String(type || "").trim();
        if (!cleanType) return 0;

        let count = 0;
        const now = Date.now();
        for (const record of this.records) {
            if (record.status === STATUS.ACTIVE && record.type === cleanType) {
                record.status = STATUS.DELETED;
                record.updatedAt = now;
                count++;
            }
        }

        if (count) this.save();
        return count;
    }

    /** Soft-delete all ACTIVE records. History remains auditable. */
    forgetAll() {
        let count = 0;
        const now = Date.now();
        for (const record of this.records) {
            if (record.status === STATUS.ACTIVE) {
                record.status = STATUS.DELETED;
                record.updatedAt = now;
                count++;
            }
        }

        if (count) this.save();
        return count;
    }

    /**
     * Hard-deletes the ACTIVE record for a key. Same observable
     * behavior as before Phase 7 (removes it outright; a second call
     * returns false). Kept as a hard delete deliberately — a future
     * memory-commands phase may prefer a soft delete
     * (`status: DELETED`) for auditability instead; that's a
     * decision for that phase, not this one.
     */
    forget(key) {
        const cleanKey = String(key || "").trim();
        const index = this.records.findIndex(r => r.key === cleanKey && r.status === STATUS.ACTIVE);

        if (index === -1) {
            return false;
        }

        this.records.splice(index, 1);
        this.save();
        return true;
    }

    /**
     * PHASE 8 — explicit in-place update of a record's metadata
     * fields (tags/pinned/expiresAt/importance/category/metadata)
     * WITHOUT treating it as a value contradiction (no supersede/new
     * record). Use remember(key, newValue, ...) instead when the
     * *value* itself changes.
     */
    update(key, patch = {}) {
        const record = this._findActive(key, { includeExpired: true });
        if (!record) return null;

        if (patch.tags !== undefined) record.tags = sanitizeTags(patch.tags);
        if (patch.pinned !== undefined) record.pinned = Boolean(patch.pinned);
        if (patch.expiresAt !== undefined) {
            const val = patch.expiresAt === null ? null : Number(patch.expiresAt);
            if (val !== null && !Number.isFinite(val)) {
                throw new MemoryValidationError("expiresAt must be a timestamp (ms) or null.", "INVALID_EXPIRES_AT");
            }
            record.expiresAt = val;
        }
        if (patch.importance !== undefined) {
            record.importance = Math.max(0, Math.min(1, Number(patch.importance)));
        }
        if (patch.category !== undefined) {
            const safeCategory = sanitizeShortString(patch.category, record.category);
            if (safeCategory) assertSafeKey(safeCategory);
            record.category = safeCategory;
        }
        if (patch.metadata !== undefined) {
            record.metadata = sanitizeMetadata(patch.metadata);
        }
        if (patch.confidence !== undefined) {
            record.confidence = Math.max(0, Math.min(1, Number(patch.confidence)));
        }

        record.updatedAt = Date.now();
        this.save();
        return { ...record };
    }

    /**
     * PHASE 8 — irreversible wipe of every record (ACTIVE and
     * historical). This is the one truly destructive operation in
     * the store and REQUIRES `{ confirm: true }`; calling it without
     * confirmation is a no-op that reports what would happen, so a
     * caller (voice command, IPC, etc.) can surface a confirmation
     * prompt to the user first. Never triggered implicitly.
     */
    clear({ confirm = false } = {}) {
        const total = this.records.length;
        if (!confirm) {
            return {
                cleared: false,
                requiresConfirmation: true,
                wouldRemove: total,
                message: `This would permanently delete ${total} memory record(s), including history. Call clear({ confirm: true }) to proceed.`
            };
        }

        this.records = [];
        this.episodic = [];
        this.save();
        return { cleared: true, requiresConfirmation: false, removed: total };
    }

    /** PHASE 8 — remove ACTIVE records whose expiresAt has passed. Pinned or permanent (no expiresAt) records are never touched. */
    removeExpired() {
        const now = Date.now();
        const before = this.records.length;
        this.records = this.records.filter(r => !(r.status === STATUS.ACTIVE && isExpired(r, now)));
        const removed = before - this.records.length;
        if (removed) this.save();
        return removed;
    }

    /**
     * PHASE 8 — deterministic duplicate removal: for ACTIVE records
     * sharing the same normalized (key.toLowerCase(), value
     * normalized) pair, keep the most recently updated one (pinned
     * records are always kept over unpinned ones). No AI similarity.
     */
    removeDuplicates() {
        const groups = new Map();
        for (const r of this.records) {
            if (r.status !== STATUS.ACTIVE) continue;
            const groupKey = `${String(r.key).toLowerCase()}::${String(r.value).toLowerCase().replace(/\s+/g, " ").trim()}`;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(r);
        }

        let removed = 0;
        const toDelete = new Set();
        for (const group of groups.values()) {
            if (group.length <= 1) continue;
            const keep = [...group].sort((a, b) =>
                (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt)
            )[0];
            for (const r of group) {
                if (r !== keep) {
                    toDelete.add(r.id);
                    removed++;
                }
            }
        }

        if (removed) {
            this.records = this.records.filter(r => !toDelete.has(r.id));
            this.save();
        }
        return removed;
    }

    /** PHASE 8 — drops hard-deleted history noise: purges SUPERSEDED/DELETED records older than `olderThanMs` (default 90 days), never touches ACTIVE or pinned records. */
    compact({ olderThanMs = 90 * 24 * 60 * 60 * 1000 } = {}) {
        const cutoff = Date.now() - Math.max(0, Number(olderThanMs) || 0);
        const before = this.records.length;
        this.records = this.records.filter(r =>
            r.status === STATUS.ACTIVE || r.pinned || r.updatedAt > cutoff
        );
        const removed = before - this.records.length;
        if (removed) this.save();
        return removed;
    }

    /** PHASE 8 — read-only structural check of the in-memory store; returns a list of problems found (empty array = healthy). */
    validate() {
        const problems = [];
        const seenIds = new Set();
        for (const r of this.records) {
            if (!r || typeof r !== "object") { problems.push({ issue: "non-object-record" }); continue; }
            if (!r.id) problems.push({ issue: "missing-id", key: r.key });
            else if (seenIds.has(r.id)) problems.push({ issue: "duplicate-id", id: r.id });
            else seenIds.add(r.id);
            if (!r.key) problems.push({ issue: "missing-key", id: r.id });
            if (typeof r.value !== "string") problems.push({ issue: "non-string-value", id: r.id });
            if (![STATUS.ACTIVE, STATUS.SUPERSEDED, STATUS.DELETED].includes(r.status)) {
                problems.push({ issue: "invalid-status", id: r.id, status: r.status });
            }
        }
        const activeByKey = new Map();
        for (const r of this.records) {
            if (r.status !== STATUS.ACTIVE) continue;
            const count = (activeByKey.get(r.key) || 0) + 1;
            activeByKey.set(r.key, count);
            if (count > 1) problems.push({ issue: "multiple-active-for-key", key: r.key });
        }
        return problems;
    }

    /** PHASE 8 — best-effort deterministic repair of issues validate() finds (defensive repair for malformed shape; does not resolve multiple-active-for-key beyond keeping the most recently updated one). */
    repair() {
        let changed = 0;
        this.records = this.records.map(r => this._repairRecordShape(r));

        const activeByKey = new Map();
        for (const r of this.records) {
            if (r.status !== STATUS.ACTIVE) continue;
            if (!activeByKey.has(r.key)) activeByKey.set(r.key, []);
            activeByKey.get(r.key).push(r);
        }
        for (const group of activeByKey.values()) {
            if (group.length <= 1) continue;
            const keep = [...group].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            for (const r of group) {
                if (r !== keep) {
                    r.status = STATUS.SUPERSEDED;
                    r.updatedAt = Date.now();
                    changed++;
                }
            }
        }

        if (changed) this.save();
        return { repaired: changed };
    }

    /** PHASE 8 — deterministic statistics. Every number is computed directly from the live in-memory records; nothing is estimated or fabricated. */
    stats() {
        const now = Date.now();
        const byCategory = {};
        const byType = {};
        let active = 0, superseded = 0, deleted = 0, pinned = 0, expired = 0;
        let recentlyUpdated = 0, recentlyAccessed = 0;
        const dayMs = 24 * 60 * 60 * 1000;

        for (const r of this.records) {
            if (r.status === STATUS.ACTIVE) {
                if (isExpired(r, now)) {
                    expired++;
                } else {
                    active++;
                    byCategory[r.category || "uncategorized"] = (byCategory[r.category || "uncategorized"] || 0) + 1;
                    byType[r.type] = (byType[r.type] || 0) + 1;
                    if (r.pinned) pinned++;
                    if (now - r.updatedAt <= dayMs) recentlyUpdated++;
                    if (r.lastAccessedAt && now - r.lastAccessedAt <= dayMs) recentlyAccessed++;
                }
            } else if (r.status === STATUS.SUPERSEDED) {
                superseded++;
            } else if (r.status === STATUS.DELETED) {
                deleted++;
            }
        }

        // Deterministic duplicate count preview (does not mutate anything).
        const groups = new Map();
        for (const r of this.records) {
            if (r.status !== STATUS.ACTIVE) continue;
            const gk = `${String(r.key).toLowerCase()}::${String(r.value).toLowerCase().trim()}`;
            groups.set(gk, (groups.get(gk) || 0) + 1);
        }
        let duplicateCount = 0;
        for (const count of groups.values()) {
            if (count > 1) duplicateCount += count - 1;
        }

        return {
            version: this.storeVersion || STORE_VERSION,
            totalRecords: this.records.length,
            active,
            superseded,
            deleted,
            expired,
            pinned,
            byCategory,
            byType,
            recentlyUpdated,
            recentlyAccessed,
            duplicateCount,
            workingMemorySize: this.working.length
        };
    }

    /**
     * Legacy-shaped view of all ACTIVE facts:
     * `{ "<key>": { value, confidence, source, category, updatedAt, ... } }`.
     * Every caller written before Phase 7 (main.js's IPC handlers,
     * `buildContextBlock()`, existing tests) keeps working unchanged
     * against this — the new structured fields (id, type, importance,
     * lastUsedAt, status) are included too, additively, for any
     * caller that wants them.
     */
    allFacts() {
        const out = {};
        for (const r of this.records) {
            if (r.status !== STATUS.ACTIVE || isExpired(r)) continue;
            out[r.key] = {
                ...r,
                category: r.type // legacy alias so old readers of `.category` still see something sensible
            };
        }
        return out;
    }

    /**
     * New in Phase 7: the full list of ACTIVE structured records
     * (not the legacy key-map projection). Use this when a caller
     * needs `id`/`type`/`importance`/`lastUsedAt`/`status` directly,
     * e.g. a future relevance-based retrieval phase.
     */
    allRecords() {
        return this.records
            .filter(r => r.status === STATUS.ACTIVE && !isExpired(r))
            .map(r => ({ ...r }));
    }

    /** PHASE 8 — same as allRecords() but includes expired ACTIVE records (for stats/cleanup tooling). */
    allRecordsIncludingExpired() {
        return this.records.filter(r => r.status === STATUS.ACTIVE).map(r => ({ ...r }));
    }

    /**
     * Extract explicit memory candidates without writing anything.
     *
     * This is the inspection/classification half of Phase 8. It is
     * intentionally public so UI/debug tooling and future retrieval
     * phases can see what the classifier decided without having to
     * trigger persistence.
     */
    extractCandidates(text) {
        const message = String(text || "").trim();
        if (!message || hasSensitiveMemoryContent(message)) {
            return [];
        }

        const candidates = [];
        const seenKeys = new Set();

        for (const rule of [...TEMPORARY_RULES, ...EXTRACTION_RULES]) {
            const match = message.match(rule.regex);
            if (!match || !match[1]) continue;

            const rawValue = typeof rule.valueFromMatch === "function"
                ? rule.valueFromMatch(match)
                : match[1];
            const value = normalizeCapturedValue(rawValue);

            if (!value || value.length > 120 || /[?!]/.test(value)) continue;
            if (typeof rule.validate === "function" && !rule.validate(value)) continue;

            // A temporary rule is always temporary. Other rules become
            // temporary only when the statement explicitly scopes the
            // fact to the current moment/session.
            const retention = rule.retention === RETENTION.TEMPORARY ||
                (TEMPORARY_MARKERS.test(message) && rule.category === "context")
                ? RETENTION.TEMPORARY
                : RETENTION.LONG_TERM;

            const key = typeof rule.transformKey === "function"
                ? rule.transformKey(value)
                : rule.key;

            // One message may contain overlapping rules for the same
            // concept. Keep the first, most specific match and avoid
            // writing duplicate records.
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            candidates.push({
                key,
                value,
                category: rule.category,
                type: rule.type || resolveType({ category: rule.category }),
                confidence: retention === RETENTION.TEMPORARY ? 0.7 : 0.9,
                importance: Number.isFinite(rule.importance)
                    ? rule.importance
                    : (IMPORTANCE_BY_CATEGORY[rule.category] || DEFAULT_IMPORTANCE),
                retention
            });
        }

        return candidates;
    }

    /**
     * Return the classifier decision without persisting it.
     *
     * `TEMPORARY` is also the safe result for ordinary questions,
     * commands, and sensitive statements. A message is only
     * `LONG_TERM` when a specific durable candidate was extracted.
     */
    classifyMessage(text) {
        const message = String(text || "").trim();
        const sensitive = Boolean(message && hasSensitiveMemoryContent(message));
        const candidates = sensitive ? [] : this.extractCandidates(message);
        const longTerm = candidates.filter(item => item.retention === RETENTION.LONG_TERM);
        const temporary = candidates.filter(item => item.retention === RETENTION.TEMPORARY);

        return {
            retention: longTerm.length > 0 ? RETENTION.LONG_TERM : RETENTION.TEMPORARY,
            candidates,
            longTerm,
            temporary,
            blocked: sensitive,
            reason: sensitive
                ? "sensitive-content"
                : (candidates.length ? null : "no-explicit-memory-statement")
        };
    }

    /**
     * Run Phase 8 extraction and persist LONG_TERM candidates only.
     * TEMPORARY candidates are returned for callers that want to use
     * them during the current turn, but they never enter memory.json.
     */
    extractFromMessage(text, { source = "conversation" } = {}) {
        const classification = this.classifyMessage(text);
        const stored = [];

        for (const candidate of classification.longTerm) {
            const entry = this.remember(candidate.key, candidate.value, {
                confidence: candidate.confidence,
                source,
                category: candidate.category,
                type: candidate.type,
                importance: candidate.importance
            });

            if (entry) {
                stored.push({
                    key: candidate.key,
                    retention: candidate.retention,
                    ...entry
                });
            }
        }

        return stored;
    }

    /**
     * Build a short, explicit context block for the AI system prompt.
     * Only known facts are included — nothing is fabricated, and if
     * there are no facts yet this returns an empty string so the
     * prompt doesn't imply memory exists when it doesn't.
     */
    buildContextBlock() {
        const facts = this.allFacts();
        const keys = Object.keys(facts);

        if (keys.length === 0) {
            return "";
        }

        const lines = keys
            .sort()
            .map((key) => `- ${key}: ${facts[key].value}`);

        return `KNOWN FACTS ABOUT THE USER (only use these if relevant; never contradict them):\n${lines.join("\n")}`;
    }

    /* ------------------------------------------------------------
       WORKING MEMORY (short-term, in-process, not persisted)
    ------------------------------------------------------------ */

    pushTurn(role, text) {
        const clean = String(text || "").trim();

        if (!clean) {
            return;
        }

        this.working.push({ role, text: clean, timestamp: Date.now() });

        if (this.working.length > MAX_WORKING_MEMORY) {
            this.working = this.working.slice(-MAX_WORKING_MEMORY);
        }
    }

    getWorkingMemory() {
        return [...this.working];
    }

    clearWorkingMemory() {
        this.working = [];
    }
}

module.exports = {
    MemoryEngine,
    FACT_RULES,
    EXTRACTION_RULES,
    RETENTION,
    STATUS,
    // PHASE 8 additions
    MemoryValidationError,
    MEMORY_LIMITS: LIMITS,
    STORE_VERSION
};
