# JARVIS Final Smoke-Test Checklist — Phase 15

This checklist is for the local desktop environment. The sandbox used for automated validation has no Electron display/audio device and no network access, so these checks must be performed on the user's machine.

## 1. Launch and UI
- [ ] Run `npm start`.
- [ ] JARVIS window opens without a renderer crash.
- [ ] Existing HUD/dashboard loads normally.
- [ ] Chat input and send controls work.
- [ ] Existing controls remain clickable.
- [ ] With `ChatEngine.config.debug = true`, the diagnostics panel is visible and receives events.
- [ ] With `ChatEngine.config.debug = false`, the diagnostics panel is hidden and no new diagnostics are collected.

## 2. Conversation/context
- [ ] Ask a short follow-up that depends on the previous topic (for example, NASA → "What is it?").
- [ ] Confirm the follow-up resolves to the active topic.
- [ ] Start a pending skill and answer its clarification question.
- [ ] Confirm the pending intent clears after successful resolution.
- [ ] Try an unrelated command while a pending intent is active and confirm it is not swallowed.

## 3. Existing API/skill flows
- [ ] WEATHER: `weather batao` asks for a city, then completes after a city reply.
- [ ] TIME: `time batao` asks for a city, then completes after a city reply.
- [ ] CURRENCY: complete the multi-parameter continuation.
- [ ] PRODUCT_SEARCH: complete category → budget → use-case continuation.
- [ ] Test at least one direct natural command that does not require clarification.

## 4. Memory
- [ ] Remember a safe preference/fact through normal chat.
- [ ] Ask what JARVIS remembers about that topic.
- [ ] Update a preference and confirm the old value is superseded.
- [ ] Forget a safe memory and confirm it is no longer ACTIVE.
- [ ] Confirm credential-like content is not persisted.

## 5. Voice/browser/network-dependent features
- [ ] STT starts and returns a transcript.
- [ ] TTS speaks a response.
- [ ] Browser/BrowserBrain opens and processes a supported request.
- [ ] Network-dependent skills work with the user's network configuration.

## 5A. Computer Use
- [ ] Press **Control** and confirm the Computer Use panel reports an active session.
- [ ] Share a harmless target window, then test one click and one scroll action.
- [ ] Test typing, a key press, double-click, and right-click; each must show an action-time confirmation.
- [ ] Press **Emergency stop** and confirm subsequent actions are refused until the session is started again.
- [ ] Confirm passwords, payment details, security prompts, terminal commands, and arbitrary executable paths are not used in the demo.

## 6. Final regression
- [ ] Run `npm test` and save the pass/fail/skip counts with the submission date.
- [ ] On a normal Windows desktop, rerun any localhost HTTP integration tests that were blocked by the validation environment; do not report sandbox permission failures as product behavior.
- [ ] Record the local Electron/STT/TTS/browser results separately from automated Node test results.

## 7. Submission evidence
- [ ] Capture the app version, Windows version, Node/npm versions, configured model names, and whether the run was online or offline.
- [ ] Keep screenshots/video free of API keys, personal messages, private browser history, and local file paths that should not be public.
- [ ] Attach the installer from `dist/` only after it launches successfully on a clean Windows profile.
