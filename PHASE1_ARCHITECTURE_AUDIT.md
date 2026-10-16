# PHASE 1 — ARCHITECTURE AUDIT

**Project:** JARVIS PRO MAX (`jarvis_project`, v4.0.1)
**Scope of this phase:** inspection only — no source files were modified.

---

## 1. What already exists (and must be reused, not duplicated)

| Concern | Existing implementation | Location |
|---|---|---|
| Electron boot order | Main → preload → renderer → `JARVISSystemController` module registry → health check → "online" | `main.js`, `renderer/core/SystemController.js`, `docs/ARCHITECTURE.md` |
| IPC registration | `registerHandler(channel, fn)` — a safe wrapper around `ipcMain.handle` that de-dupes channels via a `registeredHandlers` Set and validates channel names | `main.js` (~L380-430) |
| Module registry | `JARVISSystemController.modules = { brain, intent, reasoning, decision, planning, memory, action, browser, ... }` | `renderer/core/SystemController.js` |
| Long-term memory / persistence | `MemoryEngine` class, disk-backed JSON at `src/database/memory.json`, versioned schema, stable public API (`remember`, `recall`, `forget`, etc.) | `src/ai/memory.js` |
| Chat history persistence | `loadChatHistoryFromDisk()` / `saveChatHistoryToDisk()`, atomic-ish JSON write to `CHAT_HISTORY_FILE` | `main.js` |
| "Learning from mistakes" ledger | `mistakeLearning.js` — disk-backed JSON ledger (`userData/jarvis_mistakes.json`) of wrong-answer → correction pairs | `src/services/mistakeLearning.js` |
| Proactive suggestions | `suggestionEngine.js` — stateless, text-pattern based, always points at a real existing feature | `src/services/suggestionEngine.js` |
| Public/keyless research sources | `wikipediaServiceRaw`, `dataSourcesServiceRaw` (Wikidata, REST Countries, OSM, Open-Meteo, Open Library, TVmaze, TheMealDB, PokéAPI, Google News RSS, Frankfurter) — all run in main process over Node `https`, reached from renderer via IPC | `src/services/wikipedia.js`, `src/services/dataSources.js` |
| Offline resilience | `offlineCache.js` | `src/services/offlineCache.js` |
| Browser automation | `BrowserEngine` class — tabs, history, bookmarks, downloads, bilingual search | `src/browser/browser.js` |
| Health/diagnostics UI | `renderer/js/health.js`, `renderer/js/diagnosticsUI.js` | renderer |
| Dashboard-style UI panel | `renderer/components/dashboard.html` | renderer |
| **Explicitly avoided** | `electron-store` is listed in `package.json` but intentionally **not used** anywhere — a comment in `main.js` (~L7490) notes it would throw if required, so all persistence in this project is plain JSON files | `main.js` |

**Key takeaway:** this project already has the exact building blocks the brief asks for — a safe IPC pattern, a disk-backed JSON persistence convention, a module-registry boot sequence, a mistake-learning ledger, and keyless research services. The Evolution/Self-Improvement system should be built as new modules that plug into these, not as parallel infrastructure.

---

## 2. Proposed integration points (design only, not yet implemented)

- **New main-process module:** `src/evolution/EvolutionEngine.js` — the `BackgroundEvolutionEngine`. Registered and owned the same way `MemoryEngine`/`BrowserEngine` are: instantiated once in `main.js`, exposed to renderer only through `registerHandler`-wrapped IPC channels (e.g. `evolution:getState`, `evolution:pause`, `evolution:approveProposal`).
- **New persistence files** (same convention as `memory.json` / `jarvis_mistakes.json`), under `src/database/evolution/`:
  - `goalRegistry.json` — the 39 permanent Final-JARVIS goals + status fields.
  - `checkpoint.json` — the resumable engine state (current goal/phase/progress/next action).
  - `knowledgeBase.json`, `proposals.json`, `evolutionHistory.json`, `failures.json`.
- **New module-registry key:** `modules.evolution` in `JARVISSystemController`, following the existing pattern (`brain`, `memory`, `browser`, …).
- **New renderer panel:** a "Self-Improvement" section added to `renderer/components/dashboard.html`, driven by a new `renderer/js/evolutionUI.js` (mirrors `health.js`'s poll-and-render style) plus a live feed list.
- **Research:** reuse `wikipediaServiceRaw` / `dataSourcesServiceRaw` patterns (keyless, main-process, `https` only) for anything that needs live lookups; general web reading for documentation/GitHub would need a new narrowly-scoped fetcher module, built the same way (main-process only, read-only, no execution of fetched content).
- **Mistake/failure learning:** the existing `mistakeLearning.js` ledger format is a good template for the new `failures.json` structure — reuse its file-locking/append pattern rather than inventing a new one.

---

## 3. Constraints observed in this environment

- This sandbox has **no general internet access** (only a package-registry allowlist), so the actual research/browsing calls the Evolution Engine will make cannot be exercised end-to-end here — only unit-testable with mocked responses. Real validation needs to happen in your normal dev environment.
- `electron` needs a display to run; boot/restart/UI verification for later phases will need to happen on your machine, not in this sandbox. I can write the code and any headless-safe unit tests here, but "RESTART VERIFIED" / "UI VERIFIED" in later phase reports will depend on you running the app.
- No SQLite dependency exists in the project (confirmed in `package.json`), consistent with everything else here — the plan above sticks to plain JSON files for the same reason `memory.js` did.

---

## PHASE: 1 — Architecture Audit
**STATUS:** COMPLETE

**FILES ADDED:** `PHASE1_ARCHITECTURE_AUDIT.md` (this report)
**FILES MODIFIED:** none
**FILES REMOVED:** none

**TESTS:** none (audit-only phase)
**PASSED:** n/a
**FAILED:** n/a
**WARNINGS:**
- No internet access in this environment — later research-engine testing will be mocked here and needs real-world confirmation on your machine.
- No display in this environment — UI/restart verification for later phases needs to happen on your machine.

**PERSISTENCE VERIFIED:** N/A (no persistence code written yet)
**UI VERIFIED:** N/A
**RESTART VERIFIED:** N/A

**KNOWN LIMITATIONS:** See "Constraints observed" above.

**NEXT PHASE:** Phase 2 — Final Goal Registry (create `src/evolution/goalRegistry.js` + `src/database/evolution/goalRegistry.json` seeded with the 39 permanent goals, status enum, and load/save functions following the `memory.js` persistence convention).
