# JARVIS PRO MAX — Error Log

## Status Values

- OPEN
- INVESTIGATING
- FIXED
- VERIFIED
- WONT_FIX
- DUPLICATE

## Critical Baseline

### E001 — DiagnosticsAPI Undefined

Status: OPEN / VERIFY AGAINST CURRENT REPOSITORY

Historical error:
```text
ReferenceError: DiagnosticsAPI is not defined
at preload.js
```

Priority: P0

Investigation:
- locate definition
- locate references
- inspect preload execution order
- inspect contextBridge exposure
- inspect renderer consumers

Verification:
- preload loads
- diagnostics API is available
- no new bridge errors

---

### E002 — Preload Script Load Failure

Status: OPEN / VERIFY

Historical error:
```text
Unable to load preload script
```

Priority: P0

Investigation:
- preload path
- preload syntax
- Electron BrowserWindow configuration
- runtime exceptions during preload execution

---

### E003 — SystemController Not Found

Status: OPEN / VERIFY

Historical error:
```text
SystemController.js
net::ERR_FILE_NOT_FOUND
```

Priority: P0

Investigation:
- actual file location
- index.html script path
- case sensitivity
- relative path
- load order
- duplicate versions

---

### E004 — ChatEngine Undefined bind

Status: OPEN / VERIFY

Historical error:
```text
Cannot read properties of undefined
(reading 'bind')
```

Priority: P0

Investigation:
- inspect exact line
- identify `.bind()` receiver
- trace constructor dependency
- inspect initialization order
- inspect AgentManager registration

---

### E005 — AgentManager Missing ChatEngine

Status: OPEN / VERIFY

Historical warning:
```text
ChatEngine Missing
```

Priority: P1

---

### E006 — AgentManager Missing SelfLearningAgent

Status: OPEN / VERIFY

Historical warning:
```text
SelfLearningAgent Missing
```

Priority: P1

---

### E007 — Voice/STT Reliability

Status: PARTIALLY FIXED (see below) — re-verify after `npm install`

Symptoms historically included:
- unreliable voice capture
- transcript routing problems

Priority: P0/P1

Investigation:
- microphone
- STT
- listeners
- transcript lifecycle
- ChatEngine handoff

Root causes confirmed this pass:
1. `node_modules` was never installed at all (`@huggingface/transformers`,
   `mic`, `electron` itself missing) — nothing in the app, voice included,
   can run until `npm install` is run in the project folder. See
   STT_NOT_WORKING_FIX.md.
2. Genuine bug: `renderer/js/voice.js` gave the `voice:transcribe` IPC call
   a flat 20s timeout. The FIRST transcription after a fresh install has to
   download the Whisper model (~40-70MB) from Hugging Face before it can
   transcribe anything, which routinely takes longer than 20s on a normal
   connection — so a user's very first mic attempt looked broken
   ("Transcription timed out") even though the model was still loading
   correctly in the background. Fixed by:
   - `voiceSTT.js`: added `warmUp()` (kicks off model download/load in the
     background right when the app starts, instead of waiting for the
     user's first mic tap) and `getModelStatus()`.
   - `main.js`: calls `voiceSTT.warmUp()` on `app.whenReady()`, and exposes
     a new `voice:model-status` IPC handler.
   - `preload.js`: exposes `jarvis.voice.modelStatus()`.
   - `renderer/js/voice.js`: checks model status before transcribing —
     uses a 120s timeout (+ a "DOWNLOADING VOICE MODEL..." status) only
     while the model is still loading, and the fast 20s timeout once it's
     warm (which, thanks to warm-up-on-startup, is true for almost every
     real turn).

Still needs a live run to verify (no GUI in this environment):
- Confirm the model actually finishes downloading/caching successfully on
  a real machine (network/firewall dependent).
- Confirm mic OS permission prompts behave as expected on the target OS.
- wake-word lifecycle

### E008 — Embedded Browser Panel: Nav Buttons & Tools Dead

Status: FIXED (needs live re-verify — no GUI in this environment)

Priority: P0/P1

Root causes found in `renderer/js/browserUI.js`:
1. Back/Forward/Reload/Home buttons called `window.jarvis.browser.back()` /
   `.forward()` / `.reload()` / `.home()`. None of those methods exist on
   the preload bridge (it only exposes `goBack(tabId)`, `goForward(tabId)`,
   `reload(tabId)`, and there is no "home" channel at all) and none were
   passed the active tab id. Every click threw silently and did nothing.
2. Reading mode / privacy mode toggles called
   `setReadingMode()`/`setPrivacyMode()` on the bridge, which don't exist
   either — both features are actually pure renderer-side CSS toggles, so
   these calls were dead weight throwing console errors on every toggle.
3. The "..." tools menu button had no click handler — the dropdown
   containing zoom/find/print/save-page could never be opened.
4. Zoom in/out/reset, find-in-page (+ match counter), print, save-page,
   and the downloads panel all had working main-process IPC
   (`registerPageToolsIPC`/`registerDownloadsIPC`) and finished HTML
   already in `index.html`, but zero renderer wiring — no event listeners,
   no implementation functions at all.
5. `browserVoiceControl.js` calls `window.BrowserUI.newTab()`,
   `.toggleBookmarkForActiveTab()`, `.showBookmarksPanel()`,
   `.showHistoryPanel()`, `.showDownloadsPanel()`, `.zoomIn()`,
   `.zoomOut()`, `.zoomReset()`, `.printActiveTab()`,
   `.savePageActiveTab()`, `.findInPage()` — none of these existed on
   `BrowserUI`'s public API, so every voice browser command using them
   failed with "is not a function".
6. Bonus inconsistency (fixed, not just patched around): the bookmark
   star button reads/writes `localStorage["jarvisBookmarks"]`, while
   `window.jarvis.bookmarks.*` is a completely separate, disk-persisted
   store main.js maintains that the UI never reads. The new
   `toggleBookmarkForActiveTab()` (for voice) was written against the
   localStorage store so it actually shows up in the same panel the user
   sees, not the disconnected disk store.

Fix: implemented all of the above in `renderer/js/browserUI.js` — correct
method names + tabId args for nav buttons, removed the two dead
reading/privacy IPC calls, wired the tools menu button, implemented and
wired zoom/find/print/save-page/downloads end-to-end, added the missing
`newTab`/`showBookmarksPanel`/`showHistoryPanel`/`showDownloadsPanel`/
`toggleBookmarkForActiveTab`/`zoomIn`/`zoomOut`/`zoomReset`/
`printActiveTab`/`savePageActiveTab`/`findInPage` functions and exported
them from `BrowserUI`'s public API.

Still needs a live run to verify (no GUI in this environment):
- Actually click through back/forward/reload/home, zoom, find, print,
  save-page, downloads panel, and the voice equivalents of each on a real
  machine.

### E009 — No Real AI Engine Wired (Architectural Finding, Not a Bug)

Status: CONFIRMED, BY DESIGN — documented here so nobody "fixes" it by accident

`renderer/js/ai.js` → `askAI()` → IPC `ai:ask` → `handleAIAsk()` in main.js
ALWAYS returns `handled: false` without ever calling a cloud AI. The
function's own comment says why: "No cloud call, no key check, no error —
just tell the router this route didn't produce a reply so the local
pipeline handles it." Every reply JARVIS gives currently comes from the
local rule-based pipeline (`chat.js`'s router → `brain.js` → agents →
consciousness fallback), not from a language model. This was a deliberate
choice in an earlier session (a `GEMINI_API_KEY` path used to exist and
was removed). If "JARVIS feels dumb", this is the root architectural
reason — not a bug to patch, but a product decision: either wire in a
real LLM (needs an API key the user provides) or keep investing in the
local rule-based brain.

Also found and fixed while investigating this: `registerAIIPC()` was
defined TWICE in `main.js` (~line 4823 and ~line 9518). The second
definition silently wins in JS (later `function` declarations override
earlier ones of the same name in the same scope) — so the FIRST one,
which registered an unused `"ai:chat"` channel with fuller chat-history
persistence via `callAvailableAI()`, was 100% dead code; nothing in
preload.js ever exposed `"ai:chat"` to the renderer anyway, so it also
could never have been called even before being shadowed. Left as
documented dead code rather than deleted, since removing it isn't
necessary for correctness and it's a large diff for zero behavior change.

### E010 — actionAgent.js: ~730 Lines of Byte-Identical Duplicate Methods

Status: FIXED

File: `renderer/js/brain/agents/actionAgent.js`

`browserAction()`, `extractURL()`, `executeWorkflow()`, `executePlan()`,
`runTask()`, and `getHistory()` were each defined TWICE inside the same
class (`JARVISActionAgent`), back to back, byte-for-byte identical (diffed
to confirm — not two different versions, an exact accidental duplicate of
~730 lines). Per JS class semantics the second copy silently wins, so
this wasn't breaking anything at runtime, but it's dead weight that makes
the file harder to read/maintain and risks someone editing the dead copy
by mistake and wondering why nothing changes.

Fix: deleted the first (dead) copy. File went from 3666 → 2930 lines.
Verified syntax is valid and each method now appears exactly once.

### E011 — Meme Sounds: 24 of 50 Sound IDs Were Unreachable

Status: FIXED (code side) — audio files themselves still need to be
supplied by the user, see MEME_SOUNDS_SETUP.md

`assets/sounds/memes/memeSounds.json` and the `files` map in
`renderer/js/jarvisMemeSounds.js` both already defined all 50 sound ids,
but `manifest.rules` (the categories `trigger()`/`triggerFromResponse()`
actually pick from) only referenced 26 of them. The other 24 —
`emotional-damage`, `sad-violin`, `record-scratch`, `wow`, `metal-pipe`,
`vine-cat`, `cat-scream`, `chicken-scream`, `frog`, `mlg-airhorn`,
`trololo`, `coffin-dance`, `why-are-you-running`, `thinking`,
`notification`, `mission-complete`, `click`, `whoosh`, `suspense`,
`bruh-extended`, `nope`, `sigma-transition`, `galaxy-brain`,
`instant-regret` — could never be selected no matter what happened,
even with the audio files present.

Also, there were no actual `.mp3` files in `assets/sounds/memes/` at all
(only the JSON config) — nothing could play regardless of the code.

Fix:
- Rewrote `manifest.rules` so every one of the 50 ids is reachable
  through at least one category, and added a few new categories
  (`taskComplete`, `notify`, `ui`) to give the previously-orphaned ids a
  sensible home.
- `triggerFromResponse()` now also takes the chat router's `source`
  (`"browser"`, `"taskPlanner"`, `"goals"`, etc. — see chat.js) so a
  reply from an actual finished task pipeline reaches for
  `taskComplete` sounds more often than a plain chat reply does.
- Added `triggerForTask(taskName, outcome)` for direct "this specific
  task just finished" hooks, wired into: opening a new browser tab
  (`browserUI.js` `createNewTab()`), and a download completing/failing
  (`browserUI.js` downloads event listener — this needed its own bug
  fix too: the `downloads:event` payload is the full download list,
  re-sent on every progress tick, not a single item's new state, so a
  naive read would have replayed the same sound on every tick after a
  download finished; now it tracks which download ids have already
  been reacted to).
- `MEME_SOUNDS_SETUP.md` now explains, explicitly, that the actual audio
  files are not something Claude can add (copyright), and exactly what
  filenames to drop into `assets/sounds/memes/`.

### E012 — Dead Third `app.whenReady()` Block Swallowed Real Functionality + Quit-Time Crash

Status: FIXED

Priority: P0

File: `main.js`

This file has three `app.whenReady()` blocks. Only the first two ever run:
the first sets `appReady = true` synchronously as soon as Electron is
ready; the third checks `if (appReady) return;` and therefore bails
immediately, every time, unconditionally. (The second block's own
version of this same problem — `registerBrowserIPC()` and friends
living only in the dead third block — was already found and fixed
before this pass; see the comment in `registerExtendedIPC()`. This
entry covers what was missed in that pass.)

Still living only inside the dead third block, and therefore never
actually executing:

1. `registerSecurityHandlers()` — mic permission gating (`media` only
   on `file://` pages), `setWindowOpenHandler` denial +
   `shell.openExternal` redirect for legitimate external links, and
   `will-navigate` protection. None of this security boundary was
   enforced.
2. `registerChatFileIPC()` and `registerPowerIPC()` — their IPC
   channels were never registered with `ipcMain`.
3. `require("./src/ai/embeddedBrain").warmUp()` — the offline brain
   model never pre-warmed on startup, so the first real question
   always paid a cold-start cost (the same class of bug already fixed
   for Whisper/STT in E007, just for the local LLM brain instead).
4. The consciousness idle-decay heartbeat (`initConsciousness().tick()`
   every 30s + the `stateChanged` log listener) never started.

Root Cause (second, more serious bug found while investigating #4):
the dead block set `consciousnessHeartbeat = setInterval(...)` but
`consciousnessHeartbeat` was **never declared** anywhere with
`let`/`var`/`const`. `main.js` runs under `"use strict"`. The
always-live `before-quit` handler (a plain top-level `app.on(...)`,
not inside any `whenReady` block) reads that same undeclared
identifier: `if (consciousnessHeartbeat) { ... }`. Under strict mode,
reading an undeclared identifier throws `ReferenceError:
consciousnessHeartbeat is not defined` — synchronously, inside the
handler. That meant **every real app quit crashed inside
`before-quit`**, immediately after `shuttingDown = true`, which meant
`saveChatHistoryToDisk()` — the final safety flush documented right
next to it as guaranteeing the last few messages are on disk — never
ran. This was live and active regardless of the three-`whenReady`
issue; it would have thrown even if the dead block had run, since it
never used `let` either.

Fix:
- Declared `let consciousnessHeartbeat = null;` with the other global
  state (`mainWindow`, `appReady`, `shuttingDown`) near the top of
  `main.js`, so the `before-quit` handler always has a valid variable
  to read regardless of anything else.
- Moved `registerChatFileIPC()`, `registerPowerIPC()`,
  `registerSecurityHandlers()`, and the embedded-brain `warmUp()` call
  into `registerExtendedIPC()`, which the live (second) `whenReady`
  block actually calls.
- Moved the consciousness heartbeat setup (now correctly assigning the
  declared `consciousnessHeartbeat`) into the live block, right after
  `createMainWindow()` succeeds.
- Left the dead third block in place, per this project's established
  convention of documenting rather than silently deleting dead code
  (see E009), but added a comment explaining exactly why it's dead and
  where each piece of functionality now actually lives.

Tests: `npm test` — 160/161 pass, same as baseline before this change
(the one pre-existing failure, "cloud AI remains disabled by the
existing fallback policy", is unrelated and was already failing before
this fix).

Regression Risk: Low. All four moved calls are idempotent
registration functions already called this same way elsewhere in the
live path (same pattern as the already-fixed `registerWikipediaIPC()`
case); the heartbeat is a new `setInterval` that only ever calls a
function that already has its own internal try/catch.

Still needs a live run to verify (no GUI/Electron runtime in this
environment):
- Confirm mic permission prompts, window-open external-link handling,
  and navigation blocking actually behave as expected on a real
  machine now that `registerSecurityHandlers()` runs.
- Confirm the embedded brain's warm-up doesn't measurably slow down
  window creation on first launch.
- Confirm quitting the app no longer throws, and the final chat
  history flush actually happens (check console for the
  `ReferenceError` — it should be gone).

## New Error Template




```text
ID:
Date:
Phase:
File:
Function:
Error:
Priority:
Root Cause:
Fix:
Tests:
Status:
Regression Risk:
```
