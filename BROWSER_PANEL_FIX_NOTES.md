# Browser Search → In-App Panel Fix (applied)

## Bug 1: Search always opened externally in the OS default browser (Edge)
File: `renderer/js/brain/browser/browserExecution.js` → `openURL(url)`
Before: always called `window.jarvis.openURL(url)` → IPC `browser:open-url` →
`main.js` → `shell.openExternal(url)`. This is a real handler, but it's meant
for "open externally", not for normal search/navigate.
Fix: `openURL()` now first tries `window.BrowserUI.showPanel()` +
`window.BrowserUI.navigate(url)` (the in-app embedded Browser panel under the
dashboard). It only falls back to the external-browser IPC call if
`window.BrowserUI` isn't available for some reason.

## Bug 2: The in-app Browser panel never opened, even from voice search
File: `renderer/js/browserUI.js`
Before: the module was declared as `const BrowserUI = (() => {...})();` at
top-level script scope. In a plain (non-module) `<script>` tag, top-level
`const`/`let` do NOT become properties of `window` — only `var` does. So
`window.BrowserUI` was `undefined` everywhere else in the app
(`browserVoiceControl.js`, and now `browserExecution.js`), and every
`window.BrowserUI.showPanel()` call silently did nothing.
Fix: added `window.BrowserUI = BrowserUI;` right after the IIFE, so the
panel API is actually reachable from other scripts.

## Not changed: "consciousness layer" replies
This is documented, intentional behavior (see `CONSCIOUSNESS_UI_FIX_REPORT.txt`
and `docs/CONSCIOUSNESS_ORPHANED_CORE.md`), not a bug:
- The consciousness layer answers identity/state questions
  ("who are you", "are you conscious", etc.) and acts as a fallback when no
  real AI engine is configured — it does not flavor every normal reply.
- `renderer/js/brain/Consciousness/core/` is deliberately unwired because it
  uses Node's `require()`, which doesn't exist in the renderer
  (contextIsolation: true, nodeIntegration: false).
If you want every reply to be consciousness-influenced, that's a feature to
build, not a fix — happy to help with that separately if you want it.
