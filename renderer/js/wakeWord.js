"use strict";

/*
==========================================================
JARVIS PRO MAX
wakeWord.js
AMBIENT WAKE WORD ENGINE ("Hey Jarvis")
==========================================================

WHAT THIS IS
------------
Before this file, JARVIS could only start listening for a command
after the user pressed the mic button (or, if `autoListen` was on,
it listened continuously for EVERY command with no gate at all —
see the "ALWAYS-ON MODE" comment in voice.js's boot()). There was
no "sleeping until you say the wake word" mode.

This file adds that: a local microphone listener whose ONLY job is
to listen for "Hey Jarvis" / "OK Jarvis" / "Jarvis". It transcribes
audio through the local Whisper bridge and does not send anything to ChatEngine by itself.
Once it hears the wake phrase it either:
  (a) forwards the rest of the same sentence straight to chat
      (e.g. "hey jarvis what's the time"), or
  (b) if only the wake phrase was said, opens the normal mic
      capture for a single command (VoiceEngine.startListening()),
      then goes back to ambient listening once that's done.

WHY A SEPARATE RECOGNITION INSTANCE (not reusing voice.js's)
--------------------------------------------------------------
voice.js's `this.recognition` is a one-shot (`continuous:false`)
instance used for actual command capture, and by default the app
prefers the NATIVE offline capture path (`useNativeSTT`) over
browser SpeechRecognition entirely (see voice.js `startListening`).
Wake-word spotting needs the opposite shape: `continuous:true`,
`interimResults:true`, running indefinitely in the background.
Rather than change the semantics of the existing, working command
recognizer, this is a small, independent module — if it fails to
init (unsupported browser/engine) or the user never enables it,
NOTHING about existing voice behavior changes at all.

SCOPE / HONESTY NOTE
---------------------
This uses the browser's built-in SpeechRecognition (Chromium/
Electron's Web Speech API), same engine class already used
elsewhere in this app (browser fallback path in voice.js). It is
NOT a fully offline neural wake-word model (that would need a
dedicated model like Porcupine — a real native dependency this
sandbox cannot install/verify with network disabled). This ambient
listener therefore, like the rest of the browser-SpeechRecognition
fallback path already in the codebase, needs the same runtime
support Chromium provides. It is independent of the native offline
mic-capture path (a separate OS-level `mic`/SoX capture in the main
process), so the two can coexist; `suspend()`/`resume()` below are
a courtesy to avoid two recognizers fighting over the mic at once
during an actual command capture, not a hard technical requirement.

DEFAULT STATE: OFF. Enabling is opt-in (UI toggle button next to
the chat status pill, id="wakeWordToggle", or
`WakeWordEngine.setEnabled(true)` from devtools), specifically so
this addition cannot change anyone's existing experience unless
they turn it on.
==========================================================
*/

const WAKE_PHRASE_PATTERN =
    /\b(hey\s+jarvis|hi\s+jarvis|ok(?:ay)?\s+jarvis|yo\s+jarvis|arey?\s+jarvis|suno\s+jarvis|jarvis\s+suno|jarvis)\b/i;

const WAKE_STORAGE_KEY = "jarvisWakeWordEnabled";

class JARVISWakeWord {

    constructor() {
        this.recognition = null;
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.audioBuffer = [];
        this.audioSpeaking = false;
        this.speechFrames = 0;
        this.silenceMs = 0;
        this.transcribing = false;
        this.isSupported = !!(window.jarvis && window.jarvis.voice);
        this.active = false;       // ambient recognizer currently running
        this.suspended = false;    // true while a real command capture owns the mic
        this.enabled = this._loadEnabled();
        this.restartTimer = null;
        this._consecutiveErrors = 0;
        this.onWake = null;        // optional external hook(remainderText)
    }

    /* ---------------- persistence ---------------- */

    _loadEnabled() {
        try {
            return localStorage.getItem(WAKE_STORAGE_KEY) === "true";
        } catch (error) {
            return false;
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(value) {
        this.enabled = !!value;

        try {
            localStorage.setItem(WAKE_STORAGE_KEY, this.enabled ? "true" : "false");
        } catch (error) {
            // localStorage unavailable — setting just won't persist across restarts.
        }

        this._syncUI();

        if (this.enabled) {
            this.start();
        } else {
            this.stop();
            this._setStatus("READY");
        }

        return this.enabled;
    }

    toggle() {
        return this.setEnabled(!this.enabled);
    }

    /* ---------------- lifecycle ---------------- */

    async start() {
        if (!this.enabled) return false;
        if (this.suspended) return false;
        if (this.active) return true;

        if (!window.jarvis?.voice?.transcribe || !navigator.mediaDevices?.getUserMedia) {
            console.warn("⚠ Wake Word: local STT bridge is unavailable.");
            this._setStatus("WAKE WORD UNAVAILABLE");
            return false;
        }
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) throw new Error("Audio capture is unavailable.");
            this._setStatus("REQUESTING MICROPHONE");
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
                channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true
            } });
            if (!this.enabled || this.suspended) { this._releaseAudio(); return false; }
            this.audioContext = new AudioContextClass();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.processor.onaudioprocess = event => {
                this._captureFrame(event.inputBuffer.getChannelData(0));
                const output = event.outputBuffer.getChannelData(0);
                output.fill(0);
            };
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.active = true;
            this._consecutiveErrors = 0;
            this._setStatus('LISTENING FOR "HEY JARVIS" (LOCAL)');
            return true;
        } catch (error) {
            console.warn("⚠ Wake Word: failed to start —", error?.message || error);
            this.active = false;
            this._releaseAudio();
            this._setStatus(error?.name === "NotAllowedError" ? "MICROPHONE PERMISSION DENIED" : "WAKE WORD UNAVAILABLE");
            return false;
        }
    }

    _captureFrame(frame) {
        if (!this.active || this.transcribing) return;
        // The wake listener shares the room with JARVIS's speakers; ignore
        // frames during TTS to prevent the assistant from waking itself.
        if (window.isSpeaking || window.VoiceEngine?.isSpeaking) {
            this._resetAudioSegment();
            return;
        }
        let energy = 0;
        for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
        const voiced = Math.sqrt(energy / Math.max(1, frame.length)) >= 0.004;
        const frameMs = frame.length / (this.audioContext?.sampleRate || 48000) * 1000;
        if (voiced) {
            this.audioSpeaking = true;
            this.speechFrames++;
            this.silenceMs = 0;
        } else if (this.audioSpeaking) this.silenceMs += frameMs;
        if (this.audioSpeaking) this.audioBuffer.push(new Float32Array(frame));
        const speechMs = this.speechFrames * frameMs;
        if (this.audioSpeaking && (this.silenceMs >= 850 || speechMs >= 5500)) {
            if (speechMs >= 250) this._transcribeWakeSegment();
            else this._resetAudioSegment();
        }
    }

    async _transcribeWakeSegment() {
        if (this.transcribing) return;
        this.transcribing = true;
        const frames = this.audioBuffer;
        const sampleRate = this.audioContext?.sampleRate || 48000;
        this._resetAudioSegment();
        try {
            const captured = new Float32Array(frames.reduce((n, frame) => n + frame.length, 0));
            let offset = 0;
            for (const frame of frames) { captured.set(frame, offset); offset += frame.length; }
            const samples = this._resample(captured, sampleRate, 16000);
            const result = await window.jarvis.voice.transcribe(samples, {});
            if (result?.success && result.text && this.active) {
                this._handleResult({ resultIndex: 0, results: [{ 0: { transcript: result.text }, isFinal: true }] });
            }
        } catch (error) {
            console.warn("⚠ Local wake-word transcription failed:", error?.message || error);
        } finally { this.transcribing = false; }
    }

    _resetAudioSegment() {
        this.audioBuffer = [];
        this.audioSpeaking = false;
        this.speechFrames = 0;
        this.silenceMs = 0;
    }

    _resample(samples, sourceRate, targetRate) {
        if (sourceRate === targetRate) return samples;
        const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
        const output = new Float32Array(outputLength);
        const ratio = sourceRate / targetRate;
        for (let i = 0; i < outputLength; i++) {
            const position = i * ratio;
            const left = Math.floor(position);
            const right = Math.min(left + 1, samples.length - 1);
            const fraction = position - left;
            output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
        }
        return output;
    }

    _releaseAudio() {
        if (this.processor) {
            this.processor.onaudioprocess = null;
            try { this.processor.disconnect(); } catch (_) {}
            this.processor = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => { try { track.stop(); } catch (_) {} });
            this.stream = null;
        }
        if (this.audioContext) {
            try { this.audioContext.close(); } catch (_) {}
            this.audioContext = null;
        }
        this._resetAudioSegment();
    }

    stop() {
        this.active = false;
        this._releaseAudio();

        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        if (this.recognition) {
            try {
                this.recognition.onend = null;
                this.recognition.onresult = null;
                this.recognition.onerror = null;
                this.recognition.stop();
            } catch (error) {
                // already stopped — ignore
            }
        }
    }

    // Called by voice.js right before it opens the real command mic,
    // so the ambient recognizer gets out of the way first.
    suspend() {
        if (this.suspended) return;
        this.suspended = true;
        this.stop();
    }

    // Called by voice.js once a command capture cycle is over.
    resume() {
        this.suspended = false;

        if (!this.enabled) return;

        // Small delay so the previous recognizer/mic stream is fully
        // released before this one starts again.
        this.restartTimer = setTimeout(() => {
            if (this.enabled && !this.suspended) this.start();
        }, 400);
    }

    /* ---------------- detection ---------------- */

    _handleResult(event) {
        let transcript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        const lower = transcript.toLowerCase();

        // Try exact regex first (fast path — works for correct spelling)
        let match = lower.match(WAKE_PHRASE_PATTERN);

        // If regex didn't match, try fuzzy wake-word detection via
        // VoiceTolerance (handles "jarwes", "jervis", जार्विस, etc.)
        let fuzzyWakeInfo = null;
        if (!match && window.JARVISVoiceTolerance) {
            try {
                fuzzyWakeInfo = window.JARVISVoiceTolerance.detectWakeWord(transcript);
                if (fuzzyWakeInfo && fuzzyWakeInfo.confidence >= 0.70) {
                    // Synthesize a match-like object so downstream code works
                    const words = lower.split(/\s+/);
                    const wakeWord = words[fuzzyWakeInfo.position] || "jarvis";
                    match = [wakeWord];
                    console.log("[WakeWord] fuzzy match:", wakeWord,
                        "(confidence:", fuzzyWakeInfo.confidence + ")");
                }
            } catch (_) {}
        }

        if (!match) return;

        const lastResult = event.results[event.results.length - 1];
        const isFinal = !!(lastResult && lastResult.isFinal);

        // Don't fire on a bare interim fragment like "hey jar..." — wait
        // either for finality or for a little more speech after the
        // phrase so we can capture a same-breath command too.
        const matchEnd = lower.indexOf(match[0]) + match[0].length;
        const hasTrailingWords = lower.slice(matchEnd).trim().length > 0;

        if (!isFinal && !hasTrailingWords) return;

        const remainder = transcript.slice(matchEnd).trim();

        // Route remainder through VoiceTolerance so fuzzy corrections
        // also apply to same-breath commands: "hey jarvis open crome"
        let processedRemainder = remainder;
        if (remainder && window.JARVISVoiceTolerance) {
            try {
                processedRemainder = window.JARVISVoiceTolerance.normalize(remainder);
            } catch (_) {}
        }
        this._onWakeDetected(processedRemainder || remainder);
    }

    _onWakeDetected(remainder) {
        if (!this.active) return; // avoid double-fire on overlapping results

        // Keep the wake timestamp so command history can measure end-to-end
        // voice latency (wake phrase → assistant response).
        this.lastWakeDetectedAt = Date.now();

        console.log("✨ Wake word detected. Remainder:", JSON.stringify(remainder));

        this.stop();
        this._chime();
        this._setStatus("YES?");

        if (typeof this.onWake === "function") {
            try {
                this.onWake(remainder);
            } catch (error) {
                console.warn("⚠ Wake Word onWake handler error:", error);
            }
        }

        const engine = window.VoiceEngine;

        // CONVERSATION MODE (v2.2): wake word detected → a conversation is
        // starting. Register it so subsequent exchanges don't need the wake
        // word. The wake-word engine itself stays suspended while the
        // conversation is live (ConversationMode re-arms us on idle timeout).
        try {
            window.JARVISConversationMode?.startConversation?.();
        } catch (_) {}

        // Whole command said in the same breath: "hey jarvis, what's the weather".
        if (remainder && remainder.length >= 2) {
            if (engine && typeof engine.sendToChat === "function") {
                Promise.resolve(engine.sendToChat(remainder))
                    .catch((error) => console.warn("⚠ Wake Word → sendToChat failed:", error))
                    .finally(() => {
                        // ConversationMode keeps listening if active; only
                        // resume ambient wake-word listening when it is not.
                        if (!window.JARVISConversationMode?.isActive?.()) this.resume();
                    });
            } else {
                if (!window.JARVISConversationMode?.isActive?.()) this.resume();
            }
            return;
        }

        // Only the wake phrase was said — open the mic for one command,
        // the same way clicking the mic button does. In conversation mode
        // this single exchange is the FIRST turn — after it, ConversationMode
        // keeps the mic flowing without the wake word.
        if (engine && typeof engine.startListening === "function") {
            const wasAutoListen = engine.autoListen;
            engine.autoListen = false; // single-shot for this first turn

            Promise.resolve(engine.startListening())
                .catch((error) => console.warn("⚠ Wake Word → startListening failed:", error))
                .finally(() => {
                    engine.autoListen = wasAutoListen;
                    if (!window.JARVISConversationMode?.isActive?.()) this.resume();
                });
        } else {
            if (!window.JARVISConversationMode?.isActive?.()) this.resume();
        }
    }

    _handleError(event) {
        const err = event && event.error;

        // "no-speech" and "aborted" happen constantly in ambient mode —
        // that's normal, not a real error, so don't count them.
        if (err === "no-speech" || err === "aborted") return;

        if (err === "not-allowed" || err === "service-not-allowed") {
            console.warn("⚠ Wake Word: microphone permission denied — turning wake word off.");
            this.setEnabled(false);
            return;
        }

        this._consecutiveErrors++;
    }

    _handleEnd() {
        this.active = false;

        if (!this.enabled || this.suspended) return;

        // Browsers periodically end even "continuous" recognizers on
        // their own (documented Web Speech API quirk) — auto-restart,
        // with light backoff if it keeps erroring, so this can't spin
        // the CPU in a tight restart loop.
        const delay = Math.min(300 * Math.max(1, this._consecutiveErrors), 5000);

        this.restartTimer = setTimeout(() => {
            if (this.enabled && !this.suspended) this.start();
        }, delay);
    }

    /* ---------------- UI feedback ---------------- */

    _chime() {
        try {
            const audio = new Audio("../sounds/click.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (error) {
            // missing/blocked audio is non-fatal
        }
    }

    _setStatus(text) {
        try {
            if (window.VoiceEngine && typeof window.VoiceEngine.updateStatus === "function") {
                window.VoiceEngine.updateStatus(text);
            } else {
                const el = document.getElementById("chatStatus");
                if (el) el.textContent = text;
            }
        } catch (error) {
            // status UI missing — non-fatal
        }

        this._syncUI();
    }

    _syncUI() {
        const btn = document.getElementById("wakeWordToggle");
        if (!btn) return;

        btn.classList.toggle("active", this.enabled);
        btn.setAttribute("aria-pressed", this.enabled ? "true" : "false");
        btn.title = this.enabled
            ? 'Wake Word: ON — say "Hey Jarvis" (click to turn off)'
            : "Wake Word: OFF (click to enable ambient listening)";
        btn.textContent = this.enabled ? "🟢 Wake Word" : "⚪ Wake Word";
    }
}

if (!window.WakeWordEngine) {
    window.WakeWordEngine = new JARVISWakeWord();
}

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("wakeWordToggle");

    if (btn) {
        btn.addEventListener("click", () => window.WakeWordEngine.toggle());
    }

    window.WakeWordEngine._syncUI();

    if (window.WakeWordEngine.isEnabled()) {
        // Give voice.js a moment to finish its own boot first.
        setTimeout(() => window.WakeWordEngine.start(), 1500);
    }
});
