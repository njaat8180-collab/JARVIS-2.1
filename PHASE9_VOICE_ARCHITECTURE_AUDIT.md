# PHASE 9 — Voice Architecture Audit

## Scope
Phase 9 converts the voice path to an offline/local-only speech contract. The existing renderer microphone capture remains the audio source; the main process owns local STT and local Windows TTS.

## Current implementation
- Microphone capture: renderer `getUserMedia` + Web Audio, mono 16 kHz capture, VAD auto-stop, cleanup on every turn.
- STT: `voiceSTT.js` -> `src/speech/localWhisper.js` -> local `whisper.cpp` CLI + local GGML/GGUF-compatible model path.
- Language: raw transcript is preserved; deterministic Hindi/English/Hinglish detection remains in `src/speech/stt.js`.
- TTS: Windows SAPI through PowerShell in the main process. Text is passed through stdin, not interpolated into the script.
- TTS queue: main process serializes speech requests and supports stop/queue clearing.
- Wake-word contract: deterministic transcript gate in `src/speech/wakeWord.js`; browser SpeechRecognition is disabled. A fully ambient local detector requires a verified local wake-word engine/model and is therefore runtime-blocked when absent.
- Browser/cloud STT fallback: disabled.
- Edge/cloud TTS fallback: disabled from the normal speech path.

## Runtime limitation
The supplied ZIP does not contain a verified local whisper.cpp executable or speech model. Therefore real microphone transcription cannot honestly be marked passed from this environment. The runtime reports `STT_RUNTIME_BLOCKED` until `JARVIS_WHISPER_BIN` and `JARVIS_WHISPER_MODEL_PATH` (or supported bundled paths) resolve to real local files.

## Safety
Voice input never bypasses the existing SafetyGate. Spoken text is treated as user input, not as approval for destructive operations.

## Phase 9 verification performed
- Removed the Edge/Microsoft network TTS IPC path and its renderer streaming path.
- Removed `msedge-tts` and the unused `openai` dependency from `package.json`.
- Disabled the legacy model fallback flags (`aiFallback` and `universalAIFallback`) in the chat configuration.
- Added regression coverage for absence of network speech dependencies and safe SAPI stdin handling.
- Node syntax checks passed for `main.js`, `preload.js`, and `renderer/js/voice.js`.
- `npm run test:phase9`: 12/12 passed after the Phase 9 changes.
- Real local STT remains runtime-blocked because this supplied source tree contains no verified whisper.cpp executable/model. No model download was performed.

- Full regression `npm test`: 370/370 passed.
- `npm run test:stt`: setup test passed; real transcription was not claimed because no local runtime/model is bundled.
