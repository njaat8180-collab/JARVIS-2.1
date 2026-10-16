# JARVIS — Offline Whisper STT + Ollama Local AI Integration

Migration report for the Vosk/Srivani → **offline whisper.cpp** STT swap and the
**Ollama** local AI integration. Implemented directly in the existing project —
no demo code, no mocks, no cloud APIs, no API keys.

---

## 1. Final architecture

```
MICROPHONE (renderer getUserMedia + VAD auto-stop)
    ↓  Float32Array @16 kHz via IPC (voice:transcribe)
OFFLINE WHISPER STT  (stt/whisper/provider.js — whisper.cpp subprocess)
    ↓  (fallback: transformers.js Whisper — src/speech/whisperFallback.js)
RAW TRANSCRIPT  (rawText — exactly what Whisper produced)
    ↓
TEXT NORMALIZATION  (stt/correction.js + renderer VoiceTolerance layer)
    ↓
INTENT / COMMAND CLASSIFICATION  (existing renderer ChatEngine route cascade)
    ↓
┌─────────────────────────────────────┐
│ Deterministic JARVIS command (FIRST)│  browser / apps / system / memory /
│ OR                                 │  knowledge / offline routes…
│ Natural conversation (LAST)        │
└─────────────────────────────────────┘
       ↓                            ↓
Action Engine + SafetyGate    ai:ask → deterministicBrain
(wake-gated, confirmation      (knowledge-first)
 for destructive actions)          ↓ knowledge missing?
       ↓                      Ollama local AI (src/ai/ollamaClient.js)
PC Action / Browser                ↓ (text ONLY — never executed)
       ↓                      natural reply (Hindi/Hinglish/English)
TTS (XTTS-v2 → Windows SAPI — unchanged)
    ↓
JARVIS UI
```

**Deterministic commands always win.** Ollama is reached only through ROUTE 6
(`processAI` → `ai:ask` → `handleAIAsk`) after every deterministic route in the
existing ChatEngine cascade has been tried, and inside `handleAIAsk` only when
the deterministic brain has no verified knowledge.

**Safety:** Ollama NEVER receives OS execution capability. Its output is plain
conversational text, shown/spoken to the user. All PC actions — including
shutdown, file operations, process control — remain exclusively in the existing
deterministic Action Engine / SafetyGate pipeline with the existing
confirmation/approval system for destructive actions.

---

## 2. Whisper STT (offline, whisper.cpp)

**Primary engine:** `stt/whisper/provider.js` — the official whisper.cpp CLI
as a local subprocess. No Python, no cloud, no native Node binding.

- **Model:** multilingual GGML Whisper. Default **`base`** (148 MB) — chosen
  for the target hardware (Ryzen 5 3400G, 8 GB RAM, CPU-only): good Hindi +
  English + Hinglish accuracy at a usable CPU cost. Configurable:
  `tiny` (~78 MB, fastest) / `base` / `small` (~488 MB, best accuracy, ~3x
  slower on CPU).
- **Auto-setup:** on first launch the app downloads the official prebuilt
  whisper.cpp runtime for the platform (win-x64 CPU build on Windows) into
  `models/whisper/bin/` and the GGML model into `models/whisper/` — **once**,
  then fully offline forever. Progress is reported to the UI
  (`voice:model-download` events) and the status box shows
  `WHISPER DOWNLOADING…`.
- **Model status states:** `READY` / `NOT_INSTALLED` / `DOWNLOADING` / `ERROR`
  (exposed via `voice:model-status`).
- **Binary discovery order:** config/env path → bundled `models/whisper/bin/`
  → system PATH (`whisper-cli`, `main`, `command`, `whisper`) → auto-download.
- **Language handling:** `auto` detect by default (best for Hinglish),
  forceable to `hi` / `en` via `STT_LANGUAGE` or `whisperLanguage` config.
- **Confidence:** whisper.cpp's JSON output carries no reliable per-utterance
  confidence — the STT result returns `confidence: null` instead of inventing
  one.
- **Robustness:** transcriptions are serialized (never two overlapping
  whisper.cpp processes), per-utterance timeout (default 120 s), temp WAV
  cleanup, corrupt-model detection with a human-readable re-download hint.
- **Fallback engine:** the existing transformers.js Whisper
  (`src/speech/whisperFallback.js`) stays as the in-process backup when
  whisper.cpp can't be made available.
- **Engine modes** (`config/voice_settings.json` → `engine`):
  `auto` (default) / `whisper` (whisper.cpp only) / `whisper-js` (fallback
  engine only). Legacy config values `vosk`/`sravaani` map to `auto`.

**Configuration** (config/voice_settings.json, env overrides in brackets):
`whisperModel` [WHISPER_MODEL], `whisperModelPath` [WHISPER_MODEL_PATH],
`whisperExecutable` [WHISPER_CPP_PATH], `whisperAutoDownload`
[WHISPER_NO_DOWNLOAD=1 disables], `whisperLanguage` [STT_LANGUAGE],
`whisperTimeoutMs`, `whisperThreads`.

Pre-download everything ahead of time: `npm run setup:whisper`.

---

## 3. Ollama local AI (optional, conversation only)

**Client:** `src/ai/ollamaClient.js` — thin HTTP client for the local Ollama
server. Default endpoint `http://127.0.0.1:11434`, configurable via
`OLLAMA_BASE_URL` env or `config/ai_settings.json` (`ollamaBaseUrl`).

- **Health check** (`ollama:status` IPC): `installed` (CLI on PATH),
  `running` (verified by a **real `/api/tags` server probe** — never just the
  executable existing), `models`, `selectedModel`, `error`.
- **Model selection:** explicit `OLLAMA_MODEL` env / `ollama:set-model` IPC
  (persisted in `config/ai_settings.json`) → auto-preference among installed
  models → smallest installed model. **Models are never downloaded
  automatically** (they're several GB) — the only manual step for the user is
  installing Ollama and pulling one model (`ollama pull llama3.2`).
- **Chat** (`ollama:chat` IPC): validated message payloads, real timeouts,
  malformed-response handling. Conversation only — output is never executed
  and never becomes an OS action.
- **Graceful degradation:** Ollama absent/stopped/modelless never crashes
  JARVIS — the deterministic pipeline answers instead and the UI shows
  `OLLAMA ○ OFFLINE` / `LOCAL AI OFFLINE`.

**Conversation integration** (`handleAIAsk` in main.js): when the deterministic
brain has no knowledge, the message (plus the JARVIS persona from
`prompts/personality.txt`, remembered facts via the existing memory engine's
context block, recent working-memory turns, and offline local knowledge) goes
to the local Ollama model. The model is instructed to reply in the user's
language (Hindi / Hinglish / English) and to never claim to have performed PC
actions. Memory integration is unchanged: turns are pushed to the existing
memory engine, and explicit remember/forget requests keep using the existing
memory command routes (which run BEFORE the AI route).

---

## 4. IPC channels (all validated)

| Channel | Direction | Purpose |
|---|---|---|
| `voice:transcribe` | renderer → main | audio samples → full STT result (`rawText`, `normalizedText`, `language`, `confidence`, `timestamp`, `engine`) |
| `voice:model-status` | renderer → main | combined engine + whisper detail (`ready`/`DOWNLOADING`/…/per-model status) |
| `voice:model-download` | main → renderer | whisper runtime/model download progress events |
| `ollama:status` | renderer → main | installed / running / models / selectedModel / error |
| `ollama:models` | renderer → main | installed model list + selection |
| `ollama:set-model` | renderer → main | select + persist the model |
| `ollama:chat` | renderer → main | direct conversational test channel |

Existing voice channels (`voice:start`, `voice:stop`, `voice:send`,
`voice:transcript`, `voice:speak`, …) are unchanged.

---

## 5. UI

Status box (sidebar) now shows:

```
MIC      ● READY / UNAVAILABLE
WHISPER  ● READY (base) / DOWNLOADING… / VOICE ENGINE OFFLINE
OLLAMA   ● ONLINE / OFFLINE / NO MODEL
MODEL    <selected local model>
AI       LOCAL AI ONLINE / LOCAL AI OFFLINE / LOCAL ONLY
```

Polled every 30 s against real main-process state (the Ollama probe is a real
server check, cached briefly). `LISTENING…` / `PROCESSING…` voice states and
the existing JARVIS visual identity are unchanged.

---

## 6. Removed / added

**Removed (Vosk stack):** `vosk`, `mic`, `wavefile`, `fluent-ffmpeg`,
`ffmpeg-static` dependencies (none were used anywhere in code);
`stt/vosk/` (provider moved the engine-agnostic correction layer to
`stt/correction.js`), `models/vosk/`, `setup_vosk.bat`, `sherpaSTT.js`,
`scripts/test_vosk.js`, `test/vosk-stt.test.js`.

**Added:** `stt/whisper/provider.js`, `src/ai/ollamaClient.js`,
`scripts/setup-whisper.js`, `test/whisper-stt.test.js`,
`test/ollama-client.test.js`. **No new npm dependencies** — whisper.cpp is a
downloaded standalone binary and Ollama is spoken to over plain HTTP.

**Modified:** `voiceSTT.js` (whisper.cpp primary + transformers.js fallback),
`src/speech/stt.js`, `src/speech/whisperFallback.js` (comments + env-config),
`main.js` (Ollama client, `registerOllamaIPC`, `handleAIAsk` Ollama branch,
whisper warm-up + progress events, full STT result contract),
`preload.js` (OllamaAPI + onModelDownload + IPC constants),
`renderer/index.html` + `renderer/js/renderer.js` (status rows + poller),
`renderer/js/voice.js` (Whisper engine labels), `config/voice_settings.json`,
`package.json`, plus updated tests.

---

## 7. User setup (the only manual steps)

1. **Whisper:** none — first launch auto-downloads the runtime + base model
   once (~160 MB total) when online. (Or pre-fetch: `npm run setup:whisper`.)
   After that, STT is fully offline.
2. **Ollama (optional):** install from https://ollama.com, then
   `ollama pull llama3.2` (or any model). Everything else — detection, model
   selection, chat — is automatic.
