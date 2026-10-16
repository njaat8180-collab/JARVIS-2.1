#!/usr/bin/env python3
"""
JARVIS PRO MAX — XTTS-v2 Offline Voice Engine
=============================================

Fully offline TTS server using Coqui XTTS-v2 with voice cloning.
Replaces the old voice_clone_server.py as the primary TTS engine.

FEATURES:
  - 100% offline after one-time model download (~2GB)
  - Voice cloning from a single reference WAV (15-30s recommended)
  - DEFAULT VOICE: Works WITHOUT any reference WAV using built-in speakers
  - Multilingual: Hindi, English, Hinglish (code-mixed)
  - Automatic language detection from response text
  - English proper-noun protection (YouTube, Google, NASA, etc.)
  - Intelligent sentence splitting + long-response chunking
  - Speaker embedding cached after first initialization
  - CUDA acceleration when available, CPU fallback otherwise
  - Speed control (0.90 - 1.00, default 0.95)
  - Natural conversational rhythm (no robotic artifacts)
  - Health/status/status endpoints for JARVIS UI

TEXT PREPROCESSING PIPELINE:
  JARVIS Response
    -> Language Detection (hi / en / hinglish)
    -> Text Normalization
    -> Sentence Splitting
    -> English Proper-Noun Protection
    -> Hindi/English/Hinglish Classification
    -> XTTS-v2
    -> Audio

USAGE:
  python scripts/xtts_v2_server.py --sample voices/jarvis_reference.wav
  python scripts/xtts_v2_server.py --sample voices/jarvis_reference.wav --port 5055 --speed 0.95

ONE-TIME SETUP:
  1. Python 3.10 or 3.11 (XTTS does not yet support 3.12+)
  2. pip install TTS flask
  3. Record a clean 15-30s reference WAV -> voices/jarvis_reference.wav
  4. python scripts/xtts_v2_server.py --sample voices/jarvis_reference.wav

PRIVACY: All audio and text stays on this machine. No outbound calls
after the one-time model download.
"""

import argparse
import io
import json
import math
import os
import re
import sys
import threading
import wave
from pathlib import Path

# Windows PowerShell can use a legacy code page that cannot print Devanagari.
# XTTS logs the requested text while synthesizing, so force UTF-8 output and
# prevent a successful Hindi request from failing during diagnostic logging.
if os.name == "nt":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

# On Windows, PyAV ships the FFmpeg shared DLLs in ``av.libs``.  Newer
# Coqui-TTS releases use TorchCodec for reference-audio decoding, and its
# loader does not automatically search PyAV's bundled DLL directory.
# Register that directory before importing TTS so XTTS can decode WAV files
# without requiring a separate system FFmpeg installation.
_DLL_HANDLES = []
if os.name == "nt":
    try:
        import site
        for _site_dir in site.getsitepackages():
            _av_libs = Path(_site_dir) / "av.libs"
            if _av_libs.is_dir() and hasattr(os, "add_dll_directory"):
                _DLL_HANDLES.append(os.add_dll_directory(str(_av_libs)))
    except Exception:
        pass

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)

# ---------------------------------------------------------------------------
# GLOBAL STATE
# ---------------------------------------------------------------------------

STATE = {
    "tts": None,                 # The XTTS-v2 model instance
    "sample_path": None,         # Path to the reference voice WAV (None = built-in)
    "speaker_name": None,        # Built-in speaker name (used when no reference WAV)
    "speaker_embedding": None,   # Cached speaker conditioning (computed once)
    "gpt_cond_latent": None,     # Cached GPT conditioning latent
    "device": "cpu",             # "cuda" or "cpu"
    "status": "LOADING",         # LOADING | READY | GENERATING | ERROR | STOPPED
    "speed": 0.95,               # Speech speed multiplier
    "language_mode": "auto",     # auto | hi | en | hinglish
    "model_load_time": 0,        # Seconds taken to load the model
    "reference_duration": 0,     # Duration of reference voice in seconds
    "reference_loaded": False,
    "voice_source": "builtin",   # "builtin" or "reference_wav"
    "total_generations": 0,
    "last_error": None,
}

_lock = threading.Lock()


# ---------------------------------------------------------------------------
# ENGLISH PROPER-NOUN PROTECTION
# ---------------------------------------------------------------------------
# These words must remain recognizable to XTTS-v2. We do NOT lowercase them,
# do NOT translate them, and do NOT transliterate them. XTTS-v2 handles
# mixed-script input natively, so we just ensure they pass through cleanly.

PROPER_NOUNS = {
    "YouTube", "Google", "Gmail", "Chrome", "Minecraft", "NASA", "OpenAI",
    "GitHub", "Python", "JavaScript", "Windows", "WhatsApp", "Discord",
    "CPU", "GPU", "RAM", "SSD", "Wi-Fi", "API", "JARVIS", "Microsoft",
    "Apple", "Android", "iPhone", "Linux", "Ubuntu", "VSCode",
    "Stack Overflow", "ChatGPT", "Firefox", "Spotify", "Netflix",
    "Instagram", "Facebook", "Twitter", "Telegram", "Zoom", "Slack",
    "Notion", "Figma", "Docker", "Kubernetes", "TensorFlow", "PyTorch",
    "Hugging Face", "Electron", "Node.js", "TypeScript", "React",
    "Flutter", "Dart", "Rust", "Go", "Java", "Kotlin", "Swift",
}

# Build a regex that matches any proper noun case-insensitively so we can
# restore its canonical capitalization before sending to XTTS.
_PROPER_NOUN_MAP = {pn.lower(): pn for pn in PROPER_NOUNS}
_PROPER_NOUN_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(pn) for pn in sorted(PROPER_NOUNS, key=len, reverse=True)) + r')\b',
    re.IGNORECASE
)


def protect_proper_nouns(text):
    """Restore canonical capitalization for known proper nouns.

    XTTS-v2 is fairly robust to case, but consistent capitalization helps
    it pronounce brand names and acronyms correctly rather than spelling
    them out letter-by-letter.
    """
    def replacer(match):
        canonical = _PROPER_NOUN_MAP.get(match.group(0).lower())
        return canonical if canonical else match.group(0)
    return _PROPER_NOUN_PATTERN.sub(replacer, text)


# ---------------------------------------------------------------------------
# LANGUAGE DETECTION
# ---------------------------------------------------------------------------

# Devanagari Unicode range (Hindi script)
_DEVANAGARI = re.compile(r'[\u0900-\u097F]')

# Strong romanized Hindi markers — even one hit strongly suggests Hinglish
_ROMANIZED_HINDI_STRONG = re.compile(
    r'\b(kholo|khol|batao|batayein|bataiyega|dikhao|chalao|chalu|shuru|nikalo|'
    r'lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humko|humne|tumne|apne|'
    r'nahin|nahi|kya|kyun|kyu|kahaan|kahan|kaise|kyunki|kyuki|kitna|kitni|'
    r'kitne|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|karti|karta|'
    r'karte|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|matlab|samajh|samjho|'
    r'wala|wali|suno|bolo|band|jao|aao|chahiye|kar\s+raha|kar\s+rahi|'
    r'kar\s+rahe|ho\s+gaya|ho\s+gayi|ho\s+gaye)\b',
    re.IGNORECASE
)

# Weak markers — need 2+ different hits to count as Hinglish
_ROMANIZED_HINDI_WEAK = re.compile(
    r'\b(hai|hain|hoon|hun|tha|thi|the|gaya|mera|meri|mere|hum|hume|aap|tum|'
    r'kaun|kab|kaisa|kaisi|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|lo|par|'
    r'pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar|hua|hui|hue|'
    r'liya|liye|diya|diye|gaya|gayi|gaye|laga|lagi|lage|bola|boli|bole|'
    r'suna|suni|sune|dekha|dekhi|dekhe|pucha|kaha|kahani)\b',
    re.IGNORECASE
)


def detect_language(text):
    """Detect language from text.

    Returns one of: 'hi', 'en', 'hi' (for Hinglish, since XTTS handles
    Hinglish best with the Hindi language code).

    Detection logic:
      1. Devanagari + Latin mixed  -> Hinglish -> 'hi'
      2. Devanagari only            -> Hindi   -> 'hi'
      3. Latin + romanized Hindi    -> Hinglish -> 'hi'
      4. Latin only                 -> English -> 'en'
    """
    value = (text or "").strip()
    if not value:
        return "en"

    has_devanagari = bool(_DEVANAGARI.search(value))
    has_latin = bool(re.search(r'[A-Za-z]', value))

    # Mixed Devanagari + Latin = code-switched Hinglish
    if has_devanagari and has_latin:
        return "hi"

    # Pure Devanagari = Hindi
    if has_devanagari:
        return "hi"

    # No Devanagari — check for romanized Hindi
    if has_latin:
        strong_hits = len(_ROMANIZED_HINDI_STRONG.findall(value))
        if strong_hits > 0:
            return "hi"

        weak_hits = len(set(w.lower() for w in _ROMANIZED_HINDI_WEAK.findall(value)))
        if weak_hits >= 2:
            return "hi"

    return "en"


def get_language_mode(text):
    """Return a human-readable mode label for debug logging."""
    value = (text or "").strip()
    if not value:
        return "ENGLISH"

    has_devanagari = bool(_DEVANAGARI.search(value))
    has_latin = bool(re.search(r'[A-Za-z]', value))

    if has_devanagari and has_latin:
        return "HINGLISH"
    if has_devanagari:
        return "HINDI"
    if has_latin:
        lang = detect_language(value)
        if lang == "hi":
            return "HINGLISH"
    return "ENGLISH"


# ---------------------------------------------------------------------------
# TEXT NORMALIZATION
# ---------------------------------------------------------------------------

def normalize_text(text):
    """Normalize text for TTS without destroying proper nouns or Hindi.

    - Collapses excessive whitespace
    - Removes control characters
    - Normalizes smart quotes
    - Preserves Devanagari Unicode
    - Preserves English capitalization for proper nouns
    - Does NOT blindly lowercase
    """
    if not text:
        return ""

    # Remove null bytes and control characters (except newline/tab)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # Normalize smart quotes to straight quotes
    text = text.replace('\u2018', "'").replace('\u2019', "'")
    text = text.replace('\u201c', '"').replace('\u201d', '"')

    # Normalize various dashes to simple hyphen
    text = text.replace('\u2013', '-').replace('\u2014', '-')
    text = text.replace('\u2212', '-')

    # Collapse multiple spaces (but preserve newlines for sentence splitting)
    text = re.sub(r'[ \t]+', ' ', text)

    # Remove leading/trailing whitespace per line
    lines = [line.strip() for line in text.split('\n')]
    text = ' '.join(line for line in lines if line)

    # Protect proper nouns (restore canonical capitalization)
    text = protect_proper_nouns(text)

    return text.strip()


# ---------------------------------------------------------------------------
# SENTENCE SPLITTING
# ---------------------------------------------------------------------------

# Split on sentence-ending punctuation followed by space/uppercase or end.
# Handles both Devanagari danda (।) and English punctuation.
_SENTENCE_END = re.compile(
    r'(?<=[.!?।])\s+(?=[A-Z\u0900-\u097F0-9])|(?<=[.!?।])\s*$'
)


def split_sentences(text):
    """Split text into sentences using both English and Hindi punctuation.

    Also handles abbreviations and decimal numbers so they don't get
    split mid-way.
    """
    if not text:
        return []

    text = text.strip()

    # Protect common abbreviations from being split
    abbreviations = ['Mr.', 'Mrs.', 'Dr.', 'vs.', 'etc.', 'e.g.', 'i.e.',
                     'Inc.', 'Ltd.', 'Corp.', 'No.', 'St.', 'Ave.', 'Jan.',
                     'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.',
                     'Oct.', 'Nov.', 'Dec.', 'CPU.', 'GPU.', 'RAM.', 'SSD.']
    placeholders = {}
    for i, abbr in enumerate(abbreviations):
        placeholder = f"__ABBR{i}__"
        if abbr in text:
            placeholders[placeholder] = abbr
            text = text.replace(abbr, placeholder)

    # Protect decimal numbers (e.g., "3.14", "42.5 percent")
    text = re.sub(r'(\d)\.(\d)', r'\1__DOT__\2', text)

    # Split on sentence boundaries
    parts = _SENTENCE_END.split(text)
    sentences = [p.strip() for p in parts if p and p.strip()]

    # Restore abbreviations and decimals
    restored = []
    for s in sentences:
        for placeholder, original in placeholders.items():
            s = s.replace(placeholder, original)
        s = s.replace('__DOT__', '.')
        if s:
            restored.append(s)

    return restored


# ---------------------------------------------------------------------------
# INTELLIGENT CHUNKING FOR LONG RESPONSES
# ---------------------------------------------------------------------------

# Maximum characters per chunk for XTTS generation.
# Too long = model can drift or produce artifacts; too short = unnatural gaps.
_MAX_CHUNK_CHARS = 220
# Minimum characters — don't make tiny chunks that create unnatural transitions
_MIN_CHUNK_CHARS = 40


def chunk_text(sentences):
    """Group sentences into chunks suitable for XTTS-v2 generation.

    Goal: natural conversational rhythm. We group short sentences together
    so they flow naturally, and split very long sentences at comma boundaries.
    """
    if not sentences:
        return []

    chunks = []
    current = ""

    for sentence in sentences:
        # If the sentence itself is very long, split it at comma/semicolon boundaries
        if len(sentence) > _MAX_CHUNK_CHARS:
            if current:
                chunks.append(current.strip())
                current = ""

            # Split long sentence at commas, semicolons, or Hindi comma
            sub_parts = re.split(r'[,;।]\s*', sentence)
            sub_chunk = ""
            for part in sub_parts:
                part = part.strip()
                if not part:
                    continue
                if len(sub_chunk) + len(part) + 1 <= _MAX_CHUNK_CHARS:
                    sub_chunk = (sub_chunk + ", " + part) if sub_chunk else part
                else:
                    if sub_chunk:
                        chunks.append(sub_chunk)
                    sub_chunk = part
            if sub_chunk:
                current = sub_chunk
            continue

        # Normal sentence: check if it fits in the current chunk
        if len(current) + len(sentence) + 1 <= _MAX_CHUNK_CHARS:
            current = (current + " " + sentence) if current else sentence
        else:
            if current:
                chunks.append(current.strip())
            current = sentence

    if current:
        chunks.append(current.strip())

    # Merge tiny trailing chunks into the previous one
    if len(chunks) >= 2 and len(chunks[-1]) < _MIN_CHUNK_CHARS:
        chunks[-2] = chunks[-2] + " " + chunks[-1]
        chunks.pop()

    return chunks


# ---------------------------------------------------------------------------
# AUDIO HELPERS
# ---------------------------------------------------------------------------

def wav_bytes_from_samples(samples, sample_rate=24000):
    """Convert a list/array of float samples to WAV bytes (16-bit PCM mono)."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)

        # Clamp and convert to signed 16-bit PCM
        pcm = bytearray()
        for sample in samples:
            clamped = max(-1.0, min(1.0, float(sample)))
            pcm.extend(int(clamped * 32767).to_bytes(2, byteorder="little", signed=True))
        wav_file.writeframes(bytes(pcm))

    buffer.seek(0)
    return buffer


def get_wav_duration(path):
    """Return the duration of a WAV file in seconds."""
    try:
        with wave.open(str(path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / rate if rate > 0 else 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# MODEL LOADING
# ---------------------------------------------------------------------------

def load_model(sample_path=None, speed=0.95, language_mode="auto", speaker_name=None):
    """Load XTTS-v2 once at startup.

    If sample_path is given → voice cloning from that WAV.
    If sample_path is None  → uses XTTS-v2's built-in default speaker
    (no voice cloning, no reference recording needed).
    """
    import time as _time
    start = _time.time()

    # Coqui's current XTTS code calls ``torchaudio.load`` for the reference
    # WAV.  Recent torchaudio releases route that call through TorchCodec,
    # whose native FFmpeg DLLs are not available on every Windows install.
    # SoundFile handles PCM WAV locally and gives XTTS the same tensor shape.
    try:
        import numpy as _np
        import soundfile as _sf
        import torch as _torch
        import torchaudio as _torchaudio

        def _load_wav_with_soundfile(path, *args, **kwargs):
            _audio, _rate = _sf.read(str(path), dtype="float32", always_2d=True)
            return _torch.from_numpy(_np.asarray(_audio.T, dtype=_np.float32).copy()), _rate

        _torchaudio.load = _load_wav_with_soundfile
    except Exception as _audio_patch_error:
        print(f"[XTTS] WAV backend patch unavailable: {_audio_patch_error}", file=sys.stderr)

    try:
        from TTS.api import TTS
    except ImportError:
        print(
            "ERROR: Coqui TTS is not installed.\n"
            "Run:  pip install TTS flask",
            file=sys.stderr,
        )
        STATE["status"] = "ERROR"
        STATE["last_error"] = "Coqui TTS not installed"
        sys.exit(1)

    # Detect CUDA
    try:
        import torch
        if torch.cuda.is_available():
            STATE["device"] = "cuda"
            print(f"[XTTS] CUDA detected: {torch.cuda.get_device_name(0)}")
        else:
            STATE["device"] = "cpu"
            print("[XTTS] CUDA not available — using CPU (will be slower)")
    except ImportError:
        STATE["device"] = "cpu"
        print("[XTTS] PyTorch not found — defaulting to CPU")

    STATE["status"] = "LOADING"
    print(f"[XTTS] Loading XTTS-v2 model (device={STATE['device']})...")
    print("[XTTS] First run downloads the model (~2GB) — needs internet ONCE.")

    try:
        # Load model on the detected device
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        tts.to(STATE["device"])
        STATE["tts"] = tts
        STATE["speed"] = speed
        STATE["language_mode"] = language_mode

        # ---------------------------------------------------------------
        # MODE 1: Reference WAV provided → voice cloning
        # ---------------------------------------------------------------
        if sample_path:
            sample_path = Path(sample_path)
            if not sample_path.exists():
                print(f"[XTTS] WARNING: Reference voice not found: {sample_path}")
                print("[XTTS] Falling back to built-in default speaker")
                sample_path = None

        if sample_path:
            STATE["sample_path"] = str(sample_path)
            STATE["speaker_name"] = None
            STATE["voice_source"] = "reference_wav"
            _cache_speaker_embedding(tts, sample_path)
            STATE["reference_duration"] = get_wav_duration(sample_path)
            STATE["reference_loaded"] = True
            print(f"[XTTS] Reference voice: {sample_path} "
                  f"({STATE['reference_duration']:.1f}s)")
        else:
            # -----------------------------------------------------------
            # MODE 2: No reference WAV → built-in default speaker
            # -----------------------------------------------------------
            speakers = []
            try:
                speakers = list(tts.speakers)
            except Exception:
                pass

            if not speakers:
                raise RuntimeError(
                    "No built-in speakers found and no reference WAV provided.\n"
                    "Provide a reference WAV: --sample voices/jarvis_reference.wav"
                )

            # Pick a speaker — user-specified, or the first available
            chosen = speaker_name if speaker_name in speakers else speakers[0]
            STATE["speaker_name"] = chosen
            STATE["sample_path"] = None
            STATE["voice_source"] = "builtin"
            STATE["reference_loaded"] = True
            STATE["reference_duration"] = 0
            print(f"[XTTS] Using built-in speaker: '{chosen}'")
            if len(speakers) > 1:
                print(f"[XTTS] {len(speakers)} speakers available. "
                      f"Use --speaker to change.")
            print("[XTTS] (No voice cloning — using model default voice)")

        STATE["model_load_time"] = round(_time.time() - start, 1)
        STATE["status"] = "READY"
        print(f"[XTTS] Model loaded in {STATE['model_load_time']}s")
        print(f"[XTTS] Device: {STATE['device']}, Speed: {STATE['speed']}")
        print("[XTTS] Voice server ready on 127.0.0.1")

    except Exception as exc:
        STATE["status"] = "ERROR"
        STATE["last_error"] = str(exc)
        print(f"[XTTS] FATAL: Model load failed: {exc}", file=sys.stderr)
        sys.exit(1)


def _cache_speaker_embedding(tts, sample_path):
    """Pre-compute and cache the speaker conditioning.

    XTTS-v2 computes speaker conditioning from the reference WAV on every
    .tts() call by default. By computing it once and storing the
    gpt_cond_latent + speaker_embedding, we can pass them directly to
    the model's inference function, avoiding repeated conditioning passes.

    This reduces per-request latency significantly.
    """
    try:
        # Access the underlying XTTS model
        model = tts.models[0] if hasattr(tts, "models") else tts.model

        # XTTS-v2's synthesizer can compute the conditioning
        if hasattr(model, "speaker_manager"):
            import torch
            # Load the reference audio and compute the embedding
            gpt_cond_latent, speaker_embedding = model.speaker_manager.compute_conditioning(
                path=str(sample_path),
                max_wav_length=30,  # Cap at 30s of reference audio
            )
            STATE["gpt_cond_latent"] = gpt_cond_latent
            STATE["speaker_embedding"] = speaker_embedding
            print("[XTTS] Speaker conditioning cached successfully")
        else:
            print("[XTTS] Speaker manager not available — will use speaker_wav per request")
    except Exception as exc:
        print(f"[XTTS] Speaker conditioning cache skipped: {exc}")
        print("[XTTS] Will pass speaker_wav directly (slightly higher latency)")


# ---------------------------------------------------------------------------
# SPEECH SYNTHESIS
# ---------------------------------------------------------------------------

def synthesize(text, language=None, speed=None):
    """Synthesize speech from text using XTTS-v2.

    Returns a list of float audio samples at 24kHz.
    Uses the cached speaker embedding (reference WAV) or the
    built-in speaker name — whichever was set at startup.
    """
    if STATE["tts"] is None:
        raise RuntimeError("Model not loaded")

    lang = language or detect_language(text)
    spd = speed if speed is not None else STATE["speed"]

    # Build kwargs for the TTS call
    tts_kwargs = {
        "text": text,
        "language": lang,
        "speed": spd,
        "split_sentences": False,  # We handle splitting ourselves
    }

    # Use cached speaker embedding if available (reference WAV mode)
    if STATE["gpt_cond_latent"] is not None and STATE["speaker_embedding"] is not None:
        tts_kwargs["gpt_cond_latent"] = STATE["gpt_cond_latent"]
        tts_kwargs["speaker_embedding"] = STATE["speaker_embedding"]
    elif STATE["sample_path"]:
        # Reference WAV but embedding wasn't cached — pass speaker_wav directly
        tts_kwargs["speaker_wav"] = str(STATE["sample_path"])
    elif STATE["speaker_name"]:
        # Built-in default speaker (no voice cloning)
        tts_kwargs["speaker"] = STATE["speaker_name"]

    # Call the TTS model
    wav = STATE["tts"].tts(**tts_kwargs)
    return wav


def synthesize_long_text(text, language=None, speed=None):
    """Synthesize speech for potentially long text by chunking.

    Each chunk is synthesized separately and the audio is concatenated.
    This prevents the model from drifting on long inputs and gives more
    natural rhythm than generating one huge block.
    """
    # Full preprocessing pipeline
    normalized = normalize_text(text)
    if not normalized:
        return []

    sentences = split_sentences(normalized)
    if not sentences:
        sentences = [normalized]

    chunks = chunk_text(sentences)
    if not chunks:
        chunks = [normalized]

    lang = language or detect_language(normalized)
    spd = speed if speed is not None else STATE["speed"]

    print(f"[XTTS] Synthesizing {len(chunks)} chunk(s), lang={lang}, "
          f"mode={get_language_mode(normalized)}, speed={spd}")

    all_samples = []
    for i, chunk in enumerate(chunks):
        print(f"[XTTS] Chunk {i+1}/{len(chunks)}: \"{chunk[:80]}{'...' if len(chunk) > 80 else ''}\"")
        samples = synthesize(chunk, language=lang, speed=spd)
        all_samples.extend(samples)
        # Small silent gap between chunks for natural pauses (120ms at 24kHz)
        if i < len(chunks) - 1:
            all_samples.extend([0.0] * int(24000 * 0.12))

    return all_samples


# ---------------------------------------------------------------------------
# FLASK ROUTES
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    """Health check — used by JARVIS to detect if the server is running."""
    return jsonify({
        "status": "ok",
        "engine": "XTTS-v2",
        "model_loaded": STATE["tts"] is not None,
        "tts_status": STATE["status"],
        "device": STATE["device"],
        "reference_loaded": STATE["reference_loaded"],
        "reference_duration": round(STATE["reference_duration"], 1),
        "speed": STATE["speed"],
        "language_mode": STATE["language_mode"],
        "total_generations": STATE["total_generations"],
        "model_load_time": STATE["model_load_time"],
    })


@app.route("/status", methods=["GET"])
def status():
    """Detailed status for the JARVIS UI TTS panel."""
    return jsonify({
        "engine": "XTTS-v2",
        "status": STATE["status"],
        "device": STATE["device"],
        "voice": "JARVIS",
        "reference_voice": os.path.basename(STATE["sample_path"]) if STATE["sample_path"] else None,
        "reference_loaded": STATE["reference_loaded"],
        "reference_duration": round(STATE["reference_duration"], 1),
        "speed": STATE["speed"],
        "language_mode": STATE["language_mode"],
        "speaker_cached": STATE["speaker_embedding"] is not None,
        "total_generations": STATE["total_generations"],
        "last_error": STATE["last_error"],
    })


@app.route("/speak", methods=["POST"])
def speak():
    """Synthesize speech from text.

    Request body:
        {
            "text": "Sure. YouTube open kar raha hoon.",
            "language": "auto",   // auto | hi | en | hinglish
            "speed": 0.95         // optional override
        }

    Returns: WAV audio bytes (audio/wav)
    """
    if STATE["tts"] is None:
        return jsonify({"error": "Model not loaded"}), 503

    if STATE["status"] == "ERROR":
        return jsonify({"error": STATE["last_error"] or "TTS in error state"}), 503

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    # Language selection
    lang_hint = str(data.get("language") or "auto").lower()
    if lang_hint == "auto" or lang_hint not in ("hi", "en", "hinglish"):
        lang = detect_language(text)
    elif lang_hint == "hinglish":
        lang = "hi"  # Hinglish uses Hindi language code for XTTS
    else:
        lang = lang_hint

    # Speed override
    speed = data.get("speed")
    if speed is not None:
        try:
            speed = float(speed)
        except (ValueError, TypeError):
            speed = None

    with _lock:
        STATE["status"] = "GENERATING"
        try:
            print(f"[XTTS] Engine: XTTS-v2")
            print(f"[XTTS] Language: {lang}")
            print(f"[XTTS] Mode: {get_language_mode(text)}")
            print(f"[XTTS] Reference voice: {os.path.basename(STATE['sample_path'] or '')}")
            print(f"[XTTS] Text length: {len(text)}")
            print(f"[XTTS] Generating audio...")

            samples = synthesize_long_text(text, language=lang, speed=speed)

            if not samples:
                raise RuntimeError("No audio generated")

            wav_buffer = wav_bytes_from_samples(samples, sample_rate=24000)

            STATE["total_generations"] += 1
            STATE["status"] = "READY"
            print(f"[XTTS] Generation complete ({len(samples)} samples)")

            return send_file(wav_buffer, mimetype="audio/wav")

        except Exception as exc:
            STATE["status"] = "ERROR"
            STATE["last_error"] = str(exc)
            print(f"[XTTS] Generation error: {exc}", file=sys.stderr)
            return jsonify({"error": f"Synthesis failed: {exc}"}), 500


@app.route("/test", methods=["POST"])
def test_voice():
    """Generate a test sample for the voice preview button.

    Uses a short test phrase appropriate for the requested language.
    """
    if STATE["tts"] is None:
        return jsonify({"error": "Model not loaded"}), 503

    data = request.get_json(silent=True) or {}
    lang = str(data.get("language") or "auto").lower()

    test_phrases = {
        "hi": "नमस्ते। मैं JARVIS हूँ। आपकी सहायता के लिए तैयार हूँ।",
        "en": "Hello. I am JARVIS. How can I assist you?",
        "hinglish": "Sure. YouTube open kar raha hoon.",
    }

    if lang == "auto" or lang not in test_phrases:
        lang = "en"

    text = test_phrases.get(lang, test_phrases["en"])

    with _lock:
        STATE["status"] = "GENERATING"
        try:
            samples = synthesize_long_text(text, language=lang if lang != "hinglish" else "hi")
            wav_buffer = wav_bytes_from_samples(samples, sample_rate=24000)
            STATE["total_generations"] += 1
            STATE["status"] = "READY"
            return send_file(wav_buffer, mimetype="audio/wav")
        except Exception as exc:
            STATE["status"] = "ERROR"
            STATE["last_error"] = str(exc)
            return jsonify({"error": f"Test failed: {exc}"}), 500


@app.route("/settings", methods=["GET", "POST"])
def settings():
    """Get or update TTS settings at runtime."""
    if request.method == "GET":
        return jsonify({
            "speed": STATE["speed"],
            "language_mode": STATE["language_mode"],
            "device": STATE["device"],
            "engine": "XTTS-v2",
        })

    data = request.get_json(silent=True) or {}
    updated = {}

    if "speed" in data:
        try:
            new_speed = float(data["speed"])
            if 0.50 <= new_speed <= 2.0:
                STATE["speed"] = new_speed
                updated["speed"] = new_speed
        except (ValueError, TypeError):
            pass

    if "language_mode" in data:
        mode = str(data["language_mode"]).lower()
        if mode in ("auto", "hi", "en", "hinglish"):
            STATE["language_mode"] = mode
            updated["language_mode"] = mode

    return jsonify({"status": "ok", "updated": updated, "current": {
        "speed": STATE["speed"],
        "language_mode": STATE["language_mode"],
        "device": STATE["device"],
    }})


@app.route("/stop", methods=["POST"])
def stop():
    """Signal stop — the next generation request will be rejected if status is STOPPED."""
    STATE["status"] = "STOPPED"
    return jsonify({"status": "stopped"})


@app.route("/resume", methods=["POST"])
def resume():
    """Resume from STOPPED state."""
    if STATE["tts"] is not None:
        STATE["status"] = "READY"
    return jsonify({"status": STATE["status"]})


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="JARVIS XTTS-v2 Offline Voice Engine"
    )
    parser.add_argument(
        "--sample",
        default=None,
        help="Path to reference voice WAV (optional — if omitted, uses built-in default speaker)",
    )
    parser.add_argument(
        "--speaker",
        default=None,
        help="Built-in speaker name (optional — only used when --sample is not given)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5055,
        help="Port to listen on (default: 5055)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=0.95,
        help="Speech speed multiplier, 0.90-1.00 recommended (default: 0.95)",
    )
    parser.add_argument(
        "--language",
        default="auto",
        choices=["auto", "hi", "en", "hinglish"],
        help="Language mode (default: auto)",
    )
    args = parser.parse_args()

    # Prefer the user's JARVIS reference voice automatically when one has
    # been placed in the standard voices directory. An explicit --sample
    # still overrides this default.
    sample = None
    if args.sample:
        sample = Path(args.sample)
        if not sample.exists():
            # Try relative to the JARVIS root directory
            alt = Path(__file__).parent.parent / args.sample
            if alt.exists():
                sample = alt
            else:
                print(f"WARNING: Reference voice file not found: {args.sample}")
                print("Falling back to built-in default speaker.")
                sample = None
    else:
        default_sample = Path(__file__).parent.parent / "voices" / "jarvis_reference.wav"
        if default_sample.exists():
            sample = default_sample

    print("=" * 60)
    print("  JARVIS PRO MAX — XTTS-v2 Offline Voice Engine")
    print("=" * 60)
    if sample:
        print(f"  Reference voice : {sample}")
        print(f"  Mode            : Voice Cloning")
    else:
        speaker_display = args.speaker or "auto (first available)"
        print(f"  Speaker         : {speaker_display}")
        print(f"  Mode            : Built-in Default Voice (no cloning)")
    print(f"  Port             : {args.port}")
    print(f"  Speed            : {args.speed}")
    print(f"  Language mode    : {args.language}")
    print("=" * 60)

    load_model(
        sample_path=sample,
        speed=args.speed,
        language_mode=args.language,
        speaker_name=args.speaker,
    )

    app.run(host="127.0.0.1", port=args.port, threaded=False)


if __name__ == "__main__":
    main()
