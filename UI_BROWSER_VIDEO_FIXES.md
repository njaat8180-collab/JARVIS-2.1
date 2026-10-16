# JARVIS UI / Browser / Video Fixes

Updated September 10, 2026.

## Browser
- Switched the embedded browser to `WebContentsView` when supported by Electron, with `BrowserView` fallback.
- Reworked attach/detach logic so the active browser view is reliably placed above the renderer panel.
- Added tracked active view state to prevent the browser from becoming blank after panel/tab switches.
- Fixed the missing `session` import used by the security handlers.

## Media
- Added Wikimedia Commons video search through a new `commons:video-search` IPC channel.
- Added `window.jarvis.data.videoSearch()`.
- Added `VIDEO_SEARCH` natural-language intent for commands such as:
  - `Videos of donkey`
  - `donkey ke videos dikhao`
  - `video search for horse`
- Added native HTML5 video cards with controls to the JARVIS chat.
- Image data-source responses now also carry rich image content so the chat can render the gallery consistently.

## UI
- Added subtle cinematic panel entrance motion and browser chrome motion.
- Added responsive one-column media layout for smaller windows.

## Verification
- `npm test`: 25/25 passed.
- JavaScript syntax checks passed for all modified JS files.
- Full GUI/network runtime was not executed in this build environment, so Google/Wikimedia live loading should be verified on the target Windows machine.
