# PHASE 8 — MEMORY ARCHITECTURE AUDIT

## 1. Current memory implementation

There is exactly **one** long-term memory engine in the project:

- `src/ai/memory.js` — `MemoryEngine` class. Instantiated once, as a
  singleton, in `main.js` (`initMemory()` → `memoryEngine`), and
  bridged onto `global.JARVISMemory` for legacy callers.

No second/competing "vector DB", "embeddings store", or duplicate
JSON-backed memory module exists anywhere in `src/`, `renderer/`, or
`test/`. `grep -ri "remember\|forget\|saveMemory\|loadMemory"` across
the project resolves to this one engine plus its call sites — there
is no parallel implementation to reconcile.

Prior phases (per the file's own header comments) had already evolved
this file through several sub-phases:

- v1 store: `{ facts: { "<key>": {...} }, episodic: [] }`
- v2 store (current, pre-Phase-8): `{ version: 2, records: [...],
  episodic: [] }`, with an in-memory `_migrateFromV1()` step that
  transparently upgrades any v1 file the first time it is loaded and
  re-saves it as v2. No data is lost in that migration.
- Deterministic, regex-based `EXTRACTION_RULES` / `TEMPORARY_RULES`
  for pulling explicit first-person facts out of conversational text
  (name, location, occupation, preference, interest, project,
  workflow — English + a few common Hinglish phrasings), with a
  `SENSITIVE_MEMORY_PATTERNS` block-list (passwords, API keys, card
  numbers) that a fact is never extracted from.
- Contradiction handling: `remember()` already supersedes (not
  duplicates) the previous ACTIVE record for a key when a genuinely
  different value is stored for the same key, while a **repeated**
  identical value just refreshes metadata on the existing record
  (this is the existing deduplication behavior for the same key).
- Two-tier memory: `working` (in-process array, cleared on restart,
  last 20 turns) vs. structured `records` (persisted to
  `src/database/memory.json`).

## 2. Current persistent files

- `src/database/memory.json` — the long-term memory store (was empty
  at audit time: `{}`/blank on disk, i.e. no memories saved yet in
  this checkout).
- `src/database/history.json` — chat history (separate system, see
  §7 below).
- `src/database/consciousness.json`, `settings.json`,
  `src/database/evolution/*` — unrelated persistence for other
  subsystems, untouched by this phase.

## 3. Current public API (pre-Phase-8)

```
remember(key, value, opts)      // create-or-update (supersede) a record
recall(key)                     // -> value or null
recallEntry(key)                // -> full record or null
search(query, { limit })        // simple case-insensitive substring search
forget(key)                     // hard delete the ACTIVE record for a key
forgetByKey(key)                // soft delete (status: DELETED)
forgetByType(type)              // soft delete all ACTIVE of a type
forgetAll()                     // soft delete every ACTIVE record
allFacts()                      // legacy key-map view of ACTIVE records
allRecords()                    // array view of ACTIVE records
extractCandidates(text)         // classify a message, no writes
classifyMessage(text)           // retention decision (LONG_TERM/TEMPORARY)
extractFromMessage(text, opts)  // classify + persist LONG_TERM candidates
buildContextBlock()             // short prompt-ready summary of all facts
pushTurn / getWorkingMemory / clearWorkingMemory   // working memory tier
```

## 4. Existing IPC (main.js)

```
memory:get-facts
memory:remember-message
memory:search
memory:forget-statement
memory:forget-key
memory:forget-type
memory:forget-all
memory:forget-fact
```
All routed through the one `memoryEngine` singleton; `preload.js`
exposes a matching subset to the renderer under contextIsolation.

## 5. Duplicate memory systems

None found. `global.JARVISMemory` / `global.MemoryManager` /
`global.MemoryManagerAgent` are three *names* the legacy
`saveToAvailableMemory()` / `readFromAvailableMemory()` bridge in
`main.js` will look for, but only `global.JARVISMemory` is ever
actually set (by `initMemory()`), and it wraps the same
`memoryEngine` — so this is one engine with three optional bridge
names, not three engines.

## 6. Missing capabilities (what Phase 8 adds)

The existing engine already satisfies a large fraction of the Phase 8
brief. What is genuinely missing:

- Record fields: `tags`, `pinned`, `expiresAt`, `accessCount`,
  `lastAccessedAt` (only `lastUsedAt` existed), `metadata`,
  `category` as a first-class stored field (previously only used
  transiently to resolve `type`).
- No `expiresAt` / TTL support or expiration-aware retrieval at all.
- No size/security limits (a value or metadata object of unbounded
  size could be written).
- No structured input validation against prototype-pollution keys
  (`__proto__`, `constructor`, `prototype`) in `key`/`category`/
  `tags`/`metadata`.
- No corrupt-file backup on load failure — a corrupt file was simply
  discarded (`records = []`) with a console warning, losing data.
- No atomic write (`writeFileSync` direct to the real path — a crash
  mid-write can corrupt the store).
- No `list()`, `get()`, `update()`, `clear()`, `stats()` convenience
  API (callers had to compose `allRecords()`/`recallEntry()`/
  `remember()` manually).
- `forgetAll()` had no confirmation gate — Phase 8 requires that any
  "delete everything" path require an explicit `confirm: true`.
- No deterministic duplicate-detection across *different* keys with
  the same normalized value (only same-key contradiction handling
  existed).
- No store version bump / migration path beyond v1→v2.
- No memory statistics API.
- No dedicated Phase 8 test file exercising all of the above.

## 7. Chat history vs. memory (confirmed separate)

`main.js` maintains `chatHistory` (`src/database/history.json`)
completely independently of `memoryEngine`. `saveToAvailableMemory`/
`readFromAvailableMemory` write *individual keyed facts* through the
memory bridge — they are never used to dump the whole transcript into
memory.json. Phase 8 preserves this separation and does not touch
`history.json` or its save/load functions.

## 8. Exact files changed by Phase 8

- `src/ai/memory.js` — upgraded in place (v2 → v3 schema, additive;
  every pre-Phase-8 method keeps its existing signature and
  behavior).
- `main.js` — additive IPC channels only
  (`memory:list`, `memory:get`, `memory:update`, `memory:stats`,
  `memory:clear`). No existing channel's behavior changes.
- `preload.js` — additive renderer bridge functions for the new
  channels only.
- `test/long-term-memory-phase8.test.js` — new.
- `test/no-ai-verification.test.js` — new.
- `PHASE8_MEMORY_ARCHITECTURE_AUDIT.md` — new (this file).
- `PHASE8_FINAL_REPORT.md` — new (final report).

Everything else (Goal Registry, Checkpoint, Evolution Engine,
Research Provider, Task Store/Planner/Executor, Classifier,
SafetyGate, SystemActionAdapter, BrowserActionAdapter, chat history)
is untouched.
