# `renderer/js/brain/Consciousness/core/` — orphaned, not loaded (audited, left in place)

This folder (`ConsciousnessConfig.js`, `ConsciousnessState.js`, `ConsciousnessEngine.js`,
`ConsciousnessLifecycle.js`, `ConsciousnessController.js`, and a typo'd
`onsciousnessBootstrap.js`) is **not referenced anywhere** in `renderer/index.html` or
any other loaded script. It was audited during the consciousness upgrade pass and
deliberately left unwired, for a structural reason rather than a quality one:

**Every file in this folder uses Node's `require()` / `module.exports` (CommonJS).**
This app's `BrowserWindow` is created with `contextIsolation: true` and
`nodeIntegration: false` (see `main.js`, the real `webPreferences` block around the
`mainWindow = new BrowserWindow({...})` call). That means the renderer has **no
`require()` at all** — only whatever `preload.js` explicitly exposes on
`window.jarvis`. Loading any of these files as a plain `<script>` tag would throw
`require is not defined` immediately on the first line that needs it
(`ConsciousnessState.js`, `ConsciousnessLifecycle.js`, and `ConsciousnessController.js`
all call `require("events")` at module scope).

In other words: this is well-structured code (a proper state/config/lifecycle/
controller split, an `EventEmitter`-based `ConsciousnessState`, health checks), but it
was written for a **main-process-style** environment and stranded in the renderer
folder — it can't run where it currently sits, regardless of whether it's referenced.

## What actually runs today

The live, working consciousness system is:
- `src/ai/consciousness.js` — main process, plain Node, no Electron-renderer
  constraints. This is what `main.js` actually instantiates and calls.
- `renderer/js/consciousness.js` — the HUD, talks to the above purely over the
  `window.jarvis.ai.consciousnessState()` IPC bridge (see `preload.js`).

This is the system that was upgraded (thought stream, rapport/trust, goal history,
idle-time decay via `tick()`, `stateChanged` events) — see `CURRENT_STATE_CHANGELOG.md`.

## If you want to use this folder's ideas later

The state-machine/lifecycle/controller separation here is a reasonable design for a
*second*, more elaborate consciousness layer — but to actually run, it would need
either:
1. Moving into `src/` and being driven from `main.js` (like `src/ai/consciousness.js`
   is now) instead of the renderer, or
2. Being rewritten without `require()`/`module.exports`, exposing a `window.X` global
   like every other renderer script in this project, and exposed carefully through
   `preload.js` if it needs anything from the main process.

Neither was done here — this pass focused on deepening the system that already works
end-to-end rather than resurrecting a second, disconnected one.
