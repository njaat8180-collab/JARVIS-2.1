# "My Voice" — Local Voice Cloning Setup

JARVIS can speak in **your own cloned voice** instead of the default
SAPI voice. Everything runs locally on your machine — no cloud API,
no account, no cost, and your recording never leaves your computer.

## How it fits together

```
JARVIS (Electron)  --localhost HTTP-->  voice_clone_server.py
     |                                         |
     |  renderer/js/voice.js:                  |  Coqui XTTS-v2 model
     |  speakSmart() tries "my voice"          |  + your voice sample
     |  first, falls back to normal            |  (both stay on disk,
     |  SAPI voice automatically               |   never uploaded)
```

- `main.js` — IPC handler `voice:speak-cloned` POSTs text to the local
  server and returns the WAV audio it gets back.
- `renderer/js/voice.js` — `speak()` now calls `speakSmart()`, which
  checks whether "my voice" is enabled, tries it, and falls back to
  the original SAPI/browser voice if the server isn't running.
- `scripts/voice_clone_server.py` — the actual cloning happens here.

## One-time setup (on your machine, not in this repo)

1. **Python 3.10 or 3.11** (XTTS doesn't support 3.12+ yet).

2. **Install dependencies:**
   ```
   pip install TTS flask
   ```
   A GPU makes generation faster but isn't required — CPU works, just
   slower per reply.

3. **Record your voice sample:**
   - 10-20 seconds, one clean take, minimal background noise.
   - Save as a `.wav` file, e.g. `my_voice.wav`.
   - Normal speech is fine — no special script needed.

4. **Start the server:**
   ```
   python scripts/voice_clone_server.py --sample my_voice.wav
   ```
   First run downloads the XTTS-v2 model (~2GB, one-time, needs
   internet just for that). After that, it's fully offline.

5. **Turn it on in JARVIS.** From the renderer console, or wherever a
   settings toggle gets wired up:
   ```js
   await window.jarvis.voice.setMyVoiceSettings({ enabled: true });
   ```
   To go back to the normal voice:
   ```js
   await window.jarvis.voice.setMyVoiceSettings({ enabled: false });
   ```

## Notes / limits

- The server must be running for cloned speech to work. If it's not
  running (or crashes), JARVIS automatically falls back to the normal
  SAPI voice — it never just goes silent.
- Default server address is `http://127.0.0.1:5055`. If you change
  `--port`, update it with `setMyVoiceSettings({ serverUrl: "..." })`.
- Quality depends on your reference recording — a clean, single-voice
  sample with no music/noise clones noticeably better than a noisy one.
- This is not yet wired into a visible Settings UI toggle — right now
  it's a scriptable on/off via the call above. Say the word if you'd
  like an actual button in the app for it.
