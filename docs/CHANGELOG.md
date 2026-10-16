# JARVIS PRO MAX — Changelog

## 2026-10-11 — Intent guardrails and date support

### Changed
- `renderer/js/language/LanguageCore.js`: TIME and WEATHER now require an explicit question or command; added a narrow DATE intent for current-date requests.
- `renderer/js/brain/naturalCommandEngine.js`: mirrored the explicit-request gates, added DATE execution, and stopped NEWS from routing on a bare conversational mention.
- `test/nlu-intent-guardrails.test.js`: added positive and negative regression coverage for time, date, weather, and news false triggers.

### Root Cause
- Scripted fallback rules were selecting an intent from a keyword anywhere in a sentence, so ordinary phrases containing words such as “time”, “date”, “weather”, or “news” could be executed as live-data commands.

### Verification
- `node --test test/nlu-intent-guardrails.test.js` — 1/1 passing.
- `node --test test/natural-command-engine.test.js` — 29/29 passing.

### Regression
- Ambiguous mentions now fall through to conversational handling instead of returning a potentially wrong live-data answer.

### Status
VERIFIED

## Format

For every meaningful change:

```text
## YYYY-MM-DD — Phase X
### Changed
- file: description

### Root Cause
- reason

### Verification
- test performed
- result

### Regression
- result/risk

### Status
VERIFIED
```

## 2026-09-12 — TTS latency fix (Edge TTS streaming)

### Changed
- `main.js`: `voice:speak-edge` handler no longer buffers the entire
  synthesized MP3 before responding. It now streams each audio chunk to
  the renderer in real time via `voice:edge-audio-chunk` /
  `voice:edge-audio-end` / `voice:edge-audio-error` IPC events as soon
  as Microsoft's voice service produces them, and reuses one open
  `MsEdgeTTS` connection per voice instead of reconnecting on every
  reply. Added first-chunk/total timing logs for future debugging.
- `preload.js`: exposed `onEdgeAudioChunk` / `onEdgeAudioEnd` /
  `onEdgeAudioError` listeners and the matching IPC channel constants.
- `renderer/js/voice.js`: added `speakWithEdgeTTSStreaming()`, which
  plays audio via `MediaSource`/`SourceBuffer` starting from the very
  first streamed chunk, instead of waiting for the whole reply. The old
  full-buffer path is kept as `speakWithEdgeTTSBuffered()` and used
  automatically as a fallback if `MediaSource` / streaming isn't
  available. Also cached `getMyVoiceSettings()` for 5s so it isn't
  re-fetched over IPC on every single reply.
- `renderer/js/tts.js`: `window.TTSEngine.speak()` (used by
  `voiceAgent.js` and `browserResearchLoop.js`) now delegates Edge TTS
  playback to `window.VoiceEngine.speakWithEdgeTTS()` so it gets the
  same streaming behavior instead of duplicating the old buffered call.

### Root Cause
Chat replies appeared in the UI instantly, but the spoken reply lagged
1-4+ seconds behind because `voice:speak-edge` synthesized the ENTIRE
audio clip, base64-encoded all of it, and only then sent it back over
IPC - no audio played until that whole round-trip finished. Two
separate TTS code paths (`renderer/js/voice.js` and
`renderer/js/tts.js`) both had this same buffer-everything pattern.

### Verification
- `node --check` passed on `main.js`, `preload.js`, `renderer/js/voice.js`,
  `renderer/js/tts.js`.
- Manual code trace of both call paths (`chat.js` -> `voice.js` ->
  `voice:speak-edge`, and `voiceAgent.js`/`browserResearchLoop.js` ->
  `tts.js` -> `voice:speak-edge`) confirmed both now use the streaming
  method with the old buffered method only as a fallback.
- NOT run against a live Electron window / real network in this
  environment (no GUI/network sandbox here) - please smoke-test a
  real voice reply after pulling this build.

### Regression
- Low risk: the fully-buffered `audioBase64` response is still
  returned by `voice:speak-edge` for any caller that isn't set up to
  listen for the streamed events, so nothing that depended on the old
  contract should break.
- If `MediaSource`/`audio/mpeg` MSE support is ever missing in the
  Electron/Chromium build being used, playback automatically falls
  back to the pre-fix buffered path - same behavior as before, no
  worse.

### Status
NEEDS_MANUAL_VERIFICATION (code-complete, not runtime-tested - no
Electron/audio-device sandbox available in this session)

## 2026-08-24 — Phase 0

### Changed
- Established repair/freeze baseline.
- Recorded known historical errors.

### Status
BASELINE

## 2026-08-26 — Documentation Foundation

### Changed
- Added Claude Code master instructions.
- Added architecture, file map, IPC, voice, brain, memory, browser, UI, error, roadmap, and test documentation.

### Status
READY FOR PHASE 1
# 2026-10-11 — Reliability hardening

- Hardened JSON persistence against Windows `EPERM`/file-lock replacement failures with bounded retries, complete-file fallback, and temp cleanup.
- Fixed assistant file verification in managed environments where `realpath()` is denied despite readable files.
- Prevented late Whisper results from aborted or timed-out voice turns from executing as stale commands.
- Added persistence resilience coverage and documented runtime limitations.

