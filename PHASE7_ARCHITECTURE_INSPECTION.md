# PHASE 7 — ARCHITECTURE INSPECTION

Written before any Phase 7 code was added, per the Phase 7 brief's
"STEP 1 — COMPLETE ARCHITECTURE INSPECTION". Covers what already
exists, what is missing, and exactly which files Phase 7 touches.

## 1. WHAT ALREADY EXISTS

### 1.1 Real system actions (main.js, Electron main process only)

`main.js` already has a large, working, **real** system-action
surface, registered as IPC handlers via `registerHandler(channel,
handler)` (a de-duplicating wrapper around `ipcMain.handle`, see
`main.js` ~L412-560):

- **Power**: `system:shutdown`, `system:restart`, `system:sleep`,
  `system:lock`, `system:logoff` — all implemented by
  `runPowerCommand(executable, args)` (~L9110), which calls
  `execFile(executable, args, { windowsHide: true }, cb)` with a
  **fixed executable name and a fixed args array** (`shutdown` /
  `rundll32.exe` with literal flags) — never a shell string, never
  user-supplied text. Windows-only; every other platform gets a
  clean `failure("Power commands are only available on Windows.")`.
- **App launching**: `system:open-app` (generic name -> app),
  plus direct channels `system:chrome`, `system:vscode`,
  `system:notepad`, `system:calculator`, `system:explorer`,
  `system:settings`. The real logic lives in `launchApplication(name)`
  (~L8836): a `switch` over an **explicit allowlist** of known app
  names/aliases (chrome, edge, firefox, brave, vscode, notepad,
  calculator, explorer, settings, paint, cmd, powershell, task
  manager, control panel, word/excel/powerpoint/outlook/onenote),
  each mapped to a fixed executable via `spawnDetached(exe, args)`
  (~L8327, wraps `child_process.spawn` with `shell` unset i.e.
  `false` — no shell interpolation). Anything not on the list falls
  through to `launchByStartMenuShortcut(name)` (best-effort Start
  Menu shortcut discovery) and, failing that, returns a deterministic
  `failure("I couldn't find \"<name>\" installed on this PC. ...")` —
  it never fabricates a path.
- **System info**: `system:get-platform`, `system:get-memory`,
  `system:get-uptime`, `system:get-version`, `system:get-status`,
  `system:info` — read real values off Node's `os` module.
- **Files**: `file:read`, `file:read-text`, `file:write-text`,
  `file:create`, `file:create-folder`, `file:delete`, `file:move`,
  `file:rename`, `file:exists`, `file:search`, `file:open`.
- **Windows**: `window:*` (minimize/maximize/hide/show/close/reload).

**Important limitation**: these functions (`runPowerCommand`,
`launchApplication`, `openChrome`, `spawnDetached`, etc.) are private
closures inside `main.js` — none are `module.exports`-ed, and several
already call top-of-file `require("electron")` bindings (`app`,
`shell`, etc.) elsewhere in the file. `main.js` cannot be
`require()`-d from a plain Node process (there is no live Electron
app object outside `electron .`), which is exactly why this project's
own test suite (`npm test` = `node --test test/*.test.js`) has never
tested any of this logic directly — it is Electron-runtime-only code.

Also notable: **none of these existing handlers currently enforce an
approval gate** — `system:shutdown` etc. execute immediately when
invoked. Phase 7's STEP 6 approval requirement therefore has to be
enforced in the *new* Phase 6/7 assistant path; it was never present
in the pre-existing IPC surface to begin with.

### 1.2 Real browser actions

`src/browser/browser.js` exports `BrowserEngine`, a class whose
constructor immediately does `new BrowserView(...)` and calls
`electron`'s `BrowserView`/`BrowserWindow`/`session` — again,
Electron-runtime-only, not requireable under plain `node --test`.
Its real method surface (used by `main.js`'s `browser:*` IPC
channels): `navigate`, `back`, `forward`, `reload`, `home`, `stop`,
`zoomIn`, `zoomOut`, `resetZoom`, `findInPage`, `stopFindInPage`,
`addBookmark`, `removeBookmark`, `getBookmarks`, `addToHistory`,
`getHistory`, `clearHistory`, `getDownloads`, `clearDownloads`,
`search`, `getPageInfo`, `printPage`, `savePage`, `getSecurityInfo`.
`main.js` additionally implements tab management (`browser:new-tab`,
`browser:close-tab`, `browser:switch-tab`, `browser:get-tabs`) itself,
on top of `BrowserEngine`.

### 1.3 `src/system/*.js`

`apps.js`, `files.js`, `notifications.js`, `os.js` are all **empty
(0 bytes)** — placeholders that were never filled in. There is
nothing in them to reuse; they are left untouched (still empty) by
this phase rather than being retrofitted for their own sake, since
that would be a stylistic rewrite Phase 7 doesn't need.

### 1.4 Phase 6 assistant layer (`src/assistant/*`)

`taskStore.js`, `classifier.js`, `safetyGate.js`, `taskPlanner.js`,
`taskExecutor.js`, `assistantOrchestrator.js` — all Node-testable,
all dependency-injected (memory/research/browser/system/goalRegistry/
evolutionEngine passed in, never imported directly), exactly the seam
Phase 7 is supposed to plug real adapters into.

### 1.5 IPC / preload

`preload.js` uses `contextBridge.exposeInMainWorld` to expose a
curated `window.jarvis.*` API — no direct Node primitives reach the
renderer. `contextIsolation: true` / `nodeIntegration: false` are set
on `BrowserView`/window creation. `registerHandler()` in `main.js`
already refuses to double-register a channel.

## 2. WHAT IS MISSING FOR PHASE 7

- A **Node-testable** adapter that exposes the same *kind* of
  allowlisted system actions `main.js` already performs for real, but
  that Phase 6's `AssistantOrchestrator`/`TaskExecutor` can call
  through dependency injection and that Phase 7's test suite can
  exercise under `node --test` with a mocked process runner (no live
  OS side effects in CI).
- The same, for browser actions — a small adapter with the exact
  method names `BrowserEngine` already has, so it can be pointed at
  the real engine when wired into `main.js`, or a mock in tests.
- A **second, independent enforcement of the approval gate** at the
  adapter layer itself (STEP 6: "defense in depth... a caller must
  not be able to bypass approval by directly invoking an adapter"),
  since the assistant-layer gate (`safetyGate.js`, from Phase 6) only
  protects callers that go through `AssistantOrchestrator`.

## 3. DECISION: WHAT PHASE 7 WILL AND WILL NOT TOUCH

**Will add (new files only):**
- `src/assistant/systemActionAdapter.js`
- `src/assistant/browserActionAdapter.js`
- `test/system-action-adapter.test.js`
- `test/browser-action-adapter.test.js`
- `test/phase7-assistant-integration.test.js`
- `PHASE7_ARCHITECTURE_INSPECTION.md` (this file)

**Will modify (small, additive changes only):**
- `src/assistant/classifier.js` — add a handful of new destructive
  keywords/patterns Phase 7 introduces (e.g. "terminate process",
  "clear (browser) history") so they route to `system_command` /
  `browser_action` instead of falling through to "unsupported".
- `src/assistant/safetyGate.js` — extend `DESTRUCTIVE_ACTIONS`-style
  keyword coverage for the new destructive browser/system actions
  named in STEP 6 (clearing history, terminating processes, etc.).
- `src/assistant/taskPlanner.js` — recognize a couple of new browser
  sub-actions (new tab / close tab / navigate back-forward) so their
  step `action` strings match what the new adapters expect.
- `src/assistant/taskExecutor.js` — route `execute_application_action`
  / `execute_browser_action` steps through the new adapters' explicit
  methods instead of the previous single generic `open()`/
  `openApplication()` calls, and add the new browser/system step
  actions from STEP 6/9.
- `package.json` — add the three new Phase 7 test files to the
  `test` and add a `test:phase7` script, mirroring the existing
  `test:evolution` convention. No dependencies added or removed.

**Deliberately NOT touched:**
- `main.js` / `preload.js` — Given the size and Electron-runtime-only
  nature of `main.js` (~292KB, no exported functions, requires a live
  `app`/`BrowserWindow`), rewiring its existing `system:*`/`browser:*`
  IPC handlers to delegate into the new adapters is a real, valuable
  follow-up, but it is exactly the kind of large, high-risk rewrite
  of already-working code the brief says to avoid ("do not replace
  working architecture merely for stylistic reasons", "minimal
  changes"). The new adapters use the **same safe primitives**
  `main.js` already uses (fixed executable + args array via
  `child_process.spawn`/`execFile`, never a shell string) so behavior
  stays consistent, but the actual rewiring of `main.js`'s handlers to
  call the shared adapter is left as an explicit, separate follow-up
  rather than done as a side effect of this phase.
- `src/browser/browser.js`, `src/system/*.js` — untouched (the latter
  remain the empty placeholders they already were).
- `src/evolution/*`, `src/services/*`, Phase 6's task lifecycle
  contracts (`taskStore.js`'s schema, `AssistantOrchestrator`'s public
  methods) — untouched; Phase 7 only adds new step actions and two new
  adapters underneath the existing orchestration layer.

## 4. SECURITY BOUNDARIES CARRIED FORWARD INTO PHASE 7

- No generic `execute(command)` surface is exposed to a user request
  at any layer. `systemActionAdapter.js` exposes one method per
  allowlisted action (`openApplication`, `shutdown`, `restart`,
  `sleep`, `lock`, `getSystemInfo`, ...) — there is no method that
  accepts an arbitrary command string.
- All process launches use `child_process.spawn`/`execFile` with a
  **fixed executable name and an array of fixed arguments** — never
  string concatenation, never `shell: true`.
- Destructive actions (shutdown/restart/sleep/lock/terminate
  process/delete/clear history) require `task.approved === true`,
  checked independently in both `safetyGate.js` (assistant layer) and
  inside the adapters themselves (defense in depth) — an adapter
  method for a destructive action refuses to run unless the caller
  explicitly passes `{ approved: true }`.
- Fetched browser/research content is only ever read as plain string
  data; nothing from a browser adapter result is `eval`'d, piped to a
  shell, or used to construct another action.
