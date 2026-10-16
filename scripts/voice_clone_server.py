#!/usr/bin/env python3
"""
JARVIS — Local Voice Clone Server
==================================

Runs 100% on your own machine. No cloud, no API key, no internet needed
once the model is downloaded once. JARVIS's main.js talks to this over
localhost only (see the "voice:speak-cloned" IPC handler in main.js).

WHAT THIS DOES
--------------
Uses Coqui TTS's XTTS-v2 model, which can clone a voice from a short
(10-20 second) reference recording and then speak *any* new text in
that voice. This script:

  1. Loads XTTS-v2 (downloaded once, then cached locally).
  2. Loads your reference voice sample (a WAV file you record yourself).
  3. Starts a tiny local HTTP server on 127.0.0.1:5055.
  4. On POST /speak {"text": "...", "language": "en"}, synthesizes
     speech in your cloned voice and returns WAV audio bytes.

ONE-TIME SETUP
---------------
1. Install Python 3.10 or 3.11 (XTTS does not yet support 3.12+).

2. Install dependencies:
       pip install TTS flask

   (This pulls in torch etc. — a GPU is optional but makes it much
   faster. CPU-only works fine, just slower per sentence.)

3. Record a clean reference sample of your own voice:
   - 10-20 seconds, one continuous take, minimal background noise.
   - Save it as WAV, e.g.  my_voice.wav
   - Any normal speech works — you don't need to say anything special.

4. Run this server:
       python scripts/voice_clone_server.py --sample my_voice.wav

   First run downloads the XTTS-v2 model (~2GB) — needs internet
   ONCE, for the download. After that it's fully offline.

5. In JARVIS, turn on "my voice" mode:
       window.jarvis.voice.setMyVoiceSettings({ enabled: true })
   (or use the in-app toggle, if one has been wired into Settings).

That's it — JARVIS will now speak replies in your cloned voice as long
as this server is running. If it isn't running, JARVIS automatically
falls back to its normal voice.

PRIVACY NOTE
------------
Your reference recording and every generated sentence stay on this
machine. This script makes no outbound network calls except the
one-time model download in step 4.
"""

import argparse
import io
import sys
import wave

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

# Populated at startup once the model + your voice sample are loaded.
STATE = {
    "tts": None,
    "sample_path": None,
}


def load_model(sample_path):
    """Loads XTTS-v2 once at startup. Slow (10-60s) — do it once, not
    per-request."""
    try:
        from TTS.api import TTS
    except ImportError:
        print(
            "ERROR: Coqui TTS is not installed.\n"
            "Run:  pip install TTS flask",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Loading XTTS-v2 model (first run downloads it, ~2GB)...")
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    STATE["tts"] = tts
    STATE["sample_path"] = sample_path
    print("Model loaded. Voice server ready.")


# Maps JARVIS's simple language hints to XTTS language codes.
LANGUAGE_MAP = {
    "hi": "hi",
    "hi-in": "hi",
    "en": "en",
    "en-in": "en",
    "hinglish": "en",
    "auto": "en",
}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": STATE["tts"] is not None})


@app.route("/speak", methods=["POST"])
def speak():
    if STATE["tts"] is None:
        return jsonify({"error": "Model not loaded yet"}), 503

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    lang_hint = str(data.get("language") or "auto").lower()
    language = LANGUAGE_MAP.get(lang_hint, "en")

    try:
        wav_array = STATE["tts"].tts(
            text=text,
            speaker_wav=STATE["sample_path"],
            language=language,
        )
    except Exception as exc:  # noqa: BLE001 - report any synth failure to the caller
        return jsonify({"error": f"Synthesis failed: {exc}"}), 500

    # tts() returns a list/array of float samples at 24kHz — wrap it as
    # a proper WAV file in memory so JARVIS can just play the bytes.
    buffer = io.BytesIO()
    sample_rate = 24000
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit PCM
        wav_file.setframerate(sample_rate)
        pcm = b"".join(
            int(max(-1.0, min(1.0, sample)) * 32767).to_bytes(
                2, byteorder="little", signed=True
            )
            for sample in wav_array
        )
        wav_file.writeframes(pcm)
    buffer.seek(0)

    return send_file(buffer, mimetype="audio/wav")


def main():
    parser = argparse.ArgumentParser(description="JARVIS local voice-clone server")
    parser.add_argument(
        "--sample",
        required=True,
        help="Path to your reference voice recording (WAV, 10-20s of clean speech)",
    )
    parser.add_argument("--port", type=int, default=5055)
    args = parser.parse_args()

    load_model(args.sample)
    app.run(host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
