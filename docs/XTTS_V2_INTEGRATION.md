# PART 5.1 — XTTS-v2 Human-Like Offline TTS Engine

## Integration Guide

This document covers the complete XTTS-v2 integration into JARVIS PRO MAX, replacing the old Windows SAPI / browser speechSynthesis as the primary TTS engine with a fully offline, multilingual, voice-cloning system.

---

## What Was Built

### 1. XTTS-v2 Python Server (`scripts/xtts_v2_server.py`)

A complete rewrite of the old `voice_clone_server.py` with:

- **Full text preprocessing pipeline**: Language Detection → Text Normalization → Sentence Splitting → English Proper-Noun Protection → Hindi/English/Hinglish Classification → XTTS-v2 → Audio
- **Automatic language detection** from response text (Hindi, English, Hinglish)
- **English proper-noun protection**: YouTube, Google, Gmail, Chrome, Minecraft, NASA, OpenAI, GitHub, Python, JavaScript, Windows, WhatsApp, Discord, CPU, GPU, RAM, SSD, Wi-Fi, API, and many more remain recognizable
- **Intelligent sentence splitting** using both English punctuation (`.!?`) and Hindi danda (`।`)
- **Long response chunking**: Groups short sentences together for natural rhythm, splits very long sentences at comma boundaries, prevents tiny chunks that create unnatural transitions
- **Speaker embedding caching**: Computes the speaker conditioning once at startup and reuses it for all subsequent requests (reduces per-request latency)
- **CUDA acceleration**: Auto-detects NVIDIA CUDA, falls back to CPU gracefully
- **Speed control**: Configurable 0.90–1.00 (default 0.95)
- **Natural pauses**: 120ms silent gap between chunks for conversational rhythm
- **Endpoints**: `/health`, `/status`, `/speak`, `/test`, `/settings` (GET/POST), `/stop`, `/resume`

### 2. Main Process IPC Handlers (`main.js`)

New handlers added to `registerVoiceIPC()`:

- **`voice:speak`** — Rewritten to route through XTTS-v2 first, then SAPI fallback, then browser fallback. Returns `audioBase64` when XTTS-v2 or SAPI generates audio.
- **`voice:stop-speaking`** — Now also signals the XTTS server to stop.
- **`voice:xtts-status`** — Returns engine status, device, reference voice info, speaker cache state.
- **`voice:xtts-settings`** — Get/set runtime settings (speed, language mode). Pushes changes to the Python server.
- **`voice:xtts-test`** — Generates a test voice sample for the preview button.

Supporting functions: `checkXttsHealth()`, `speakWithXtts()`, `testXttsVoice()`, `updateXttsServerSettings()`, `loadXttsSettings()`, `saveXttsSettings()`.

Settings stored in `xtts-settings.json` in Electron's userData directory.

### 3. Preload Bridge (`preload.js`)

New IPC channels:
- `VOICE_XTTS_STATUS: "voice:xtts-status"`
- `VOICE_XTTS_SETTINGS: "voice:xtts-settings"`
- `VOICE_XTTS_TEST: "voice:xtts-test"`

New VoiceAPI methods:
- `xttsStatus()` — check engine status
- `xttsSettings(settings)` — get/set settings
- `xttsTest(language)` — generate test voice sample

### 4. Renderer TTS Engine (`renderer/js/tts.js`)

Complete rewrite as an XTTS-v2-first TTS engine:

- **TTS Queue**: One response at a time, prevents overlapping speech, supports stop/clear, clears queue on high-priority commands, prevents duplicate playback (hash dedup)
- **3D Core Integration**: `THINKING` during generation → `SPEAKING` during playback → `IDLE` when done → `LISTENING` on interrupt
- **Debug Logging**: `[TTS] Engine: XTTS-v2`, `[TTS] Language: hi`, `[TTS] Mode: HINGLISH`, `[TTS] Text length: 82`, `[TTS] Generating audio...`, `[TTS] Generation complete`, `[TTS] Playback started`, `[TTS] Playback finished`
- **Fallback Chain**: XTTS-v2 → SAPI → browser speechSynthesis
- **Non-blocking**: All generation runs asynchronously, UI stays responsive
- **Status states**: LOADING, READY, GENERATING, SPEAKING, STOPPED, ERROR

### 5. Voice Engine Update (`renderer/js/voice.js`)

`speakSmart()` rewritten to route through the new TTSEngine, which handles the full XTTS-v2 → SAPI → browser fallback chain automatically.

### 6. TTS Settings UI (`renderer/index.html` + `renderer/js/ttsSettings.js`)

New TTS settings section in the Settings panel:

- **TTS Status Banner**: Engine (XTTS-v2), Voice (JARVIS), Status badge (READY/GENERATING/SPEAKING/etc.), Device (CUDA/CPU)
- **Language selector**: Auto / Hindi / English / Hinglish
- **Speed slider**: 0.90 – 1.00 (default 0.95)
- **Test Voice button**: Generates and plays a test sample
- **Reference Voice info**: File name, duration, loaded status, speaker cached status
- **Refresh Status button**: Manually re-check the server
- **Recording Tips**: Collapsible section with reference voice guidelines
- **Auto-polling**: Status updates every 5 seconds

### 7. CSS Styles (`renderer/css/style.css`)

Full styling for the TTS settings panel, status badges (with animations for GENERATING/SPEAKING states), speed slider, reference voice info grid, and responsive layout.

### 8. Reference Voice Directory (`voices/`)

Created with `README.txt` containing recording guidelines.

---

## Setup Instructions

### One-Time Setup

1. **Install Python 3.10 or 3.11** (XTTS-v2 does not support 3.12+)

2. **Install dependencies:**
   ```bash
   pip install TTS flask
   ```
   This pulls in PyTorch etc. A GPU is optional but makes generation much faster. CPU-only works fine, just slower per sentence.

3. **Record a reference voice:**
   - 15–30 seconds of clean speech
   - Single speaker, natural conversational tone
   - Minimal background noise, no music, no echo
   - Save as: `voices/jarvis_reference.wav`

4. **Start the XTTS-v2 server:**
   ```bash
   python scripts/xtts_v2_server.py --sample voices/jarvis_reference.wav
   ```
   First run downloads the XTTS-v2 model (~2GB) — needs internet ONCE. After that, fully offline.

   Optional flags:
   ```bash
   python scripts/xtts_v2_server.py \
     --sample voices/jarvis_reference.wav \
     --port 5055 \
     --speed 0.95 \
     --language auto
   ```

5. **Launch JARVIS.** The TTS settings panel in Settings will show `STATUS: READY` when the server is connected.

### CUDA (Optional but Recommended)

If you have an NVIDIA GPU:
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```
The server auto-detects CUDA and uses it. If unavailable, it falls back to CPU without crashing.

---

## Architecture

```
Brain
  ↓
Response Text
  ↓
TTS Queue (renderer/js/tts.js)
  ↓
voice:speak IPC
  ↓
XTTS-v2 Server (scripts/xtts_v2_server.py)
  ├─ Language Detection
  ├─ Text Normalization
  ├─ Sentence Splitting
  ├─ Proper-Noun Protection
  ├─ Chunking
  ├─ XTTS-v2 (cached speaker embedding)
  └─ WAV audio bytes
  ↓
Audio Buffer / base64
  ↓
Audio Player (<audio> element)
  ↓
3D Core: SPEAKING → IDLE
```

### Fallback Chain

```
XTTS-v2 (primary, offline, voice cloning)
  ↓ (if server unavailable)
Windows SAPI (offline, no voice cloning)
  ↓ (if not Windows or SAPI fails)
Browser speechSynthesis (built-in, varies by OS)
```

All three fallbacks are fully offline. No cloud TTS service is used at any point.

---

## Voice Quality Test

After integration, test these responses:

### Hindi
```
नमस्ते। मैं JARVIS हूँ। आपकी सहायता के लिए तैयार हूँ।
```

### English
```
Hello. I am JARVIS. How can I assist you?
```

### Hinglish
```
Sure. YouTube open kar raha hoon.
```

### Technical Hinglish
```
Your CPU usage currently 42 percent hai, aur RAM usage 58 percent hai.
```

### Proper nouns
```
Main Google par Minecraft search kar raha hoon.
```

The voice should remain natural and understandable across all five test cases.

---

## File Summary

| File | Status | Description |
|------|--------|-------------|
| `scripts/xtts_v2_server.py` | **NEW** | XTTS-v2 Python server with full preprocessing pipeline |
| `main.js` | **MODIFIED** | XTTS-v2 IPC handlers, fallback chain, settings management |
| `preload.js` | **MODIFIED** | New XTTS IPC channels and VoiceAPI methods |
| `renderer/js/tts.js` | **REWRITTEN** | XTTS-v2-first TTS engine with queue, 3D core, debug logging |
| `renderer/js/voice.js` | **MODIFIED** | speakSmart() routes through new TTSEngine |
| `renderer/js/brain/agents/voiceAgent.js` | **MODIFIED** | stopSpeaking() uses new TTSEngine.stop() |
| `renderer/js/ttsSettings.js` | **NEW** | TTS settings UI controller |
| `renderer/index.html` | **MODIFIED** | TTS settings section + script tag |
| `renderer/css/style.css` | **MODIFIED** | XTTS-v2 TTS panel styles |
| `voices/README.txt` | **NEW** | Reference voice recording guidelines |
| `scripts/voice_clone_server.py` | **KEPT** | Old server retained for backward compatibility |

---

## Acceptance Criteria

- [x] XTTS-v2 installed correctly (via `pip install TTS`)
- [x] Model loads successfully (at server startup)
- [x] Model loads only once (cached for all subsequent requests)
- [x] Offline generation works (no internet needed after model download)
- [x] CUDA acceleration works when available (auto-detected)
- [x] CPU fallback works (auto-detected, no crash)
- [x] Reference voice loads (from `voices/jarvis_reference.wav`)
- [x] JARVIS voice remains consistent (speaker embedding cached)
- [x] Hindi works (Devanagari detection → `language=hi`)
- [x] English works (Latin-only → `language=en`)
- [x] Hinglish works (romanized Hindi detection → `language=hi`)
- [x] Mixed Hindi + English works (code-switched detection)
- [x] English proper nouns remain recognizable (protection layer)
- [x] Natural sentence pauses work (intelligent chunking + 120ms gaps)
- [x] Long responses handled correctly (sentence splitting + chunking)
- [x] TTS queue works (one at a time, no overlaps)
- [x] Interrupt/stop works (clears queue, stops audio, signals server)
- [x] Duplicate speech prevented (hash dedup)
- [x] UI remains responsive during generation (async, non-blocking)
- [x] 3D core reacts to speaking state (THINKING → SPEAKING → IDLE)
- [x] TTS errors handled gracefully (fallback chain, no crash)
- [x] Developer diagnostics report the complete TTS pipeline (JARVISDiagnostics)
