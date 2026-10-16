# JARVIS — Memory + Conversation Context Upgrade — Status

This file tracks progress on the "ChatGPT-like Memory + Conversation
Context System" upgrade. Read this first in any future session before
continuing the work.

## Current phase

**Phase 15 — COMPLETE.** Final integration and regression verification have been completed for the planned memory/context upgrade.

## POST-COMPLETION BUG FIX (read this first)

After Phase 15 was marked complete, the user reported memory "isn't
working" without further detail. A full static/structural audit (every
file syntax-checked, every `require()` path resolved, every IPC
channel cross-checked between `main.js`/`preload.js`, `main.js`
successfully booted end-to-end against a mocked `electron` module)
found no crashes or wiring gaps — but a **real functional bug** was
found by actually simulating the brief's Test 4 scenario end-to-end
with the real `MemoryEngine`, real `ConsciousnessLayer`, and real
`chat.js` router (not the per-phase mocks each of the 19 test files
uses):

**Bug:** `renderer/js/chat.js` skips its fallback
`window.jarvis.ai.recordTurn(...)` call (the thing that triggers
`MemoryEngine.extractFromMessage()` on the main-process side)
whenever a response came from ROUTE 7 / `processConsciousness()` —
that route sets `response.consciousnessRecorded = true` specifically
to avoid double-pushing the turn into working memory. But `main.js`'s
`consciousness:respond` IPC handler — the thing ROUTE 7 actually
calls — never called `memory.extractFromMessage()` itself either.

**Net effect:** any bare statement that doesn't match a more specific
route — which includes the brief's own Test 4 wording, **"My name is
Nakul."** with no "remember that" prefix — fell all the way through
to ROUTE 7 and its fact was **silently never saved**. Asking "what's
my name?" afterwards correctly said it didn't know. This is very
likely (part of) what the user meant by "memory isn't working" — it's
exactly the documented acceptance test, silently broken, for 15
phases, because every phase's own test mocked
`consciousnessRespond`/`recordTurn` directly rather than exercising
the real main.js handler end-to-end.

**Fix:** `main.js`'s `consciousness:respond` handler now also calls
`memory.extractFromMessage(text, { source: "conversation" })` itself
— extraction now happens at the source regardless of which route ends
up answering the message, rather than depending on the renderer
calling back in (which it deliberately doesn't, for this route).

**Verified:**
- Proved the bug existed first (real `chat.js.sendMessage("My name is
  Nakul.")` with `recordTurn` instrumented → called 0 times).
- Applied the fix, re-ran the same simulation → fact saved
  immediately, and a simulated-restart + "What is my name?" correctly
  answered "Aapka naam Nakul hai."
- Temporarily reverted the fix and confirmed the new regression
  test's source-check fails without it, then restored the fix and
  confirmed it passes again — the test is a real guard, not a
  tautology.
- Full suite (161 tests, up from 158) passes with the fix in place.
- Checked the other two places a message can trigger memory
  extraction (`handleAIAsk` / the disabled `ai:ask` channel, and the
  `consciousness:record-turn` channel used elsewhere) — both already
  called `extractFromMessage()` correctly; `consciousness:respond`
  was the only gap.

**New test:** `test/memory-extraction-crossphase-regression.test.js`
(3 tests — a source-level check that the fix is present, plus two
full end-to-end simulations of the brief's Test 4 and Test 5 using
real `MemoryEngine`/`ConsciousnessLayer`/`chat.js`, not mocks).

**Still unverified (same limitation as every phase before this):**
this assistant has no display/audio/network access, so the actual
Electron app has still never been launched here. If "memory isn't
working" was about something else entirely (a crash, a different
feature, something visible only in the real UI), that hasn't been
found yet — the person should describe exactly what happened (error
text, which feature, what steps) so a next pass can target it
directly instead of re-auditing things that already check out.

## Audit summary (read before touching anything)

This project is much larger than a typical "add memory to a chatbot"
task:

- ~300 files, ~130,000+ lines total. `main.js` (Electron main
  process) is ~11,000 lines. `renderer/js/brain/` alone is
  ~130,000 lines across a large agent system (`AgentManager`,
  `memoryManagerAgent`, `reasoningAgent`, `planningAgent`,
  `decisionAgent`, multiple "learning" engines, etc.).
- **There is no cloud LLM wired in right now.** `main.js`'s
  `handleAIAsk()` explicitly always returns `handled:false` — the
  code comment says "Cloud AI removed by request." Every chat reply
  currently comes from a large local, rule-based, multi-route router
  in `renderer/js/chat.js` (`processBrainRouter()`), NOT from an LLM.
  `chat.js`'s own config has `aiFallback: false` with a comment
  confirming this is intentional. If real LLM-backed chat is wanted,
  that is a separate, explicit decision for the user to make later —
  it is out of scope for this memory/context upgrade unless they ask.
- A basic memory engine already exists: `src/ai/memory.js`
  (`MemoryEngine`). It stores simple regex-extracted key/value facts
  (e.g. `user.name`) in `src/database/memory.json`, plus an
  in-process (non-persisted) working-memory turn buffer. It has
  **no** pending-intent system, no SQLite, no summarization, no
  supersede/contradiction handling.
- `renderer/js/brain/agents/_deprecated_duplicate_memoryAgent/` exists
  — a sign an earlier memory-related effort was started and abandoned
  mid-way. Left untouched; not part of this upgrade's active code
  paths.
- `renderer/js/chat.js`'s `processBrainRouter()` is the real chat
  pipeline: file-context → natural-intent engine → consciousness
  fast-path → chit-chat → memory → knowledge → tasks → goals → agent
  health → vision status → Wikipedia → external data sources →
  browser → offline commands → offline brain → specialized agents →
  AI fallback (disabled) → local consciousness. All plain
  `<script defer>` globals (`window.JARVISXxx`), no bundler.
- Confirmed bug matching the brief's own Test 1/2 examples: "weather
  batao" with no city silently defaulted to Delhi instead of asking.
  Fixed in Phase 1 (below).
- Gap found in Phase 1, fixed in Phase 2: "time batao" (generic
  Hinglish, no location) did not reach the location/timezone skill at
  all — `isDataSourceCommand`'s time regex required "time in X" or
  "timezone" literally. Phase 2 broadened that detection (see Phase 2
  details below) while leaving the existing explicit English
  local-device-time commands ("what's the time", "current time", etc.)
  untouched.
- **Environment limits for THIS assistant, every phase:** no network
  access (so no `npm install`, e.g. can't add `better-sqlite3` without
  the user installing it locally first) and no display/audio device
  (so Electron/STT/TTS/voice cannot actually be launched and manually
  verified here). All testing is via Node's built-in test runner
  (`node --test`), loading the real source files directly — the same
  approach the project's own `test/*.test.js` files already use — not
  a live run of the app. The user should still do a quick manual
  smoke test after each phase's zip if that matters to them.

## Roadmap (phases, subject to revision as work progresses)

1. **Foundation — Conversation Context + Pending Intent core, wired
   to WEATHER.** ✅ DONE (Phase 1).
2. **Extend pending-intent parameter resolution to more skills** —
   TIME ✅ DONE (Phase 2). CURRENCY ✅ DONE (Phase 3). NEWS
   deliberately left alone (Phase 3 details). Still open: SEARCH
   (general web search remains untouched by design — see Phase 4),
   BROWSER-as-a-destination-picker. **Multi-turn multi-parameter
   collection (Test 3) ✅ DONE (Phase 4)** — demonstrated via a
   curated PRODUCT_SEARCH flow (category → budget → use case), built
   on the same architecture as the single-parameter skills with no
   changes needed to `ConversationContextManager`/`PendingIntentManager`.
3. **Reference resolution** — "it", "that", "the previous one",
   topic continuity (Test 7's NASA example). ✅ DONE (Phase 5) — new
   `ReferenceResolver.js` rewrites a short follow-up's pronoun/deictic
   word to the active topic's subject before routing, and
   `ConversationContextManager.setTopic()` (storage only since Phase
   1) is now actually written to from the KNOWLEDGE/COUNTRY_INFO/
   LOCATION/POKEMON/BOOK_SEARCH/TV_SEARCH/RECIPE_SEARCH/GITHUB_SEARCH
   natural-intent answers, the regex-based knowledge route, and the
   explicit Wikipedia-topic route.
4. **Yes/No confirmation wiring** — `setConfirmation()` storage exists
   (Phase 1); wire an actual skill through it (Test 8's YouTube
   example) and generalize haan/nahi handling. ✅ DONE (Phase 6) — a
   curated "should I open X?" / "kya main X khol doon?" permission-
   asking phrasing now asks back for yes/no instead of opening
   immediately, and the answer is resolved via a new ROUTE -1.2 that
   reuses `PendingIntentManager.js`'s `isAffirmative`/`isNegative`/
   `isCancelPhrase` helpers (built in Phase 1, unused until now).
5. **Long-term memory storage** — persistent, structured store
   (id/type/key/value/source/createdAt/updatedAt/confidence/
   importance/lastUsedAt/status) surviving restart. ✅ DONE (Phase 7)
   — extended the existing JSON-file `MemoryEngine` with the full
   structured schema (decision: JSON, not SQLite — see Phase 7
   details for the reasoning) rather than a new engine.
6. **Memory extraction** — classify TEMPORARY vs LONG_TERM, expand
   past the existing narrow regex rules in `src/ai/memory.js` without
   turning it into "save every sentence." ✅ DONE (Phase 8) — added
   explicit profile/preference/interest/project/workflow extraction,
   temporary session candidates, sensitive-content blocking, and a
   read-only classifier.
7. **Memory retrieval** — bounded, relevance-based retrieval feeding only relevant facts into a response. ✅ DONE (Phase 11/13 integration).
8. **Conversation summarization** — compress older turns while preserving important context. ✅ DONE (Phase 12).
9. **Memory update / contradiction handling** — supersede old facts instead of holding contradictory ACTIVE records. ✅ DONE (Phase 9).
10. **Memory commands** — natural-language remember/forget/recall through the normal chat pipeline. ✅ DONE (Phase 10/11).
11. **Full API integration pipeline** — context → intent → pending → memory → parameters → existing API/skill → response. ✅ DONE (Phase 13).
12. **UI/debugging** — bounded diagnostics UI and context/memory/routing/skill telemetry, gated behind `config.debug`. ✅ DONE (Phase 14).
13. **Final regression test suite** — automated acceptance guard plus manual desktop smoke-test checklist. ✅ DONE (Phase 15).

This list will be revised as later phases reveal more about the
codebase — it is a plan, not a contract.

## Phase 1 — details

### Implemented modules
- `renderer/js/context/ConversationContextManager.js` — new. Rolling
  turn window (`pushTurn`/`getRecentTurns`, default 20 turns,
  configurable), active topic storage, active intent storage,
  pending-intent storage, pending-confirmation storage. Exposed as
  `window.JARVISConversationContext` (singleton) +
  `window.ConversationContextManager` (class), plus a
  `module.exports` for Node/tests.
- `renderer/js/context/PendingIntentManager.js` — new. Generic
  register-a-follow-up / resolve-the-answer architecture
  (`setPending()` / `tryResolve()`), NOT hardcoded per skill — skills
  supply their own `resolver(rawText) -> value|null`, or fall back to
  a generic default resolver. Handles cancel phrases
  ("cancel"/"chodo"/...) explicitly. Exposed as
  `window.JARVISPendingIntent` (singleton) +
  `window.PendingIntentManager` (class).

### Integration into `renderer/js/chat.js`
- New config flags: `pendingIntentFirst: true` (kill switch — set to
  `false` to fully restore pre-Phase-1 behavior, including the old
  silent Delhi default), `contextWindowSize: 20` (not yet wired to
  the context manager's constructor — the manager currently uses its
  own default; wiring this through is a trivial follow-up, noted as a
  known issue below).
- New "ROUTE -1" at the very top of `processBrainRouter()`: if a
  pending intent exists, tries the new message against it before any
  other route runs. Resolved → dispatches straight to the skill's
  registered executor (see `_pendingIntentExecutors()`). Not
  resolved/no match → falls through to normal routing untouched, so a
  genuinely new command still works while JARVIS is "waiting".
- `processDataSourceCommand()`'s WEATHER branch: if no city is
  extracted, calls `window.JARVISPendingIntent.setPending(...)` with a
  dedicated `_resolvePlaceNameReply` resolver (tighter than the
  generic default — validates the reply "looks like a place name":
  ≤4 words, letters/spaces/hyphens/apostrophes only (Latin +
  Devanagari), and not a common non-place command word like
  "time"/"status"/"news") and asks "Kis city ya region ka weather
  bataun?" instead of defaulting to Delhi. If `pendingIntentFirst` is
  `false`, falls back to the exact old "default to Delhi" behavior.
- Turn recording: `window.JARVISConversationContext?.pushTurn(...)`
  added right next to the two existing `this.addHistory(...)` calls
  in the main send flow (one choke point for user turns, one for
  assistant turns) — best-effort, wrapped in try/catch, never affects
  the actual chat response if it fails.
- `renderer/index.html`: two new `<script defer>` tags added,
  loading `ConversationContextManager.js` then
  `PendingIntentManager.js`, immediately before `chat.js`.

### Files created
- `renderer/js/context/ConversationContextManager.js`
- `renderer/js/context/PendingIntentManager.js`
- `test/context-managers.test.js` (16 unit tests)
- `test/weather-pending-intent-integration.test.js` (6 integration
  tests, load the real `chat.js` via `require()`)
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file)

### Files modified
- `renderer/js/chat.js` — added config flags, ROUTE -1, WEATHER
  pending-intent wiring, `_resolvePendingIntent()`,
  `_pendingIntentExecutors()`, `_executeWeatherLookup()`,
  `_resolvePlaceNameReply()`, two turn-recording calls.
- `renderer/index.html` — two new script tags.
- `package.json` — `test` script now also runs the two new test
  files.

### Files removed
No files removed.

### Integration points
- `window.JARVISPendingIntent` / `window.JARVISConversationContext`
  are the two new globals every future skill/phase should read and
  write through, instead of inventing separate ad-hoc state.
- `chat.js`'s `_pendingIntentExecutors()` is the registry future
  skills add themselves to once they're upgraded to call
  `setPending()` (currently only `WEATHER` is registered).
- Nothing in `main.js`, IPC, STT/TTS, Browser/BrowserBrain, or the
  `renderer/js/brain/` agent system was touched.

### Tests executed
- `npm test` (existing 4 files + the 2 new files, 47 tests) — all via
  `node --test`, no network/display required.
- All pre-existing test files individually and together (7 files,
  54 sub-tests counted, including `consciousness-fallback.test.js`
  which exists but isn't in the npm script) — all passing, confirming
  no regression from this phase's changes.
- New: `test/context-managers.test.js` — 16 unit tests for both new
  classes in isolation (turn window bounding, empty-text guards,
  pending-intent round trip, resolver leak-safety, cancel/no-match
  behavior, custom resolvers, yes/no/cancel word helpers).
- New: `test/weather-pending-intent-integration.test.js` — 6 tests
  that `require()` the REAL `renderer/js/chat.js` (not a mock) with a
  fake `window.jarvis.data.weather()` standing in for the IPC bridge,
  and drive the actual `processBrainRouter()`/
  `processDataSourceCommand()` methods:
  1. "weather batao" (no city) → asks, doesn't guess Delhi.
  2. "Mumbai weather batao" → answers directly, no follow-up.
  3. Full round trip: "weather batao" → "Delhi" → real weather
     answer, pending intent cleared.
  4. "current time" while weather is pending → correctly falls
     through to the existing offline TIME route instead of being
     swallowed as a city name (this caught a real bug during
     development — see Known issues).
  5. "cancel" clears a pending weather question.
  6. `pendingIntentFirst = false` fully restores old behavior
     (verifies the kill switch).

### Existing features verified (via targeted tests, not a live app run)
- `natural-command-engine.test.js`, `cognition.test.js`,
  `bilingual-consciousness.test.js`,
  `consciousness-fallback.test.js`, `stt.test.js` — all still pass
  unmodified, run both individually and in the same process as the
  new tests (checked for cross-file interference from the new
  `global.window` mock; none found).
- Manually re-read (not executed — no Electron/display available
  here) `main.js`'s `registerChatIPC`/`registerAIIPC`, `preload.js`,
  and every other `chat.js` route to confirm nothing outside the
  WEATHER branch and the two `addHistory` choke points was touched.
- **Not verified by this assistant (needs the user to check
  locally):** app actually launches, UI loads, STT/TTS/voice, Browser/
  BrowserBrain, and the full click-through experience. Environment
  here has no display, no audio device, and no network access.

### Known issues
1. During development, the generic default resolver's "is this a new
   command, not an answer" safety net initially let short unrelated
   phrases (e.g. "current time") get swallowed as a city name. Fixed
   for WEATHER specifically via a dedicated `_resolvePlaceNameReply`
   resolver, and the shared default resolver's hint list was also
   broadened as a general improvement — but the shared default
   resolver is still a coarse heuristic. Any future skill that relies
   on the *generic* default resolver (rather than supplying its own,
   as WEATHER now does) should double-check this doesn't misfire for
   its own parameter type.
2. A pending intent has no timeout/expiry yet. If the user asks
   "weather batao", gets asked "which city?", then abandons that
   thread for several unrelated turns without saying "cancel", the
   next SHORT reply that happens to look like a place name could
   still be swallowed as the city. Needs a TTL (e.g. clear after N
   turns or M minutes) in a later phase.
3. `contextWindowSize` config flag exists but isn't wired through to
   `ConversationContextManager`'s constructor yet — the manager uses
   its own internal default (20). Trivial fix, deferred to avoid
   scope creep in this phase.
4. TIME (location-based) is not yet wired to pending-intent — see
   the "gap found" note in the audit summary above. Needs an
   intent-detection change before pending-intent logic can help.
5. This assistant could not launch the actual Electron app, so the
   full click-through / voice experience has not been manually
   verified — only the router/skill logic, via Node tests against
   the real source files.

### Next phase
Extend pending-intent parameter resolution to more skills (CURRENCY,
NEWS, SEARCH), and/or begin multi-parameter collection (Test 3's
laptop-search budget → use-case flow) — whichever the user prioritizes.

## Phase 7 — details

### Decision made (per the Phase 6 "next phase" note asking this be
confirmed first)
Extended the existing JSON-file `MemoryEngine` (`src/ai/memory.js`)
with the full structured schema, rather than introducing SQLite.
Reasoning:
- This sandbox has no network access, so a new dependency like
  `better-sqlite3` cannot be `npm install`-ed here, and
  `package.json` has no SQLite dependency today.
- The brief's schema requirement (id/type/key/value/source/
  createdAt/updatedAt/confidence/importance/lastUsedAt/status) is a
  data-shape requirement, not a storage-engine requirement — a JSON
  file holds it fine at this project's scale.
- Keeps the change low-risk and fully testable here (no network/
  display needed).
If the user wants SQLite later, that's a clean, isolated follow-up:
install the dependency locally, then swap `load()`/`save()` for a
`better-sqlite3`-backed implementation behind the exact same public
method signatures — no caller elsewhere would need to change.

### Implemented
- **v2 structured schema.** Every long-term memory record now has
  `id` (UUID via `crypto.randomUUID()`), `type`, `key`, `value`,
  `source`, `createdAt`, `updatedAt`, `confidence`, `importance`,
  `lastUsedAt`, `status` — exactly the fields listed in the brief's
  Section 8. Storage file (`src/database/memory.json`) is now
  `{ version: 2, records: [...], episodic: [] }` instead of v1's
  `{ facts: { "<key>": {...} }, episodic: [] }`.
- **`type` values**: USER_PROFILE, USER_PREFERENCE, USER_INTEREST,
  USER_PROJECT, USER_WORKFLOW, USER_FACT, CONVERSATION_SUMMARY,
  IMPORTANT_CONTEXT (per the brief). Not a hard enum (any string is
  accepted) so this can't become a brittle gate for a future caller,
  but `remember()` still defaults sensibly: a new `type` option takes
  precedence if given, else the existing `category` option is mapped
  through a `CATEGORY_TO_TYPE` table (`identity` → `USER_PROFILE`,
  `context` → `USER_FACT`, etc.), else `USER_FACT`.
- **`status` values**: ACTIVE, SUPERSEDED, DELETED — schema support
  only in this phase. Every record this phase writes is ACTIVE.
  SUPERSEDED is reserved for Phase 9 (contradiction handling, e.g.
  dark UI → light UI) and DELETED for a possible future soft-delete
  in the memory-commands phase; neither is produced yet, deliberately
  — implementing either now would be doing a later phase's job early.
- **v1 → v2 automatic migration**, done once on `load()` if the file
  is still in the old `{facts: {...}}` shape: every v1 fact becomes
  exactly one v2 record (`_migrateFromV1()`, a pure function of its
  input, unit-tested in isolation), then the migrated store is
  immediately persisted back to disk in v2 form. No data is dropped —
  value/confidence/source/updatedAt all carry over, `category` maps
  to `type`, and `createdAt`/`lastUsedAt` are backfilled from the old
  `updatedAt` (the only timestamp v1 had).
- **Full backward compatibility of the public API.** Every method
  every existing caller (`main.js`'s IPC handlers, `handleAIAsk()`,
  `consciousness:respond`, all of `test/cognition.test.js`) already
  used — `remember()`, `recall()`, `recallEntry()`, `forget()`,
  `allFacts()`, `extractFromMessage()`, `buildContextBlock()`,
  `pushTurn()`/`getWorkingMemory()`/`clearWorkingMemory()` — keeps
  its exact old signature and observable behavior. `allFacts()`
  still returns the legacy `{ "<key>": {value, confidence, source,
  category, updatedAt} }` shape (now with the new fields included
  additively, plus a `category` alias derived from `type` for any
  old reader of `.category`), and `forget()` is still a hard delete
  (a second `forget()` call on the same key still returns `false`).
- **Two new methods, additive only** (nothing existing calls them
  yet — same "storage built now, wired up later" pattern as Phases 1
  and 5/6's `setTopic()`/`setConfirmation()`):
  - `allRecords()` — the full list of ACTIVE structured records (not
    the legacy key-map projection), for a future caller that needs
    `id`/`type`/`importance`/`lastUsedAt`/`status` directly.
  - `recall()` now also bumps the matched record's `lastUsedAt` on
    every read (a read is a use) — laying groundwork for Phase 8's
    relevance-based retrieval without implementing retrieval itself.
- **Dormant bug fixed as a side effect, not a deliberate target of
  this phase**: `main.js`'s `consciousness:respond` handler already
  did `Object.values(memory.allFacts()...).map(f => ({ key: f.key,
  value: f.value }))`, but v1 fact records never had a `key` field
  inside them (the key only existed as the object's property name),
  so `f.key` was always `undefined` before this phase. The v2 schema
  puts `key` inside the record itself, so this now resolves
  correctly — verified with a small sanity script simulating that
  exact call site (see Tests executed below).
- **No changes** to `FACT_RULES` (name/location extraction),
  `pushTurn`/working memory, `buildContextBlock()`'s output format,
  or any IPC handler signature in `main.js` — this phase only changes
  what's underneath `MemoryEngine`, not how anything calls it.

### Files created
- `test/long-term-memory.test.js` (12 unit tests)

### Files modified
- `src/ai/memory.js` — replaced the flat `facts` object with the v2
  structured `records` array, added `_migrateFromV1()`, `_findActive()`,
  `allRecords()`, `STATUS`/`CATEGORY_TO_TYPE`/`makeId()`/`resolveType()`
  helpers; `remember()`/`recall()`/`recallEntry()`/`forget()`/
  `allFacts()`/`buildContextBlock()` reimplemented against the new
  storage but with unchanged public signatures/behavior; new
  `module.exports` also exposes `STATUS`.
- `package.json` — test script now also runs
  `long-term-memory.test.js`.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- `main.js`'s `initMemory()`/`handleAIAsk()`/`consciousness:respond`/
  `memory:get-facts`/`memory:forget-fact` — the only existing
  consumers of `MemoryEngine` — needed ZERO changes; verified both by
  the full regression suite and a standalone sanity script that
  reproduces `main.js`'s exact call shapes against the new engine
  (see Tests executed below).
- `allRecords()` is the entry point a future relevance-based
  retrieval phase (Phase 8) should read from instead of `allFacts()`,
  since it exposes `importance`/`lastUsedAt`/`status` directly rather
  than through the legacy projection.
- `STATUS` (now exported from `src/ai/memory.js`) is what Phase 9
  (contradiction/supersede handling) and a future memory-commands
  phase's soft-delete should reuse, rather than re-declaring their
  own status string constants.

### Tests executed
- `npm test` — 110 tests, all passing (up from 98 in Phase 6; the
  new `long-term-memory.test.js` file accounts for the +12).
- Full suite including `consciousness-fallback.test.js` run together:
  117 tests total, all passing (up from 105 in Phase 6) — checked
  again for cross-file interference; none found. No regressions in
  WEATHER/TIME/CURRENCY/PRODUCT_SEARCH pending-intent flows,
  reference resolution, yes/no confirmation, the natural-intent
  engine, chit-chat, cognition, STT, or bilingual consciousness.
- New `test/long-term-memory.test.js` covers:
  1. `remember()` creates a record with every v2 schema field
     present and correctly typed.
  2. An explicit `type`/`importance` option overrides the
     category-based default.
  3. No `category`/`type` given defaults to `USER_FACT` /
     importance 0.5.
  4. Calling `remember()` twice for the same key overwrites in place
     (same `id`, `createdAt` unchanged, `value`/`updatedAt` updated,
     still exactly one record for that key) — confirming this phase
     deliberately does NOT do Phase 9's supersede behavior yet.
  5. `recall()` bumps `lastUsedAt` on a read.
  6. `allRecords()` returns full structured records for every ACTIVE
     fact, with correct `type` values.
  7. `allFacts()`'s legacy projection still has the exact old shape
     (value/confidence/source) plus the new fields (type/status/id)
     and a `category` alias.
  8. `forget()` is confirmed to still be a hard delete (record fully
     removed from `allRecords()`, not marked DELETED), matching
     pre-Phase-7 behavior exactly.
  9. v2 records round-trip through disk with a stable `id` across
     reload.
  10. A hand-written v1-format file is migrated to v2 on load with
      every fact preserved (value/type/status), and the file on disk
      is confirmed rewritten in v2 shape (`version: 2`, `records`
      array, no `facts` key left over).
  11. A corrupt storage file still yields empty `allFacts()`/
      `allRecords()` rather than crashing (same guard as before,
      re-verified against the new storage shape).
  12. `extractFromMessage()`'s existing name/location rules produce
      fully structured records (type/status/id present), confirming
      the extraction pipeline needed no changes to benefit from the
      new schema.
- Standalone sanity script (not part of `npm test`, run manually
  during development) reproducing `main.js`'s three real call
  shapes — `extractFromMessage()` + `pushTurn()` (as in
  `handleAIAsk()`), `Object.keys(allFacts()).length` (as in
  `consciousness:state`), and `Object.values(allFacts()).map(f =>
  ({key: f.key, value: f.value}))` (as in `consciousness:respond`) —
  against the new engine: all produced correct output, including the
  now-fixed `f.key` (see "Implemented" above).

### Existing features verified
Same as prior phases — full suite (117 tests via `node --test`,
including `consciousness-fallback.test.js`) run together, no
regressions anywhere. Electron app launch, STT/TTS/voice, and the
real Browser/BrowserBrain remain **not verified by this assistant**
(no display/audio/network here) — this phase touches none of those
systems (only `src/ai/memory.js`, loaded by `main.js` in the Electron
main process, not the renderer), so risk here is low, but please
still do a quick smoke test locally: start JARVIS, say something like
"My name is Nakul", restart the app, and confirm it's still
remembered (this exercises the real disk-backed path this phase
changed, end to end, which the sandbox here cannot fully replicate).

### Known issues
1. `remember()` still overwrites the existing ACTIVE record for a
   key in place rather than creating a SUPERSEDED/ACTIVE pair — this
   is deliberate (Phase 9's job, not this phase's), but means no
   history is kept yet for a changed fact; only the latest value
   survives once Phase 9 is *not* yet applying supersede logic, so
   a fact update today looks identical (from the outside) to how it
   looked before Phase 7.
2. `forget()` remains a hard delete, not a soft `DELETED` status —
   consistent with pre-Phase-7 behavior and existing tests, but a
   future memory-commands phase may want to reconsider this for
   auditability ("what did I ask it to forget, and when?").
3. `type`/`status` are not validated against a hard enum — a typo'd
   `type` string (e.g. a future caller passing `"USER_PROFIL"`) would
   silently be stored as-is rather than rejected or corrected. Low
   risk today since only this file's own `CATEGORY_TO_TYPE` table
   produces `type` values in practice, but worth remembering if a
   future phase starts accepting `type` from less-trusted input
   (e.g. a natural-language memory command).
4. No `importance` is ever set to anything other than the default
   (0.5) yet by any real call site — the field exists and is
   persisted/migrated correctly, but nothing in this phase assigns a
   meaningfully different importance to any fact. A future extraction
   phase (Phase 8, "Memory extraction" in the roadmap — note the
   roadmap's numbering and this project's phase numbering have
   diverged slightly; see the "Next phase" note below) is the natural
   place to start varying this based on what kind of fact was stated.
5. The `episodic` array is still present but empty and unused —
   unchanged from all prior phases, still an intentionally documented
   extension point, not a gap introduced by this phase.
6. Same pending-intent TTL / confirmation TTL / topic TTL gaps as all
   prior phases (unrelated to this phase, still open).
7. `contextWindowSize` config flag still not wired through (still
   open, unrelated to this phase).

### Next phase
Memory extraction — COMPLETE in Phase 8. The next unfinished phase is
bounded, relevance-based memory retrieval.

## Phase 8 — details

### Implemented
- **Explicit extraction classifier.** Added `extractCandidates()` and
  `classifyMessage()` to `src/ai/memory.js`. A message is classified
  as `LONG_TERM` only when a specific durable first-person statement
  is matched; ordinary questions and commands remain no-memory/
  `TEMPORARY`.
- **Structured memory categories.** Added conservative rules for
  profile/name, location, occupation, preferences, interests,
  projects, and workflows. Candidates receive their structured
  `type`, `importance`, `confidence`, `key`, and `retention` before
  persistence.
- **Temporary context.** Current-session location statements such as
  "Today I am in Mumbai" are exposed as `TEMPORARY` candidates for
  current-turn consumers but are never written to `memory.json`.
- **Sensitive-data guard.** Passwords, passcodes, PINs, secrets,
  API/access/auth tokens, and detectable payment-card details are
  blocked before extraction/persistence. The classifier reports
  `blocked: true` without storing or logging the secret value.
- **Backward compatibility.** `extractFromMessage()` still returns
  stored records and existing name/location behavior remains intact;
  it now persists only the classifier's `LONG_TERM` candidates.
- **Exports.** Added `RETENTION` and `EXTRACTION_RULES` exports while
  preserving `FACT_RULES`, `STATUS`, and all existing `MemoryEngine`
  public methods.

### Files created
- `test/memory-extraction.test.js`

### Files modified
- `src/ai/memory.js`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- `main.js` already calls `MemoryEngine.extractFromMessage()` from
  both `consciousness:record-turn` and the local `handleAIAsk()` path,
  so the richer classifier is active in both existing conversation
  ingestion paths without a new pipeline or duplicate memory engine.
- Phase 7's v2 JSON schema remains the persistence layer; the new
  extraction metadata maps directly to the existing `type`,
  `confidence`, `importance`, `source`, and `status` fields.
- `extractCandidates()` is read-only and ready for the future
  retrieval/debug phases to inspect without causing writes.

### Tests executed
- `node --test test/memory-extraction.test.js test/cognition.test.js test/long-term-memory.test.js`
- `npm test`

### Test results
- Focused extraction plus legacy memory tests: **36 passed, 0 failed**.
- Full project test script: **119 passed, 0 failed**.
- No new dependency was added.

### Existing features verified
- Existing name and Hinglish name extraction.
- v1 → v2 memory migration, structured persistence, reload, recall,
  forget, corrupt-file recovery, and working-memory bounds.
- Existing bilingual consciousness, STT, natural-command,
  pending-intent Weather/Time/Currency, product search,
  reference resolution, and confirmation integration tests.
- Electron launch, UI, STT/TTS hardware, and Browser/BrowserBrain
  live behavior remain unverified in this headless environment.

### Known issues
1. This phase intentionally does not supersede contradictory records;
   that remains the next contradiction-handling phase.
2. `saveMemoryFact()` in the renderer's natural-language memory
   command path remains a separate free-form/session store; unified
   memory commands are a later roadmap phase.
3. The rule set is intentionally conservative and English/Hinglish
   focused. New explicit phrasing can be added as tested rules.
4. The existing pending-intent/topic/confirmation TTL gaps and
   `contextWindowSize` wiring gap are unchanged.

### Next phase
**Phase 9 — Memory retrieval:** bounded, relevance-based retrieval
that selects only facts relevant to the current query instead of
injecting the whole memory database.

## Phase 6 — details

### Implemented
- **Yes/No confirmation wiring**, matching the brief's Test 8: "Should
  I open YouTube?" -> "Kya main YouTube khol doon?" -> "Yes." -> the
  site actually opens.
- **`ConversationContextManager.setConfirmation()`/`getConfirmation()`**
  (storage only since Phase 1) now has a real writer/reader for the
  first time — same "storage built early, wired up later" pattern
  Phase 5 followed for `setTopic()`/`getTopic()`.
- **`getConfirmation()` hardened to match `getPendingIntent()`'s
  existing debug-safety pattern**: it now strips the `onYes`/`onNo`
  callback functions from the returned snapshot (previously a plain
  shallow copy, which — harmlessly, since nothing read it yet, but
  incorrectly for a "debug/UI-safe" snapshot — still included live
  function references) and instead exposes `hasOnYes`/`hasOnNo`
  booleans. Callers that need to actually invoke the callbacks (see
  `_resolveConfirmation()` below) read them from the raw
  `context.pendingConfirmation` object directly, the same documented
  exception `PendingIntentManager.tryResolve()` already uses for its
  own resolver function.
- **New module-level export**: `PendingIntentManager.js` now also
  exposes `window.JARVISPendingIntentHelpers = { isAffirmative,
  isNegative, isCancelPhrase }`. These three helper functions were
  built in Phase 1 (for `tryResolve()`'s own cancel-phrase check and
  for Node test coverage) but were never attached to `window` and
  were otherwise unused — this phase is the first real usage, and
  reuses them as-is rather than writing a second yes/no word list.
- **New module-level trigger + flow in `renderer/js/chat.js`**:
  - `JARVISChat.OPEN_CONFIRMATION_SITES` — a curated map of common
    named sites (YouTube, Gmail, WhatsApp, Instagram, Netflix,
    GitHub, ...) people ask JARVIS to open, same curated-list
    philosophy as `PRODUCT_SEARCH_CATEGORIES`/`CURRENCY_ALIASES`.
  - `_isOpenConfirmationQuery(text)` — only matches a
    **permission-asking** phrasing ("should I", "shall I", "kya
    main", "kya mujhe", "want me to", ...) combined with an
    open/launch word AND one of the curated site names. An ordinary
    direct "open youtube" (no permission-asking phrase) does NOT
    match this and is left completely untouched for the existing
    ROUTE 2 (browser) to handle exactly as before this phase existed
    — verified by a dedicated regression test.
  - `_startOpenConfirmation(text, site)` — registers a pending
    confirmation via `setConfirmation()` (with `onYes`/`onNo`
    closures capturing `this`) instead of opening the site
    immediately, and asks "Kya main `<Site>` khol doon?".
  - `_executeOpenSite(site)` — called once the user confirms.
    Delegates to the **existing** browser engine via
    `this.processBrowser()` (the exact same method ROUTE 2 and
    Phase 4's `_executeProductSearch()` already use) rather than
    inventing a new "open a site" implementation. Falls back to a
    clear summary if the browser engine is unavailable, same
    graceful-degradation pattern as Phase 4.
- **New route — ROUTE 1.95 (OPEN CONFIRMATION)** in
  `processBrainRouter()`, positioned right before ROUTE 2 (browser):
  if `_isOpenConfirmationQuery()` matches, asks for confirmation
  instead of falling through to ROUTE 2's unconditional site-open
  behavior.
- **New route — ROUTE -1.2 (YES/NO CONFIRMATION RESOLUTION)**,
  positioned before ROUTE -1 (pending-intent resolution) so a bare
  "yes"/"haan" answering a confirmation is never mistaken for the
  answer to an unrelated pending-intent parameter question (and vice
  versa — the two storage buckets on `ConversationContextManager` are
  independent, so this ordering only matters in the unlikely case
  both are somehow active at once). `_resolveConfirmation(text)`:
  - Normalizes the reply via the existing `getCommandText()` (lower-
    cases, strips trailing punctuation) before checking it against
    `isAffirmative`/`isNegative`/`isCancelPhrase` — needed because
    those word lists do an exact-match lookup and a real answer like
    "Yes." (with a trailing period, exactly as phrased in the brief's
    own Test 8) would otherwise fail to match `"yes"`. Found via the
    first draft of the round-trip integration test below, fixed by
    normalizing the input rather than changing the shared helpers'
    word lists (which are also relied on by
    `PendingIntentManager.tryResolve()`'s own cancel-phrase check —
    changing their matching behavior there was out of scope for this
    phase).
  - Not affirmative/negative/cancel -> `{ handled: false }`, leaving
    the confirmation pending and falling through to normal routing
    (same "no-match, fall through" philosophy as
    `PendingIntentManager.tryResolve()`), so a genuinely new command
    still works while JARVIS is "waiting" for yes/no.
  - Affirmative -> clears the confirmation, then calls `onYes()`.
  - Negative OR an explicit cancel phrase -> clears the confirmation,
    then calls `onNo()`. (Treating "cancel" as equivalent to "no" for
    a yes/no confirmation — as opposed to pending-intent parameter
    questions, where "cancel" just abandons the question with no
    onNo-style action to run — is a deliberate, documented choice for
    this phase; see Known issues below.)
- New kill switch: `config.confirmationFirst` (default `true`), same
  pattern as `pendingIntentFirst`/`referenceResolutionFirst` — gates
  BOTH the new ROUTE -1.2 and ROUTE 1.95, so setting it to `false`
  fully restores pre-Phase-6 behavior (a "should I open YouTube?"
  question falls straight through to ROUTE 2 exactly as before, since
  "youtube" is still an unconditional trigger word in
  `isBrowserCommand()`).

### Files created
- `test/confirmation-integration.test.js` (7 integration tests, same
  real-`chat.js`-via-`require()` approach as the other pending-intent/
  reference-resolution integration tests, with a fake browser engine
  standing in for BrowserBrain/BrowserController)

### Files modified
- `renderer/js/chat.js` — added `confirmationFirst` config flag,
  ROUTE -1.2, ROUTE 1.95, `_resolveConfirmation()`,
  `OPEN_CONFIRMATION_SITES`, `_isOpenConfirmationQuery()`,
  `_startOpenConfirmation()`, `_executeOpenSite()`.
- `renderer/js/context/ConversationContextManager.js` — hardened
  `getConfirmation()` to strip `onYes`/`onNo` from its returned
  snapshot (see "Implemented" above); doc-comment updates only,
  otherwise unchanged (`setConfirmation()`'s stored shape and
  `hasConfirmation()`/`clearConfirmation()` are untouched).
- `renderer/js/context/PendingIntentManager.js` — exposed
  `window.JARVISPendingIntentHelpers` (`isAffirmative`, `isNegative`,
  `isCancelPhrase`); doc-comment updates only, otherwise unchanged
  (word lists, `tryResolve()`, `setPending()` are untouched).
- `test/context-managers.test.js` — added 2 unit tests for
  `ConversationContextManager`'s confirmation storage (round-trip +
  the "requires a question" guard) and 1 unit test verifying
  `window.JARVISPendingIntentHelpers` gets attached (this one has to
  force a fresh module evaluation via `require.cache` deletion, since
  this test file's own top-level `require()`s of the context modules
  run before `global.window` exists anywhere in the file — see the
  in-line comment on that test for the full explanation; this is a
  test-harness-only wrinkle, not a product bug).
- `package.json` — test script now also runs
  `confirmation-integration.test.js`.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- `window.JARVISPendingIntentHelpers` is the new global other future
  phases should read from if they need yes/no/cancel word detection
  outside of an active pending-intent (e.g. a future memory-command
  phase's "Jarvis, forget everything about my preferences — are you
  sure?" style confirmation could reuse this directly).
- `_executeOpenSite()` delegates to `this.processBrowser()` — the
  third phase in a row (after Phase 4's product search) to reuse the
  existing browser engine rather than building a parallel "open a
  site" implementation.
- Only ONE confirmation flow (OPEN_CONFIRMATION) registers itself
  through `setConfirmation()` in this phase. Any future skill that
  wants a yes/no gate (e.g. "delete all my search history — are you
  sure?") can reuse the exact same `setConfirmation()`/
  `_resolveConfirmation()` architecture without any changes to
  `ConversationContextManager.js`.

### Tests executed
- `npm test` — 98 tests, all passing (up from 88 in Phase 5; the new
  confirmation integration file (7) and the added unit tests (3)
  account for the difference).
- Full suite including `consciousness-fallback.test.js` run together:
  105 tests total, all passing (up from 95 in Phase 5) — checked
  again for cross-file interference (a fifth file now sets
  `global.window`); none found. No regressions in
  WEATHER/TIME/CURRENCY/PRODUCT_SEARCH pending-intent flows, reference
  resolution, the natural-intent engine, chit-chat, cognition, STT, or
  bilingual consciousness.
- New `test/confirmation-integration.test.js` covers:
  1. "Should I open YouTube?" asks "Kya main YouTube khol doon?"
     instead of opening immediately, and the stored confirmation
     snapshot never leaks the `onYes`/`onNo` functions.
  2. The brief's Test 8 verbatim: full round trip, "Yes." (with the
     trailing period exactly as phrased in the brief) actually opens
     YouTube via the fake browser engine.
  3. Answering "No" declines instead of opening, with a clear
     response.
  4. Hinglish "haan"/"nahi" both work identically to English
     "yes"/"no".
  5. An unrelated "cancel" while a confirmation is pending is treated
     as a decline (not silently swallowed or misinterpreted as an
     unrelated command).
  6. A direct "open youtube" (no permission-asking phrasing) is
     confirmed to still go straight to ROUTE 2/the browser route,
     completely unaffected — regression check for the most likely way
     this phase could have broken existing behavior.
  7. `confirmationFirst = false` restores old behavior (kill-switch
     parity with `pendingIntentFirst`/`referenceResolutionFirst`).
- New unit tests (`test/context-managers.test.js`): confirmation
  storage round-trip (including the `onYes`/`onNo`-hiding behavior),
  `setConfirmation()`'s "requires a question" guard, and the
  `window.JARVISPendingIntentHelpers` exposure check.
- During development: the round-trip integration test (#2 above)
  initially failed with "Yes." not being recognized as affirmative —
  traced to `isAffirmative()` doing an exact (post-trim-and-lowercase)
  match against a word list that doesn't include a trailing period.
  Fixed by normalizing the reply through the existing
  `getCommandText()` before checking it (see "Implemented" above),
  matching the project's established "fix the actual gap, don't
  change the shared word list" precedent from Phase 3's currency-word
  parsing fix.

### Existing features verified
Same as prior phases — full suite (105 tests via `node --test`,
including `consciousness-fallback.test.js`) run together, no
regressions in WEATHER/TIME/CURRENCY/PRODUCT_SEARCH pending-intent
flows, reference resolution/topic continuity, the natural-intent
engine, chit-chat, cognition, STT, or bilingual consciousness.
Electron app launch, STT/TTS/voice, and the REAL BrowserBrain/
BrowserController remain **not verified by this assistant** (no
display/audio/network here) — this phase's "YouTube actually opens"
claim rests on `this.processBrowser()` being called with a sensible
`"open YouTube"` query against a FAKE browser engine, not the real
one. Please smoke-test an actual "Should I open YouTube?" -> "Yes."
conversation locally to confirm the real browser opens YouTube.

### Known issues
1. `OPEN_CONFIRMATION_SITES` is a curated list (~18 sites), same
   trade-off as `PRODUCT_SEARCH_CATEGORIES`/`CURRENCY_ALIASES` — a
   site not on the list never triggers the confirmation flow at all,
   regardless of phrasing, and falls through to whatever route would
   otherwise handle it (usually ROUTE 2, unconditionally, if the
   phrasing happens to match `isBrowserCommand()`). Easy to extend
   (plain object, one line per site) as gaps are found.
2. `_isOpenConfirmationQuery()`'s "asks permission" phrase list is
   curated, not a full intent parser — a permission-asking phrasing
   not in the list (e.g. "would you mind opening YouTube?") is not
   recognized and falls straight through to ROUTE 2 as if it were a
   direct command. Same trade-off already accepted for
   `PendingIntentManager.js`'s `NEW_COMMAND_HINTS` and
   `ReferenceResolver.js`'s `SKIP_PATTERNS`.
3. Treating an explicit cancel phrase ("cancel", "chodo", ...) as
   equivalent to "no" for a yes/no confirmation is a product decision
   made in this phase, not a pre-existing convention — pending-intent
   PARAMETER questions treat "cancel" as "abandon the question, no
   action", whereas a confirmation's "cancel" now actively runs
   `onNo()` (here, a decline message; a future skill's `onNo` could
   do something more consequential). Worth the user's explicit sign-
   off if a future skill's `onNo` performs a real side effect (e.g.
   deleting something) rather than just replying.
4. No confirmation TTL/expiry, same category of gap as the pending-
   intent TTL issue from Phase 1 and the topic TTL issue from Phase
   5 — an active confirmation persists until answered, cancelled, or
   `clearContext()`/`clearAll()` runs, so a much later, unrelated
   short "yes"/"no" reply could theoretically still resolve against a
   stale confirmation from several turns ago. Same accepted trade-off
   as the other two TTL gaps, deferred rather than addressed ad hoc
   here.
5. Only the OPEN_CONFIRMATION flow exists in this phase — no other
   skill asks a yes/no confirmation yet. The architecture
   (`setConfirmation()`/`_resolveConfirmation()`) is general-purpose
   and ready for reuse, but nothing else has been migrated to use it.
6. Same pending-intent TTL gap as all prior phases (still open,
   unrelated to this phase's own confirmation-TTL note above).
7. `contextWindowSize` config flag still not wired through (still
   open, unrelated to this phase).

### Next phase
Long-term memory storage — persistent, structured store
(id/type/key/value/source/createdAt/updatedAt/confidence/importance/
lastUsedAt/status) surviving restart. As flagged in the roadmap above,
this needs a decision from the user first: extend the existing
JSON-file `MemoryEngine` (`src/ai/memory.js`) with the structured
schema (no new dependency, works today in this sandbox) vs. introduce
SQLite (`better-sqlite3` or similar — a new dependency requiring
`npm install`, which this assistant cannot run without network
access, so the user would need to install it locally first). Recommend
confirming which approach the user wants before starting Phase 7.

## Phase 5 — details

### Implemented
- **New module: `renderer/js/context/ReferenceResolver.js`.** A
  stateless resolver (same architectural style as
  `PendingIntentManager` — a class over `ConversationContextManager`
  storage, exposed as `window.ReferenceResolver` +
  `window.JARVISReferenceResolver`). Given raw text, it substitutes
  the first curated reference word/phrase found (English: "it",
  "its", "it's", "that", "this", "the same", "the same one", "the
  previous one"; Hinglish: "iske", "uske", "isse", "usse", "isme",
  "usme", "wo", "woh", "yeh", "ye") with the active topic's subject
  from `ConversationContextManager.getTopic()`.
- **Conservative by design, matching the project's existing curated-
  trigger philosophy** (same spirit as WEATHER's `_resolvePlaceNameReply`
  and PRODUCT_SEARCH's curated category list):
  - Does nothing if there's no active topic (`reason: "no-topic"`).
  - Does nothing for messages longer than 12 words (`reason:
    "too-long"`) — a bare "it" in a long sentence is much more likely
    to be an unrelated statement than a short clarifying follow-up.
  - Does nothing for messages that already look like their own
    complete, self-contained command — weather/currency/convert/
    cancel/yes/no/product-search phrases are matched against a
    `SKIP_PATTERNS` list first (`reason: "self-contained"`), so e.g.
    "cancel that" still cancels instead of being rewritten to
    "cancel NASA".
  - Does nothing if no curated reference word is present at all
    (`reason: "no-reference"`) — the original text is untouched, and
    the caller falls through to normal routing exactly as before this
    phase existed.
- **Wired into `renderer/js/chat.js`** as a new "ROUTE -0.5" in
  `processBrainRouter()`, positioned right after ROUTE -1 (pending
  intent) and before ROUTE 0 (file context). If it resolves, the
  local `text` variable used by every route below is reassigned to
  the rewritten sentence — so "When was it founded?" is routed
  exactly as if the user had typed "When was NASA founded?", with
  zero changes needed to any existing route/regex/skill. New kill
  switch: `config.referenceResolutionFirst` (default `true`), same
  pattern as `pendingIntentFirst`.
- **Topic-setting** (the actual missing half of Phase 1's storage-only
  `setTopic()`/`getTopic()` API) added at three answer sites, so
  there's something for `ReferenceResolver` to resolve against:
  1. `renderer/js/brain/naturalCommandEngine.js`'s route in `chat.js`
     — new `_maybeSetTopicFromNaturalResult()` helper + `_TOPIC_ENTITY_BY_INTENT()`
     map covering `KNOWLEDGE` (topic), `COUNTRY_INFO` (country),
     `LOCATION` (place), `POKEMON` (pokemon), `BOOK_SEARCH`/
     `TV_SEARCH`/`RECIPE_SEARCH` (query), `GITHUB_SEARCH` (username,
     falling back to query). Deliberately excludes WEATHER/TIME/
     CURRENCY — those already have their own pending-intent follow-up
     flow, and "it" after a weather report is ambiguous.
  2. `processKnowledgeCommand()` (the regex-based "what do you know
     about X" route) — sets the topic to `X` on a successful answer.
  3. `processWikipediaCommand()`'s explicit-topic branch — sets the
     topic to Wikipedia's own canonical `data.title` (e.g. "NASA",
     correctly capitalized) rather than the raw lowercased entity,
     since this is the highest-quality subject available.
- All topic-setting calls are wrapped in try/catch and are
  best-effort — a `ConversationContext` failure here can never break
  the actual chat response (matches the project's existing error-
  handling philosophy for context/pending-intent, and the master
  brief's explicit "memory/context must never crash JARVIS" rule).

### Files created
- `renderer/js/context/ReferenceResolver.js`
- `test/reference-resolution-integration.test.js` (5 integration
  tests, same real-`chat.js`-via-`require()` approach as the other
  pending-intent integration tests, this time also loading the real
  `naturalCommandEngine.js` since that's what actually answers
  "Tell me about NASA" in this codebase)

### Files modified
- `renderer/js/chat.js` — added `referenceResolutionFirst` config
  flag, ROUTE -0.5, `_TOPIC_ENTITY_BY_INTENT()`,
  `_maybeSetTopicFromNaturalResult()`, topic-setting in
  `processKnowledgeCommand()` and `processWikipediaCommand()`,
  changed `processBrainRouter()`'s local `text` from `const` to `let`
  so ROUTE -0.5 can rewrite it in place.
- `renderer/index.html` — one new script tag
  (`js/context/ReferenceResolver.js`, loaded after
  `PendingIntentManager.js` and before `chat.js`).
- `test/context-managers.test.js` — added 7 unit tests for
  `ReferenceResolver` in isolation.
- `package.json` — test script now also runs
  `reference-resolution-integration.test.js`.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- `window.JARVISReferenceResolver` is the new global other future
  phases should read from if they need reference-resolved text (it
  is a thin wrapper — nothing prevents calling
  `.resolve(text)` directly from anywhere else, e.g. a future memory-
  retrieval phase that wants a fully-specified query instead of one
  full of pronouns).
- `ConversationContextManager.setTopic()`/`getTopic()` (storage since
  Phase 1) now has real writers for the first time — any future skill
  that answers a question "about a thing" should call
  `window.JARVISConversationContext?.setTopic(subject, {...})` the
  same way the three call sites above do, to get reference-resolution
  support "for free".
- Deliberately did NOT touch the regex-only data-source routes for
  COUNTRY_INFO/LOCATION in `processDataSourceCommand()` (as opposed
  to the NaturalCommandEngine intents of the same name) — see Known
  issues below.

### Tests executed
- `npm test` — 88 tests, all passing (up from 76 in Phase 4; the new
  reference-resolution integration file (5) and the added unit tests
  (7) account for the difference).
- Full suite including `consciousness-fallback.test.js` run together:
  95 tests total, all passing — checked again for cross-file
  interference (this phase adds a fourth file that sets
  `global.window`, and the first file in this phase's suite that also
  loads the real `naturalCommandEngine.js` alongside `chat.js` via
  plain `require()`, not `vm` — confirmed this doesn't collide with
  `test/natural-command-engine.test.js`'s own separate `vm.createContext()`
  instance of the same file, since they're different Node module
  loads with independent state, and — per Node's default multi-file
  `--test` behavior — each test file runs in its own process, so
  `global.window` never actually leaks between files here or in any
  prior phase; the existing "checked for interference" notes in
  Phases 1–4 were a manual extra check, not a sign it was ever an
  actual risk).
- New `test/reference-resolution-integration.test.js` covers:
  1. "Tell me about NASA" sets the active topic (title-cased from the
     natural-intent entity: "Nasa").
  2. Full round trip — Test 7 verbatim: NASA lookup, then "What is
     it?" resolves to the real NASA Wikipedia fixture, not a "no page
     found for 'it'" miss.
  3. With no prior topic, "What is it?" is left completely unresolved
     (no-topic guard) and correctly misses.
  4. "system status" (no reference word) after a topic is set is
     NOT hijacked — still answered by the existing offline route.
  5. `referenceResolutionFirst = false` restores the old (always
     unresolved) behavior — kill-switch parity with
     `pendingIntentFirst`.
- New unit tests (`test/context-managers.test.js`) for
  `ReferenceResolver` in isolation: no-topic guard, basic "it"
  substitution, Hinglish substitution, no-reference passthrough,
  too-long guard, self-contained-command guard (cancel/weather/
  product-search all correctly NOT hijacked), and reading from the
  global `JARVISConversationContext` singleton by default.
- During development, two of my own first-draft unit tests were
  wrong, not the code: they asserted `reason: "no-reference"` for
  "Delhi weather please" and "weather batao", not realizing those
  correctly hit the `\bweather\b` self-contained-command guard first
  (working as designed — weather requests must never be hijacked by
  topic substitution). Fixed the tests once traced, matching the
  "fix the test, not the code, once traced" precedent set in Phase 4.

### Existing features verified
Same as prior phases — full suite (95 tests via `node --test`,
including `consciousness-fallback.test.js`) run together, no
regressions in WEATHER/TIME/CURRENCY/PRODUCT_SEARCH pending-intent
flows, the natural-intent engine, chit-chat, cognition, STT, or
bilingual consciousness. Electron app launch, STT/TTS/voice, and
Browser/BrowserBrain remain **not verified by this assistant** (no
display/audio/network here) — please smoke-test locally, in
particular an actual "Tell me about <topic>" then "What is it?" /
"iske baare mein aur batao" conversation through the real UI.

### Known issues
1. Topic subjects extracted from `naturalCommandEngine.js`'s entities
   are taken from an already-lowercased normalized string (e.g.
   "nasa"), then title-cased word-by-word in `chat.js` as a cheap
   quality improvement ("Nasa", not the fully-correct "NASA"). This
   is NOT a proper acronym/proper-noun detector — a real fix would
   need the source skill to return its own canonically-cased subject
   (as the Wikipedia route already does via `data.title`). Documented
   trade-off, not a crash risk: Wikipedia/knowledge lookups generally
   tolerate imperfect casing.
2. The regex-only `processDataSourceCommand()` branches for
   COUNTRY_INFO/LOCATION-style lookups (as opposed to the
   `naturalCommandEngine.js` intents of the same name, which up
   Phase 5's topic-setting) do not yet call `setTopic()`. In practice
   these regex branches mostly serve as an ROUTE 1.76 fallback for
   phrasing `naturalCommandEngine.js`'s ROUTE 1 doesn't already catch,
   so the gap is narrow, but a future phase could close it for
   completeness.
3. `ReferenceResolver`'s `SKIP_PATTERNS` guard is a curated list, not
   a full intent parser (same trade-off as `PendingIntentManager`'s
   `NEW_COMMAND_HINTS`) — a self-contained command using a skill word
   not in the curated list (e.g. a future new skill) could theoretically
   still be hijacked by an active topic if it also contains a bare
   "it"/"that"/etc. Low risk in practice given the 12-word length
   guard, but worth remembering when adding new skills with their own
   trigger vocabulary.
4. Only ONE reference word is substituted per message (the first
   match) — "Tell me about it and when it was founded" would only
   have the first "it" replaced. Acceptable for the target use case
   (short single-question follow-ups); a later phase could extend
   this to a global replace if needed.
5. No topic TTL/expiry, same category of gap as the pending-intent
   TTL issue from Phase 1 — an active topic persists until a new one
   is set or `clearContext()`/`clearAll()` runs, so a much later,
   unrelated short message using a reference word could theoretically
   still resolve against a stale topic from several turns ago. Given
   the existing rolling turn window and this being the same trade-off
   already accepted for pending intents, deferred rather than
   addressed ad hoc in this phase.
6. Same pending-intent TTL gap as all prior phases (still open,
   unrelated to this phase's own topic-TTL note above).
7. `contextWindowSize` config flag still not wired through (still
   open, unrelated to this phase).

### Next phase
Yes/No confirmation wiring — `setConfirmation()` storage exists
(Phase 1) but nothing calls it yet; wire an actual skill through it
(Test 8's YouTube example: "Should I open YouTube?" -> "Yes.") and
generalize haan/nahi handling, reusing `PendingIntentManager.js`'s
existing `isAffirmative`/`isNegative` helpers (already built in Phase
1, unused until now — the same "storage built early, wired up later"
pattern this phase just completed for `setTopic()`/`getTopic()`).

## Phase 4 — details

### Implemented
- **Multi-parameter (multi-turn) pending-intent chaining**, matching
  the brief's Test 3 exactly: "Search laptops." → "Kis budget mein
  laptops chahiye?" → "80000" → "Kis use ke liye chahiye?" →
  "AI coding" → executes a real search with ALL THREE parameters
  retained (category, budget, use case).
- **No changes needed to the core architecture** to support this —
  `ConversationContextManager.collectedParameters` (built in Phase 1,
  unused until now) is exactly the mechanism needed: each step's
  pending-intent executor, instead of always finishing, can call
  `setPending()` again with the parameters collected so far plus the
  next missing one. This confirms the Phase 1 architecture was
  actually general enough for this, not just single-parameter skills.
- **Narrow, curated trigger** (`_isProductSearchQuery` /
  `PRODUCT_SEARCH_CATEGORIES`): only a specific list of shopping-style
  product categories (laptop, phone, camera, headphone, tv, watch,
  tablet, ...) plus the word "search" starts this flow. General web
  searches ("search cat videos", "search python tutorial") are
  completely unaffected — verified by a dedicated regression test.
- **No new e-commerce/shopping API was built or is needed.** There is
  no product-search integration anywhere in this codebase (checked
  `src/services/dataSources.js` — nothing there). "Search is executed
  correctly" (per the brief's Test 3) is demonstrated by delegating
  the refined query (e.g. "laptops under 80000 for AI coding") to the
  **existing** browser engine via `this.processBrowser()` — the exact
  same method ROUTE 2 already uses — not a new search backend.
- **Graceful fallback**: if the browser engine is unavailable (not
  yet initialized, or — as in this sandbox — simply absent), returns
  a clear summary of what was understood and what would be searched,
  instead of a dead end.
- Budget resolver (`_resolveBudgetReply`) understands plain numbers,
  comma-grouped numbers, "80k" shorthand, and "1.5 lakh"/"lac"
  shorthand. Use-case reuses the shared generic default resolver from
  `PendingIntentManager.js` as-is (no new resolver needed — it's
  free text, exactly what the generic default resolver is for).

### Files created
- `test/product-search-multi-parameter-integration.test.js` (6
  integration tests)

### Files modified
- `renderer/js/chat.js` — new "ROUTE 1.85" before the general browser
  route, `PRODUCT_SEARCH_CATEGORIES`, `_isProductSearchQuery()`,
  `_startProductSearch()`, `_continueProductSearch()`,
  `_resolveBudgetReply()`, `_executeProductSearch()`, registered
  `PRODUCT_SEARCH` in `_pendingIntentExecutors()`.
- `test/context-managers.test.js` — added 4 unit tests.
- `package.json` — test script updated.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- `_pendingIntentExecutors()`'s `PRODUCT_SEARCH` entry is the first
  executor that itself calls `setPending()` again rather than always
  finishing — the template any future skill needing more than one
  follow-up question (e.g. a hypothetical multi-leg travel search)
  can copy.
- Delegates to the existing `this.processBrowser()` rather than
  inventing a parallel search path.

### Tests executed
- `npm test` — 76 tests total, all passing (up from 67 in Phase 3;
  the new product-search file and the added unit tests together
  account for the difference — exact per-file counts are visible by
  running each file individually).
- Full suite including `consciousness-fallback.test.js`: 83 tests
  total, all passing.
- New `test/product-search-multi-parameter-integration.test.js`
  covers:
  1. "search laptops" asks for budget, doesn't search immediately.
  2. The brief's Test 3 verbatim, three full turns, asserting the
     FINAL search string contains BOTH the budget from turn 2 and the
     use case from turn 3 — proving state survives across turns, not
     just the most recent message.
  3. Shorthand budget ("80k") resolves to 80000 correctly.
  4. A non-numeric budget reply is rejected and the question is kept
     open for a retry (caught a test-authoring mistake during
     development — an example reply accidentally started with the
     word "cancel" and was correctly treated as a real cancellation
     instead of "not a number"; fixed the test, not the code, once
     traced).
  5. "search cat videos" (no shopping category) is confirmed to still
     go straight to the normal browser route, untouched.
  6. Missing/unavailable browser engine still produces a clear,
     parameter-complete summary rather than a dead end.

### Existing features verified
Same as prior phases — full suite run together, no regressions.
Electron app launch, STT/TTS/voice, and the REAL BrowserBrain/
BrowserController remain **not verified by this assistant** (no
display/audio/network here) — this phase's "search executed
correctly" claim rests on `this.processBrowser()` being called with
the right refined query, verified against a fake browser engine, not
the real one. Please smoke-test an actual "search laptops" conversation
locally to confirm the real browser opens with a sensible query.

### Known issues
1. `_isProductSearchQuery` is a coarse, curated trigger: it fires on
   "search" + any curated category word appearing ANYWHERE in the
   message, not necessarily adjacent. A compound query like "youtube
   search laptop reviews" would be mis-classified as a product-search
   request instead of a YouTube video search. Acceptable for a narrow
   demo capability, but worth tightening (e.g. requiring the category
   word immediately after "search") if this flow is expanded to more
   categories.
2. Only English "search <category>" phrasing is recognized — no
   Hinglish equivalent ("laptop dhundo") yet, unlike WEATHER/TIME
   which have Hinglish triggers. Deliberately scoped down to match
   the brief's own Test 3 wording; extending to Hinglish is
   straightforward if wanted.
3. The refined search query is a simple template
   (`"<category> under <budget> for <use case>"`) — not validated
   against what a real shopping search engine expects; good enough to
   prove the parameter-chaining architecture, but a production version
   would likely want a proper query-builder per destination site.
4. Same pending-intent TTL gap as all prior phases (still open).
5. `contextWindowSize` config flag still not wired through (still
   open).

## Phase 3 — details

### Implemented
- **CURRENCY pending-intent wiring.** Pre-Phase-3, a "convert"/
  "exchange rate" request that the outer trigger accepted but the
  inner regex couldn't fully parse (e.g. "please convert my dollars",
  or any request using currency WORDS instead of 3-letter ISO codes)
  silently fell through with **no response at all** — not even an
  error message. Fixed: now asks "Kitni amount, kis currency se kis
  currency mein convert karna hai? (jaise: 100 USD to INR)" and
  resolves the follow-up.
- **Currency word/plural parsing.** Added `CURRENCY_ALIASES`
  (dollar(s)/rupee(s)/euro(s)/pound(s)/yen/yuan/franc(s)/won/
  dirham(s) → ISO codes) and a shared `_parseCurrencyQuery()` that
  understands both "100 USD to INR" and "100 dollars to rupees" —
  previously only literal 3-letter codes worked.
- **This is the first pending-intent that resolves a composite value**
  (`{ amount, from, to }` as a single `conversionQuery` parameter)
  rather than one plain string — proving the architecture from Phase 1
  doesn't need to change to support that; a resolver can return any
  value shape.
- **Two more pre-existing bugs found and fixed** (both were silently
  limiting whether the currency skill could even be reached):
  1. `isDataSourceCommand()`'s outer currency trigger only matched
     *singular* currency words (`\bdollar\b`, `\brupee\b`) — plurals
     like "dollars"/"rupees" never matched due to the trailing word
     boundary, so a request like "convert 50 dollars to rupees" never
     even reached `processDataSourceCommand()` via the real router,
     regardless of anything in the inner parsing logic. Broadened to
     accept plurals and the same alias set `_parseCurrencyQuery()`
     understands.
  2. (Carried over from being caught while testing) confirmed the
     amount/from/to extraction correctly defaults amount to `1` when
     only a currency pair is given, matching pre-existing behavior.
- **Deliberately NOT changed: NEWS.** Audited whether to add a
  pending-intent ask for NEWS (`"news batao"` currently defaults the
  topic to "India"). Decision: left as-is. Unlike weather/time/
  currency, "general news" is a coherent, useful answer on its own —
  forcing a "which topic?" question on every generic "news batao"
  would be worse UX, not better. This is a product judgment call the
  user can revisit, not an oversight.
- `CURRENCY: (parameters) => this._executeCurrencyConversion(...)`
  added to `_pendingIntentExecutors()`.

### Files created
- `test/currency-pending-intent-integration.test.js` (6 integration
  tests)

### Files modified
- `renderer/js/chat.js` — replaced the CURRENCY branch, added
  `CURRENCY_ALIASES`, `_parseCurrencyQuery()`,
  `_executeCurrencyConversion()`, registered `CURRENCY` in
  `_pendingIntentExecutors()`, fixed the plural-word-boundary bug in
  `isDataSourceCommand()`.
- `test/context-managers.test.js` — added 4 unit tests for
  `_parseCurrencyQuery()`.
- `package.json` — test script now also runs
  `currency-pending-intent-integration.test.js`.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- `_pendingIntentExecutors()` now has three entries (`WEATHER`,
  `TIME`, `CURRENCY`) — three different resolver shapes (place name,
  place name reused, composite object), giving good coverage of the
  architecture's flexibility for whichever skill comes next.

### Tests executed
- `npm test` — 67 tests, all passing (Phase 2's 57 + 10 new: 6
  integration + 4 unit).
- Full suite including `consciousness-fallback.test.js` run together:
  74 tests total, all passing — checked again for cross-file
  interference; none found.
- New `test/currency-pending-intent-integration.test.js` covers:
  1. "100 USD to INR" still works directly (unchanged).
  2. "50 dollars to rupees" (currency WORDS) now parses correctly —
     previously impossible.
  3. A bare currency pair with no amount still defaults to 1
     (unchanged).
  4. An unparseable request ("please convert my dollars") now asks
     instead of silently dropping the message.
  5. Full round trip: unparseable request → follow-up with a full
     "200 usd to eur" → real conversion, pending cleared. (This test
     initially failed during development and led directly to finding
     the plural-word-boundary bug above — fixing that bug was
     required to make the round trip work at all through the real
     router, not just via a direct method call.)
  6. `pendingIntentFirst = false` reproduces the exact old silent
     dead-end (no pending intent, no currency-specific response).

### Existing features verified
Same as Phase 1/2 — all pre-existing test files still pass, run
individually and together with all Phase 1–3 test files. Electron app
launch, STT/TTS/voice, and Browser/BrowserBrain remain **not verified
by this assistant** (no display/audio/network here) — please
smoke-test locally.

### Known issues
1. `isDataSourceCommand()`'s outer currency trigger still requires
   *some* currency word/code to already be present (by original,
   deliberate design — this avoids "convert" alone colliding with
   unrelated features like file conversion). A fully bare "exchange
   rate" or "convert" with zero currency words still won't reach the
   currency skill at all. Not changed in this phase — flagged in case
   the user wants that broadened later, but it carries real collision
   risk with other command types.
2. `CURRENCY_ALIASES` is curated (~14 currencies) like
   `CITY_TIMEZONE_MAP` — same trade-off, same easy-to-extend shape.
3. Same pending-intent TTL gap as Phases 1–2 (still open).
4. `contextWindowSize` config flag still not wired through (still
   open).

## Phase 2 — details

### Implemented
- **TIME intent-detection fix.** `isDataSourceCommand()`'s time
  trigger regex broadened to also catch generic Hinglish phrasing
  ("time batao", "samay batao", "world clock", bare "kitne baje
  hai(n)") in addition to the existing "time in X" / "timezone"
  patterns. Verified this does NOT collide with the existing explicit
  English local-device-time offline commands ("what's the time",
  "current time", "time now", "tell me the time") — those still
  answer with the device's local time as before (see the dedicated
  regression test for this).
- **TIME pending-intent wiring**, mirroring WEATHER: if no
  city/zone is found in the message, asks "Kis city ya region ka time
  bataun?" instead of silently defaulting to Asia/Kolkata, reusing the
  same `_resolvePlaceNameReply` resolver WEATHER uses (same parameter
  shape — a place name — so no new resolver needed; this is exactly
  the "extensible, not per-skill-hardcoded" architecture the brief
  asked for).
- **City name → IANA timezone mapping** (`JARVISChat.CITY_TIMEZONE_MAP`
  + `_resolveTimezone()`), since WorldTimeAPI needs an exact
  "Area/City" zone name and a plain reply like "Delhi" isn't one.
  Curated list covering common Indian cities/regions and world
  capitals/major cities (~45 entries). Explicit zone strings
  ("Asia/Kolkata", "europe/berlin") still pass through unchanged
  (case-corrected — see bug fix below), preserving the old "time in
  Asia/Kolkata" usage.
- **Pre-existing bug fixed in passing**: the old "time in X" /
  "timezone X" code extracted the zone from the already-lowercased
  command text (`getCommandText()` lowercases everything) and sent it
  straight to WorldTimeAPI, e.g. "Europe/Berlin" → "europe/berlin".
  IANA zone names are case-sensitive, so this was a real (if narrow)
  latent bug predating this upgrade. Found via the new integration
  test for explicit zone pass-through; fixed by reconstructing proper
  segment capitalization in `_resolveTimezone()`.
- `TIME: (parameters) => this._executeTimeLookup(parameters.city)`
  added to `_pendingIntentExecutors()`.
- Unrecognized cities get a clear message ("Mujhe 'X' ka timezone
  nahi pata...") instead of a wrong guess, and the pending intent is
  still cleared (doesn't loop forever asking the same question).

### Files created
- `test/time-pending-intent-integration.test.js` (7 integration
  tests, same real-`chat.js` approach as the weather one)

### Files modified
- `renderer/js/chat.js` — broadened TIME detection regex (two call
  sites: `isDataSourceCommand()` and the branch condition), replaced
  the TIME branch body, added `CITY_TIMEZONE_MAP`, `_resolveTimezone()`,
  `_executeTimeLookup()`, registered `TIME` in
  `_pendingIntentExecutors()`.
- `test/context-managers.test.js` — added 3 unit tests for
  `_resolveTimezone()` in isolation.
- `package.json` — test script now also runs
  `time-pending-intent-integration.test.js`.
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md` (this file).

### Files removed
No files removed.

### Integration points
- Reused `_resolvePlaceNameReply` (built in Phase 1 for WEATHER)
  as-is for TIME — no new resolver code needed, demonstrating the
  shared-architecture goal.
- `_pendingIntentExecutors()` now has two entries (`WEATHER`, `TIME`);
  the pattern for adding a third (CURRENCY, NEWS, ...) is now
  established by two working examples.

### Tests executed
- `npm test` — 57 tests, all passing (Phase 1's 47 + 10 new: 7
  integration + 3 unit).
- Full suite including `consciousness-fallback.test.js` (not in the
  npm script, kept as-is) run together in one process: 64 tests
  total, all passing — checked again for cross-file interference
  (multiple files now set `global.window`); none found.
- New `test/time-pending-intent-integration.test.js` covers:
  1. "time batao" (no city) → asks, doesn't guess Asia/Kolkata.
  2. Full round trip: "time batao" → "Delhi" → resolves to
     Asia/Kolkata via the city map.
  3. "time in Tokyo" still works directly (no follow-up).
  4. Explicit "timezone Europe/Berlin" still passes through, with
     correct capitalization (catches the pre-existing bug above).
  5. An unrecognized city ("Wakanda") gets a helpful error, not a
     silent wrong guess, and doesn't leave the pending intent stuck.
  6. Explicit English "what's the time" is confirmed to still route
     to the offline (local-device) handler, proving the broadened
     Hinglish regex didn't swallow it.
  7. `pendingIntentFirst = false` restores the exact old Asia/Kolkata
     default for TIME too (kill switch parity with WEATHER).
- New unit tests for `_resolveTimezone()`: known-city mapping,
  case-insensitive lookup, explicit-zone pass-through with
  capitalization fix, and `null` for unknown places.

### Existing features verified
Same as Phase 1 — all pre-existing test files still pass, run both
individually and together with all Phase 1 + Phase 2 test files (no
interference). Electron app launch, STT/TTS/voice, and
Browser/BrowserBrain remain **not verified by this assistant**
(no display/audio/network here) — please smoke-test locally.

### Known issues
1. `CITY_TIMEZONE_MAP` is curated and necessarily incomplete (~45
   entries) — any city not on the list returns a "don't know that
   timezone" message rather than a guess. This is intentional
   (matches the "never guess wrong" principle from Phase 1) but means
   real usage will surface gaps; the map is easy to extend (plain
   object, one line per city) as that happens.
2. Same generic-resolver caveat as Phase 1's known issue #1: WEATHER
   and TIME both now use the tighter `_resolvePlaceNameReply`
   resolver rather than the generic default, which is good, but any
   *future* skill that reuses the generic default resolver directly
   should still double check it fits that skill's parameter shape.
3. Same pending-intent TTL gap as Phase 1 (known issue #2) — still
   not addressed; applies to TIME's pending intent too now.
4. `contextWindowSize` config flag still not wired through (Phase 1
   known issue #3, unchanged).


## Phase 9 — details

### Implemented
- `MemoryEngine.remember()` now handles genuine value changes as
  replacements instead of overwriting the existing record.
- The previous ACTIVE record is retained with `status: SUPERSEDED`;
  the replacement gets a new id and `status: ACTIVE`.
- Repeating the same normalized value keeps the existing record/id and
  refreshes metadata, avoiding unnecessary history.
- The update path defensively prevents multiple ACTIVE values for the
  same key.
- `recall()`, `recallEntry()`, `allRecords()`, `allFacts()`, and
  `buildContextBlock()` remain active-only, so superseded values do not
  leak into normal memory context.
- SUPERSEDED history persists in the existing v2 JSON store.
- Phase 8 extraction automatically inherits this behavior because it
  already routes candidates through `remember()`.
- Replacement events use the existing memory logging style.

### Files created
- `test/memory-update-contradiction.test.js`

### Files modified
- `src/ai/memory.js`
- `test/long-term-memory.test.js`
- `test/memory-extraction.test.js`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- `MemoryEngine.remember()` remains the single memory update boundary.
- No duplicate memory engine, storage system, or AI/LLM dependency was
  introduced.
- Existing Phase 1–8 context, pending-intent, reference-resolution,
  confirmation, structured-memory, and extraction paths remain intact.

### Tests executed
- `node --test test/memory-update-contradiction.test.js` — 5 tests,
  all passing.
- `npm test` — configured regression suite, 127 tests, all passing.

### Test results
**127/127 tests passed. 0 failed, 0 skipped, 0 cancelled.**

### Existing functionality verified
- Long-term memory v2 schema and v1 migration.
- Phase 8 extraction/classification.
- Conversation context and pending intent.
- WEATHER, TIME, CURRENCY, PRODUCT_SEARCH flows.
- Reference resolution and yes/no confirmation.
- Natural command, cognition, bilingual consciousness, and STT tests.

### Known issues
1. Electron UI, real display/audio, STT/TTS live behavior, and
   network-dependent integrations cannot be manually launched in this
   sandbox and still need local smoke testing.
2. Superseded history is retained internally in `memory.json`, but there
   is not yet a dedicated user-facing history/review API.
3. `forget()` remains a hard delete; DELETED status is reserved for the
   future memory-command phase.

### Next phase
**Phase 11 — Reference Resolution + Topic Continuity:** extend follow-up
references and topic continuity across natural-language memory/context
interactions, based on the actual remaining roadmap.

## Phase 11 — details

### Implemented
- Extended the existing reference/topic architecture into the natural-language memory command path.
- Added safe recognition of `forget this`, `forget that`, `forget it`, `forget the same one`, and `forget the previous one` as reference-based memory targets.
- Reference-based forgetting resolves the active conversation topic through bounded `searchMemory()` and deletes only when exactly one ACTIVE memory record matches. Ambiguous or missing targets are refused rather than guessed.
- Added topic-specific memory recall for queries such as `what do you remember about it?` after the existing reference resolver turns `it` into the active topic.
- Topic-specific recall is bounded to 10 records and exposes only returned active records.
- Existing explicit key/type/statement/all memory commands remain unchanged.
- No new AI/LLM, dependency, storage engine, or disconnected command pipeline was introduced.

### Files created
- `test/reference-memory-continuity.test.js`

### Files modified
- `renderer/js/chat.js`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- `processMemoryCommand()` now checks reference-based forget and topic-specific recall alongside the existing Phase 10 memory commands.
- `ReferenceResolver` remains the existing pre-routing topic resolver; Phase 11 consumes its resolved topic text without changing downstream skill implementations.
- `ConversationContextManager.getTopic()` supplies the active subject for safe memory-target resolution.
- Main-process `MemoryEngine` remains authoritative through the existing preload IPC methods.

### Tests executed
- `node --check renderer/js/chat.js`
- `node --test test/reference-memory-continuity.test.js`
- Full configured `npm test` regression suite.

### Test results
Phase 11 reference/topic-memory tests: **5/5 passed**.

### Existing functionality verified
- Phase 10 remember/recall/forget commands.
- Phase 9 contradiction/supersede handling.
- Phase 8 extraction and sensitive-content blocking.
- Existing conversation context, pending intent, reference resolution, confirmation, WEATHER, TIME, CURRENCY, PRODUCT_SEARCH, cognition, bilingual consciousness, natural-command, and STT tests.

### Known issues
1. Electron UI, real display/audio, STT/TTS live behavior, and network-dependent integrations still require local smoke testing in a real desktop environment.
2. Topic-specific memory search remains intentionally bounded and substring-based; semantic retrieval is deferred to the dedicated retrieval/relevance phase.

### Next phase
**Phase 12 — Conversation Summarization:** compress older conversation turns while preserving important decisions, unresolved tasks, technical context, and relevant user context.



## Phase 15 — details

### Implemented
- Added `test/final-integration-regression.test.js` as a final acceptance/architecture regression guard covering the eight core acceptance areas represented by the existing integration suites.
- Added `docs/FINAL_SMOKE_TEST_CHECKLIST.md` consolidating the local desktop checks that cannot be executed in this sandbox: Electron launch/UI, STT, TTS, Browser/BrowserBrain, and network-dependent APIs.
- Added `npm run test:final` for the Phase 15 acceptance guard.
- No production routing, memory, context, API, UI, or dependency implementation was changed for Phase 15.

### Files created
- `test/final-integration-regression.test.js`
- `docs/FINAL_SMOKE_TEST_CHECKLIST.md`

### Files modified
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- The final acceptance guard references the existing Phase 1–14 test suites instead of duplicating their production logic.
- `npm test` remains the complete automated regression command.
- `npm run test:final` provides a focused Phase 15 structural/acceptance check.
- The manual checklist explicitly separates sandbox-unavailable desktop validation from automated Node tests.

### Tests executed
- `node --test test/final-integration-regression.test.js`
- `npm run test:final`
- Full configured `npm test` regression suite
- Syntax checks for the Phase 15 test file and modified JSON
- Complete ZIP integrity check

### Test results
Phase 15 acceptance tests: **8/8 passed**.
Full configured regression suite: **158/158 passed**, 0 failed, 0 skipped, 0 cancelled.

### Existing functionality verified
- WEATHER pending-intent round trip.
- TIME pending-intent round trip.
- CURRENCY multi-parameter continuation.
- PRODUCT_SEARCH multi-parameter continuation.
- Reference resolution and topic continuity.
- Yes/no confirmation context.
- Structured memory, extraction, contradiction handling, commands, and topic-aware retrieval.
- Conversation summarization.
- Natural API/skill integration.
- Debug/diagnostics gating.
- Natural command, cognition, bilingual consciousness, and STT regression suites.

### Known issues
1. The automated environment cannot launch Electron with a real display/audio device, so live UI, STT, TTS, Browser/BrowserBrain, and network-dependent API behavior remain manual local checks.
2. Phase 15 intentionally adds no new product behavior; it consolidates verification and handoff documentation.

### Next phase
**None — all planned phases are complete.**

## Phase 14 — details

### Implemented
- Added `renderer/js/context/DebugDiagnostics.js`, a bounded (150-event)
  renderer diagnostics event bus. It records only when the existing
  `ChatEngine.config.debug` flag is enabled, redacts credential-like detail
  keys, and exposes a safe snapshot/clear API.
- Added `renderer/js/diagnosticsUI.js` and a diagnostics panel to the existing
  HUD. The panel is completely hidden when debug is disabled and shows active
  intent, active topic, pending intent, event count, and the latest bounded
  diagnostic events.
- Added observational route timing events to `ChatEngine._timedRoute()` and
  router-input telemetry. Existing route behavior and return values are
  unchanged.
- Added context telemetry for turn/topic/active-intent/pending-intent/
  confirmation/clear operations, plus pending resolution/cancellation events.
- Added memory telemetry for bounded retrieval, memory save/update results,
  and delete results through the existing memory pipeline. No new memory
  store or retrieval path was introduced.
- Kept all diagnostic collection outside the production execution path: when
  `config.debug` is false, the new event bus records nothing and the UI hides
  itself.

### Files created
- `renderer/js/context/DebugDiagnostics.js`
- `renderer/js/diagnosticsUI.js`
- `test/phase14-debug-diagnostics.test.js`

### Files modified
- `renderer/js/chat.js`
- `renderer/js/context/ConversationContextManager.js`
- `renderer/js/context/PendingIntentManager.js`
- `renderer/index.html`
- `renderer/css/hud.css`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- Existing `ChatEngine.config.debug` is the single gate for the new
  diagnostics event stream.
- `ChatEngine._timedRoute()` supplies route start/completion/failure timing.
- `processBrainRouter()` and Phase 13 natural-skill helpers supply routing,
  active-intent, pending, skill, and bounded-memory telemetry.
- `ConversationContextManager` and `PendingIntentManager` emit state-change
  diagnostics without changing their public contracts.
- Existing HUD/renderer UI loads the new diagnostics module with plain script
  tags; no bundler or dependency was added.

### Tests executed
- `node --check renderer/js/chat.js`
- `node --check renderer/js/context/DebugDiagnostics.js`
- `node --check renderer/js/context/ConversationContextManager.js`
- `node --check renderer/js/context/PendingIntentManager.js`
- `node --check renderer/js/diagnosticsUI.js`
- `node --test test/phase14-debug-diagnostics.test.js`
- Full configured `npm test` regression suite.

### Test results
Phase 14 diagnostics tests: **3/3 passed**.
Full configured regression suite: **150/150 passed**, 0 failed, 0 skipped, 0 cancelled.

### Existing functionality verified
- Existing context/pending-intent architecture remains on the same managers.
- Existing Phase 13 natural API/skill adapter remains the execution path.
- Full configured regression suite: **150/150 passed** after the Phase 14 changes.
- Existing memory IPC remains authoritative; diagnostics add observation only.
- Existing HUD/voice/consciousness/telemetry surfaces remain in place.

### Known issues
1. Electron UI, live display/audio, STT/TTS, Browser/BrowserBrain, and
   network-dependent APIs still require local desktop smoke testing.
2. Existing legacy `console.log` statements elsewhere in the large project
   remain untouched; Phase 14 adds a gated diagnostics stream rather than
   attempting a risky project-wide logging rewrite.
3. The current project keeps `ChatEngine.config.debug` set to `true`; local
   production deployments can set it to `false` to hide/disable the new
   diagnostics surface and event collection.

### Next phase
**None — all planned phases are complete.**

## Phase 13 — details

### Implemented
- Added a single Phase 13 integration adapter in `renderer/js/chat.js`
  around the existing `JARVISNaturalCommandEngine`, rather than duplicating
  API/service implementations.
- Resolved natural intents now write `activeIntent` to the existing
  `ConversationContextManager`, including confidence, entities, and source.
- Before an existing natural skill executes, the router performs a bounded
  relevant-memory lookup through the authoritative existing memory IPC
  (`window.jarvis.ai.searchMemory`). Only ACTIVE records are exposed and the
  limit is configurable (`memoryContextLimit`, default 5). Memory failure is
  best-effort and cannot block the skill.
- Natural-command clarification responses now register through the existing
  `PendingIntentManager` with the detected missing parameter and original
  request.
- Added a generic pending executor for natural-intent skills that do not need
  their own dedicated executor. It combines the original request with the
  user's answer and re-enters the SAME `JARVISNaturalCommandEngine`, avoiding
  duplicate implementations for BOOK_SEARCH, TV_SEARCH, RECIPE_SEARCH,
  POKEMON, IMAGE_SEARCH, VIDEO_SEARCH, GITHUB_SEARCH, NEWS, LOCATION,
  COUNTRY_INFO, KNOWLEDGE, SEARCH_WEB, and other natural skills.
- Existing dedicated WEATHER/TIME/CURRENCY/PRODUCT_SEARCH pending executors
  remain unchanged and continue to handle their specialized parameter logic.
- Added `apiIntegrationFirst` as a kill switch; disabling it restores the
  previous natural-engine behavior without active-intent or memory-context
  injection.

### Files created
- `test/api-skill-integration.test.js`

### Files modified
- `renderer/js/chat.js`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- `processBrainRouter()` → existing `JARVISNaturalCommandEngine` through
  `_processNaturalIntent()`.
- `_processNaturalIntent()` → existing `ConversationContextManager` for
  active intent, existing Memory IPC for bounded retrieval, and existing
  `PendingIntentManager` for clarification/continuation.
- ROUTE -1 → existing dedicated pending executors first; otherwise the new
  generic natural-skill executor re-enters the existing skill engine.
- No existing Weather, Time, Currency, Product Search, Browser, IPC, or
  service implementation was replaced.

### Tests executed
- `node --check renderer/js/chat.js`
- `node --test test/api-skill-integration.test.js`
- Full configured `npm test` regression suite.

### Test results
Phase 13 integration tests: **4/4 passed**.
Full configured regression suite: **147/147 passed**, 0 failed, 0 skipped,
0 cancelled.

### Existing functionality verified
- Conversation context, active intent, pending intent, reference resolution,
  confirmation, and conversation summarization tests.
- WEATHER, TIME, CURRENCY, and PRODUCT_SEARCH pending/multi-parameter flows.
- Structured memory, extraction, contradiction handling, natural-language
  memory commands, and reference-aware memory continuity.
- Natural command, cognition, bilingual consciousness, and STT tests.

### Known issues
1. Electron UI, live display/audio, STT/TTS, Browser/BrowserBrain, and
   network-dependent APIs still require local desktop smoke testing.
2. Relevant-memory retrieval is bounded and substring-based by the existing
   memory search contract; semantic retrieval is intentionally not added here.
3. The generic natural pending resolver is deliberately conservative and
   appends a short answer to the original request; specialized flows keep
   their existing dedicated resolvers where parameter semantics are stricter.

### Next phase
**Phase 14 — UI / Debug / Diagnostics:** integrate the requested context,
memory, routing, and skill diagnostics into the existing debug/UI system
without changing production behavior when debugging is disabled.

## Phase 12 — details

### Implemented
- Added `ConversationSummarizer.js`, a deterministic/local summarizer with no AI/LLM dependency.
- When `ConversationContextManager` exceeds its configured rolling window, the older evicted turns are summarized before the raw window is trimmed.
- The recent-turn window remains bounded at the configured `maxTurns`; summarized information is retained separately in `conversationSummary`.
- Summaries preserve bounded lists for decisions, unresolved tasks, technical context, relevant user context, and topics, plus a compact text representation and summarized-turn count.
- Sensitive credential-like content (passwords, API keys, auth/access tokens, secrets, and common key prefixes) is excluded from summaries.
- `getContext()` now exposes the conversation summary, while `clearAll()` clears both raw turns and the summary.
- Existing active topic, active intent, pending intent, confirmation, reference resolution, and memory-command state remain unchanged.

### Files created
- `renderer/js/context/ConversationSummarizer.js`
- `test/conversation-summarization.test.js`

### Files modified
- `renderer/js/context/ConversationContextManager.js`
- `renderer/index.html`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- `ConversationContextManager.pushTurn()` is the single compaction trigger, so existing `chat.js` turn recording automatically benefits without a second conversation-history pipeline.
- Browser runtime loads `ConversationSummarizer.js` alongside the existing context manager scripts.
- Node tests load the same summarizer module directly.
- Summary data remains short-term/in-process; durable long-term `MemoryEngine` storage was not changed in this phase.

### Tests executed
- `node --check renderer/js/context/ConversationContextManager.js`
- `node --check renderer/js/context/ConversationSummarizer.js`
- `node --check renderer/js/chat.js`
- `node --test test/conversation-summarization.test.js`
- `node --test test/context-managers.test.js test/conversation-summarization.test.js`
- Full configured `npm test` regression suite.

### Test results
Phase 12 summarization tests: **5/5 passed**.
Full configured regression suite: **143/143 passed**, 0 failed, 0 skipped, 0 cancelled.

### Existing functionality verified
- Conversation context rolling window and pending-intent manager.
- Reference resolution and Phase 11 reference-aware memory continuity.
- Yes/no confirmation.
- WEATHER, TIME, CURRENCY, and PRODUCT_SEARCH pending/multi-parameter flows.
- Structured long-term memory, extraction, contradiction handling, and natural-language memory commands.
- Natural command, cognition, bilingual consciousness, and STT test suites.

### Known issues
1. Electron UI, real display/audio, STT/TTS live behavior, and network-dependent integrations still require local smoke testing in a real desktop environment.
2. Summarization is intentionally deterministic and heuristic; it does not semantically understand arbitrary conversation the way an LLM would.
3. Conversation summaries are in-process short-term context and are not persisted across app restart in this phase.

### Next phase
**Phase 13 — Full API / Skill Integration:** extend the complete context → intent → pending → memory → parameters → existing API/skill → response pipeline across the remaining listed skills without replacing their implementations.


## Phase 10 — details

### Implemented
- Extended the existing `isMemoryCommand()` / `processMemoryCommand()`
  route rather than creating a disconnected memory-command pipeline.
- `remember that ...`, `remember this ...`, `don't forget ...`, and
  Hindi remember forms continue through the normal memory route.
- Remember commands now delegate the explicit statement to the main-process
  `MemoryEngine.extractFromMessage()`, so Phase 8 extraction and Phase 9
  contradiction handling remain authoritative and consistent.
- Added natural-language forget parsing for individual keys such as name,
  city/location, project, interest, workflow, and preference.
- Added category-wide forget commands for preferences, projects, interests,
  and workflows, plus `forget everything`.
- Added statement-based forgetting (`forget that I prefer dark UI`) by
  classifying the explicit statement and soft-deleting its matching active
  memory key(s).
- Added bounded local memory search for future/topic-specific recall and
  command support.
- Memory-command deletion uses `DELETED` status and preserves the record
  history in the durable JSON store; the legacy hard-delete `forget()` API
  remains available for compatibility.
- Added dedicated IPC endpoints and preload bridge methods for remember,
  search, key/type/all forget operations, and statement-based forgetting.
- Memory failures remain best-effort and do not crash the ChatEngine route.

### Files created
- `test/memory-commands.test.js`

### Files modified
- `src/ai/memory.js`
- `main.js`
- `preload.js`
- `renderer/js/chat.js`
- `package.json`
- `JARVIS_MEMORY_IMPLEMENTATION_STATUS.md`

### Files removed
No files removed.

### Integration points
- Renderer `ChatEngine` ROUTE 1 → `processMemoryCommand()` remains the
  single natural-language entry point.
- Renderer → preload → Electron main IPC now reaches the authoritative
  `MemoryEngine` instance.
- Phase 8 extraction and Phase 9 replacement/supersede behavior are reused
  rather than duplicated.

### Tests executed
- `node --check src/ai/memory.js`
- `node --check main.js`
- `node --check preload.js`
- `node --check renderer/js/chat.js`
- Phase 8 + Phase 9 memory tests
- Phase 10 memory-command tests
- Full configured `npm test` regression suite

### Test results
Phase 10 command/memory tests: **6/6 passed**.
Full configured regression suite: **133/133 passed**.
0 failed, 0 skipped, 0 cancelled.

### Existing functionality verified
- Structured long-term memory v2 and migration.
- Phase 8 explicit extraction and sensitive-content blocking.
- Phase 9 contradiction/supersede handling.
- Existing conversation context, pending intent, reference resolution,
  confirmation, WEATHER, TIME, CURRENCY, PRODUCT_SEARCH, cognition,
  bilingual consciousness, natural command, and STT tests.

### Known issues
1. Electron UI, real display/audio, STT/TTS live behavior, and network-
   dependent integrations still require local smoke testing in a real
   desktop environment.
2. Natural-language `forget this` without an explicit statement is not
   guessed; a later reference-resolution phase can provide a safe target
   when the conversation has an unambiguous referent.
3. Memory search is intentionally bounded and exact substring based;
   semantic retrieval is deferred to a later retrieval/relevance phase.

