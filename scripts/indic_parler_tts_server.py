"""Local HTTP bridge for AI4Bharat Indic Parler-TTS."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json, os, threading, traceback

MODEL_ID = os.environ.get("JARVIS_INDIC_PARLER_MODEL", "ai4bharat/indic-parler-tts")
HOST, PORT = "127.0.0.1", int(os.environ.get("JARVIS_INDIC_PARLER_PORT", "5056"))
STATE = {"model_loaded": False, "tts_status": "STOPPED", "error": None}
MODEL = TOKENIZER = DESCRIPTION_TOKENIZER = DEVICE = None
LOCK = threading.Lock()

def load_model():
    global MODEL, TOKENIZER, DESCRIPTION_TOKENIZER, DEVICE
    with LOCK:
        if MODEL is not None: return
        STATE.update(tts_status="LOADING", error=None)
        try:
            import torch
            from parler_tts import ParlerTTSForConditionalGeneration
            from transformers import AutoTokenizer
            DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
            MODEL = ParlerTTSForConditionalGeneration.from_pretrained(MODEL_ID).to(DEVICE)
            TOKENIZER = AutoTokenizer.from_pretrained(MODEL_ID)
            DESCRIPTION_TOKENIZER = AutoTokenizer.from_pretrained(MODEL.config.text_encoder._name_or_path)
            STATE.update(model_loaded=True, tts_status="READY", device=DEVICE, model=MODEL_ID)
        except Exception as exc:
            STATE.update(model_loaded=False, tts_status="ERROR", error=str(exc)[:500])
            raise

def render(text, language="auto", speed=0.95):
    load_model()
    import torch, numpy as np, soundfile as sf
    # Use a male profile for the local JARVIS voice.  Indic Parler conditions
    # on the natural-language description, so this works without a separate
    # speaker checkpoint and keeps Hindi/Hinglish and English consistent.
    speaker = "a natural adult Indian male voice" if language in ("hi", "hinglish") else "a natural adult male Indian English voice"
    pace = "slightly fast" if float(speed or 0.95) > 1 else "moderate speed"
    description = f"{speaker} is clear, warm and natural, speaking with a {pace}, high-quality recording and minimal background noise."
    desc = DESCRIPTION_TOKENIZER(description, return_tensors="pt").to(DEVICE)
    prompt = TOKENIZER(str(text), return_tensors="pt").to(DEVICE)
    with torch.inference_mode():
        audio = MODEL.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask, prompt_input_ids=prompt.input_ids, prompt_attention_mask=prompt.attention_mask)
    out = BytesIO()
    sf.write(out, audio.cpu().numpy().squeeze().astype(np.float32), MODEL.config.sampling_rate, format="WAV")
    return out.getvalue()

class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode(); self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self._json(200, STATE) if self.path == "/health" else self._json(404, {"error": "not found"})
    def do_POST(self):
        if self.path != "/speak": return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0")); payload = json.loads(self.rfile.read(length) or b"{}")
            audio = render(payload.get("text", ""), payload.get("language", "auto"), payload.get("speed", 0.95))
            self.send_response(200); self.send_header("Content-Type", "audio/wav"); self.send_header("Content-Length", str(len(audio))); self.end_headers(); self.wfile.write(audio)
        except Exception as exc:
            traceback.print_exc(); self._json(500, {"error": str(exc)[:500]})
    def log_message(self, *_args): return

if __name__ == "__main__":
    print(f"[Indic Parler-TTS] http://{HOST}:{PORT} model={MODEL_ID}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
