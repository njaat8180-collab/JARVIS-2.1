// ==========================================
// JARVIS PRO MAX
// XTTS-v2 TTS Engine (Renderer)
// renderer/js/tts.js
// ==========================================
//
// Microsoft Edge neural TTS with Windows SAPI as the local fallback.
//
// ARCHITECTURE:
//   Brain → Response Text → TTS Queue → XTTS-v2 → Audio → Player
//
// FEATURES:
//   - Edge online neural voice as primary engine
//   - Async queue (one response at a time, no overlapping speech)
//   - Interrupt / stop support
//   - Clear queue on high-priority commands
//   - Prevents duplicate TTS playback
//   - 3D core state integration (THINKING → SPEAKING → IDLE)
//   - Debug diagnostics logging
//   - Fallback chain: Edge TTS → Windows SAPI / optional XTTS
//   - Non-blocking: UI stays responsive during generation
//
// ==========================================

"use strict";

window.isSpeaking = false;

// ---------------------------------------------------------------------------
// TTS STATE CONSTANTS
// ---------------------------------------------------------------------------
const TTS_STATES = Object.freeze({
    LOADING: "LOADING",
    READY: "READY",
    GENERATING: "GENERATING",
    SPEAKING: "SPEAKING",
    STOPPED: "STOPPED",
    ERROR: "ERROR",
});

// ---------------------------------------------------------------------------
// DEBUG LOGGING
// ---------------------------------------------------------------------------
function ttsLog(message, details) {
    const line = `[TTS] ${message}`;
    if (details) {
        console.log(line, details);
    } else {
        console.log(line);
    }
    // Record into JARVIS diagnostics if available
    try {
        if (window.JARVISDiagnostics && typeof window.JARVISDiagnostics.record === "function") {
            window.JARVISDiagnostics.record("TTS", message, details);
        }
    } catch (_) {}
}

// ---------------------------------------------------------------------------
// 3D CORE STATE SYNC
// ---------------------------------------------------------------------------
function setCoreState(state) {
    try {
        const core = window.JarvisCore3D || window.JarvisOrb3D;
        if (core && typeof core.setState === "function") {
            core.setState(state);
        }
    } catch (_) {
        // The 3D core is purely cosmetic — never let it break TTS.
    }
}

function setVisualizer(active) {
    try {
        if (active) {
            window.Visualizer?.start?.();
        } else {
            window.Visualizer?.stop?.();
        }
    } catch (_) {}
}

// ---------------------------------------------------------------------------
// LANGUAGE DETECTION (mirrors the Python server's detection)
// ---------------------------------------------------------------------------
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const ROMANIZED_HINDI_STRONG = /\b(kholo|khol|batao|batayein|dikhao|chalao|chalu|shuru|nikalo|lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humko|humne|tumne|apne|nahin|nahi|kya|kyun|kyu|kahaan|kahan|kaise|kyunki|kyuki|kitna|kitni|kitne|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|karti|karta|karte|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|matlab|samajh|samjho|wala|wali|suno|bolo|band|jao|aao|chahiye)\b/i;
const ROMANIZED_HINDI_WEAK = /\b(hai|hain|hoon|hun|tha|thi|the|gaya|mera|meri|mere|hum|hume|aap|tum|kaun|kab|kaisa|kaisi|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|lo|par|pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar)\b/gi;

function detectLanguage(text) {
    const value = String(text || "").trim();
    if (!value) return "en";

    if (DEVANAGARI_RE.test(value)) return "hi";

    if (ROMANIZED_HINDI_STRONG.test(value)) return "hi";

    const weakHits = new Set(
        (value.match(ROMANIZED_HINDI_WEAK) || []).map(w => w.toLowerCase())
    ).size;
    if (weakHits >= 2) return "hi";

    return "en";
}

function getLanguageMode(text) {
    const value = String(text || "").trim();
    if (!value) return "ENGLISH";
    const hasDevanagari = DEVANAGARI_RE.test(value);
    const hasLatin = /[A-Za-z]/.test(value);
    if (hasDevanagari && hasLatin) return "HINGLISH";
    if (hasDevanagari) return "HINDI";
    if (hasLatin && detectLanguage(value) === "hi") return "HINGLISH";
    return "ENGLISH";
}

// ---------------------------------------------------------------------------
// ENGLISH PROPER-NOUN PROTECTION
// ---------------------------------------------------------------------------
const PROPER_NOUNS = [
    "YouTube", "Google", "Gmail", "Chrome", "Minecraft", "NASA", "OpenAI",
    "GitHub", "Python", "JavaScript", "Windows", "WhatsApp", "Discord",
    "CPU", "GPU", "RAM", "SSD", "Wi-Fi", "API", "JARVIS", "Microsoft",
    "Apple", "Android", "iPhone", "Linux", "Ubuntu", "VSCode",
    "Stack Overflow", "ChatGPT", "Firefox", "Spotify", "Netflix",
    "Instagram", "Facebook", "Twitter", "Telegram", "Zoom", "Slack",
    "Notion", "Figma", "Docker", "Kubernetes", "TensorFlow", "PyTorch",
    "Hugging Face", "Electron", "Node.js", "TypeScript", "React",
];

const _PROPER_NOUN_MAP = {};
const _properNounPattern = PROPER_NOUNS.reduce((acc, pn) => {
    _PROPER_NOUN_MAP[pn.toLowerCase()] = pn;
    return acc + (acc ? "|" : "") + pn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}, "");

const PROPER_NOUN_RE = new RegExp(`\\b(${_properNounPattern})\\b`, "gi");

function protectProperNouns(text) {
    return text.replace(PROPER_NOUN_RE, (match) => {
        return _PROPER_NOUN_MAP[match.toLowerCase()] || match;
    });
}

// ---------------------------------------------------------------------------
// TEXT NORMALIZATION + SENTENCE SPLITTING
// ---------------------------------------------------------------------------
function normalizeText(text) {
    if (!text) return "";
    let value = String(text);

    // Remove control characters
    value = value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

    // Normalize smart quotes
    value = value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');

    // Normalize dashes
    value = value.replace(/[\u2013\u2014\u2212]/g, "-");

    // Collapse whitespace
    value = value.replace(/[ \t]+/g, " ");
    value = value.split("\n").map(l => l.trim()).filter(l => l).join(" ");

    // Protect proper nouns
    value = protectProperNouns(value);

    return value.trim();
}

function splitSentences(text) {
    if (!text) return [];
    let value = text.trim();

    // Protect abbreviations
    const abbrs = ["Mr.", "Mrs.", "Dr.", "vs.", "etc.", "e.g.", "i.e.", "Inc.", "Ltd.", "No."];
    const placeholders = {};
    abbrs.forEach((abbr, i) => {
        const ph = `__A${i}__`;
        if (value.includes(abbr)) {
            placeholders[ph] = abbr;
            value = value.replace(abbr, ph);
        }
    });

    // Protect decimals
    value = value.replace(/(\d)\.(\d)/g, "$1__DOT__$2");

    // Split on sentence-ending punctuation
    const parts = value.split(/(?<=[.!?।])\s+/);
    let sentences = parts.map(p => p.trim()).filter(p => p);

    // Restore
    sentences = sentences.map(s => {
        for (const [ph, orig] of Object.entries(placeholders)) {
            s = s.replace(ph, orig);
        }
        return s.replace(/__DOT__/g, ".");
    });

    return sentences.filter(s => s);
}

// ---------------------------------------------------------------------------
// TTS QUEUE
// ---------------------------------------------------------------------------
// One response at a time. Prevents overlapping speech. Supports:
//   - stop speaking (cancel current + clear queue)
//   - clear queue on new high-priority command
//   - prevent duplicate playback (hash dedup)
// ---------------------------------------------------------------------------

window.TTSEngine = {

    currentSpeech: null,
    currentAudio: null,
    currentAudioUrl: null,
    _currentAudioStop: null,
    _queue: [],
    _processing: false,
    _status: TTS_STATES.READY,
    _lastSpokenHash: null,
    _generation: 0,
    _currentItem: null,
    _selectedEngine: null,
    _settings: {
        speed: 0.95,
        languageMode: "auto",
    },

    // ==========================================
    // NORMALIZE
    // ==========================================
    normalize(input) {
        if (input === null || input === undefined) return "";
        if (typeof input === "object") {
            input = input.response ?? input.text ?? input.message ?? "";
        }
        input = String(input).trim();
        if (input === "[object Object]" || input === "{}") return "";
        return input;
    },

    // ==========================================
    // STATUS
    // ==========================================
    getStatus() {
        return this._status;
    },

    _setStatus(status) {
        this._status = status;
        // Also arm capture for callers that use TTSEngine directly. This is
        // synchronous scheduling only; microphone startup never delays TTS.
        if (status === TTS_STATES.GENERATING || status === TTS_STATES.SPEAKING) {
            window.VoiceEngine?.pauseForSpeech?.();
        }
        // Update UI status indicators if available
        try {
            const el = document.getElementById("ttsStatusValue");
            if (el) el.textContent = status;
            const el2 = document.getElementById("ttsStatusBadge");
            if (el2) {
                el2.textContent = status;
                el2.className = `tts-status-badge tts-status-${status.toLowerCase()}`;
            }
        } catch (_) {}
    },

    // ==========================================
    // SPEAK (main entry point)
    // ==========================================
    async speak(input, options = {}) {
        const text = this.normalize(input);
        if (!text) return;

        const language = options.language || detectLanguage(text);
        const mode = getLanguageMode(text);

        ttsLog("Engine: selected provider (Sarvam / Edge / local fallback)");
        ttsLog(`Language: ${language}`);
        ttsLog(`Mode: ${mode}`);
        ttsLog(`Text length: ${text.length}`);

        // Prevent duplicate playback of the exact same text
        const hash = this._hash(text + language);
        if (hash === this._lastSpokenHash && this._processing) {
            ttsLog("Duplicate speech prevented (same text already speaking)");
            return;
        }
        this._lastSpokenHash = hash;

        // Enqueue this speech request
        return new Promise((resolve) => {
            let cancel;
            const cancelled = new Promise(done => { cancel = done; });
            this._queue.push({ text, language, mode, options, resolve, generation: this._generation, cancelled, cancel });
            this._processQueue();
        });
    },

    // ==========================================
    // QUEUE PROCESSING
    // ==========================================
    async _processQueue() {
        if (this._processing) return;
        this._processing = true;

        while (this._queue.length > 0) {
            const item = this._queue.shift();
            this._currentItem = item;
            try {
                const result = await this._generateAndPlay(item);
                item.resolve?.(result && typeof result === "object" ? { success: result.success !== false, ...result } : { success: true });
            } catch (error) {
                ttsLog(`Error: ${error?.message || error}`, { error });
                item.resolve?.({ success: false, error: error?.message });
            } finally {
                if (this._currentItem === item) this._currentItem = null;
            }
        }

        this._processing = false;
        window.VoiceEngine?.endSpeechOutput?.();
        this._setStatus(TTS_STATES.READY);
        setCoreState("idle");
        setVisualizer(false);
        window.isSpeaking = false;
        try { window.JarvisStatus?.setOnline?.(); } catch (_) {}
    },

    // ==========================================
    // GENERATE AND PLAY
    // ==========================================
    async _generateAndPlay(item) {
        const { text, language, mode } = item;
        window.VoiceEngine?.beginSpeechOutput?.(text);

        // CORE → THINKING (generating)
        this._setStatus(TTS_STATES.GENERATING);
        setCoreState("thinking");
        ttsLog("Generating audio...");

        // Main process routes this through Edge TTS, then local fallbacks.
        let result = null;
        try {
            if (window.jarvis?.voice?.speak) {
                result = await Promise.race([
                    window.jarvis.voice.speak(text, { language }),
                    item.cancelled.then(() => ({ success: false, stopped: true }))
                ]);
            }
        } catch (error) {
            ttsLog(`IPC speak error: ${error?.message}`, { error });
        }

        // A network synthesis response can arrive after the user presses Stop.
        // Cancellation releases the queue immediately; late audio stays silent.
        if (item.generation !== this._generation || result?.stopped) {
            return { success: false, stopped: true };
        }

        // Edge/XTTS audio is returned for renderer playback.
        if (result && result.audioBase64) {
            // Play the returned audio
            ttsLog("Generation complete");
            const playback = await this._playAudio(result.audioBase64, result.mime || "audio/wav", language, mode, result.engine);
            if (playback?.stopped) return { ...result, success: false, stopped: true };
            return result;
        }

        // If SAPI handled it (no audioBase64 — SAPI plays directly)
        if (result && result.success !== false) {
            ttsLog("Generation complete (SAPI direct playback)");
            ttsLog("Playback started");
            // SAPI plays synchronously in the main process, so we simulate the
            // speaking state here for the 3D core.
            this._setStatus(TTS_STATES.SPEAKING);
            setCoreState("speaking");
            setVisualizer(true);
            window.isSpeaking = true;
            ttsLog("Playback finished");
            this._setStatus(TTS_STATES.READY);
            setCoreState("idle");
            setVisualizer(false);
            window.isSpeaking = false;
            return result;
        }

        ttsLog("Edge TTS and local voice fallback are unavailable");
        this._setStatus(TTS_STATES.ERROR);
        return { success: false, error: result?.error || "Speech service unavailable." };
    },

    // ==========================================
    // PLAY AUDIO (from base64)
    // ==========================================
    _playAudio(audioBase64, mime, language, mode, engine = "") {
        return new Promise((resolve, reject) => {
            this._setStatus(TTS_STATES.SPEAKING);
            setCoreState("speaking");
            setVisualizer(true);
            window.isSpeaking = true;
            const safeMime = String(mime || "audio/wav").split(";")[0].trim();
            const sarvamAudio = /sarvam/i.test(String(engine));
            const audioLog = (message) => sarvamAudio ? console.info(`[SARVAM TTS] ${message}`) : ttsLog(message);
            let objectUrl = null;
            let audio = null;
            let audioBytes = null;
            let finished = false;
            const finish = (error, stopped = false) => {
                if (finished) return;
                finished = true;
                window.VoiceEngine?.finishTTSEchoReference?.(audio);
                if (this.currentAudio === audio) this.currentAudio = null;
                if (this.currentAudioUrl === objectUrl) this.currentAudioUrl = null;
                if (this._currentAudioStop === stopAudio) this._currentAudioStop = null;
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                if (error) {
                    if (sarvamAudio) console.error(`[SARVAM TTS] Playback error: ${error.message || error}`);
                    else ttsLog(`Playback error: ${error.message || error}`);
                    this._setStatus(TTS_STATES.ERROR);
                    setCoreState("idle");
                    setVisualizer(false);
                    window.isSpeaking = false;
                    reject(error);
                    return;
                }
                if (stopped) {
                    audioLog("Playback stopped");
                    this._setStatus(TTS_STATES.STOPPED);
                } else {
                    audioLog("Playback ended");
                    this._setStatus(TTS_STATES.READY);
                }
                setCoreState("idle");
                setVisualizer(false);
                window.isSpeaking = false;
                try { window.JarvisStatus?.setOnline?.(); } catch (_) {}
                resolve({ success: !stopped, stopped });
            };
            const stopAudio = () => {
                try { audio?.pause(); } catch (_) {}
                finish(null, true);
            };

            // Decode base64 into a Blob URL. Large WAV data URIs can exceed
            // Chromium's practical limits; a Blob keeps the audio binary.
            try {
                const payload = String(audioBase64 || "").replace(/^data:[^,]*;base64,/, "");
                if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 === 1) {
                    throw new Error("TTS returned malformed base64 audio.");
                }
                const binary = atob(payload);
                if (!binary.length) throw new Error("TTS returned empty audio data.");
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                audioBytes = bytes;
                if (safeMime === "audio/wav" && (binary.slice(0, 4) !== "RIFF" || binary.slice(8, 12) !== "WAVE")) {
                    throw new Error("TTS WAV signature validation failed.");
                }
                const blob = new Blob([bytes], { type: safeMime });
                if (!blob.size) throw new Error("Decoded audio Blob is empty.");
                objectUrl = URL.createObjectURL(blob);
                audio = new Audio();
                audio.preload = "auto";
                audio.src = objectUrl;
                this.currentAudio = audio;
                this.currentAudioUrl = objectUrl;
                this._currentAudioStop = stopAudio;
                audioLog(`Decode/conversion succeeded; format=${safeMime}; bytes=${blob.size}`);
            } catch (error) {
                finish(error);
                return;
            }

            audio.onended = () => {
                finish();
            };
            audio.onplaying = () => {
                window.VoiceEngine?.speechPlaybackStarted?.();
                audioLog("Playback started");
            };
            audio.onerror = () => finish(new Error(`Audio element failed (code ${audio.error?.code || "unknown"}).`));
            // Attach the exact output waveform before playback starts. Stop can
            // still settle this item while asynchronous decoding is in progress.
            Promise.resolve(window.VoiceEngine?.prepareTTSEchoReference?.(audioBytes, audio))
                .then(reference => {
                    if (finished) return;
                    window.VoiceEngine?.setTTSEchoReference?.(reference || null);
                    return audio.play();
                })
                .catch((error) => finish(new Error(`Audio playback was rejected: ${error?.message || error}`)));
        });
    },

    // ==========================================
    // BROWSER SPEECH SYNTHESIS (final fallback)
    // ==========================================
    async _speakWithBrowser(text, language) {
        let selectedEngine = this._selectedEngine;
        if (!selectedEngine && window.jarvis?.voice?.xttsStatus) {
            try {
                const status = await window.jarvis.voice.xttsStatus();
                selectedEngine = (status?.data || status)?.ttsEngine || null;
                this._selectedEngine = selectedEngine;
            } catch (_) {}
        }
        if (selectedEngine === "sarvam") {
            const error = "Chromium speech fallback is disabled while Sarvam AI is selected.";
            console.warn(`[SARVAM TTS] ${error}`);
            return { success: false, error };
        }
        return new Promise((resolve) => {
            if (typeof speechSynthesis === "undefined" || !speechSynthesis) {
                ttsLog("Browser speechSynthesis not available");
                resolve();
                return;
            }

            // Stop previous speech
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            this.currentSpeech = utterance;

            utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
            utterance.rate = this._settings.speed || 0.95;
            utterance.pitch = 1;
            utterance.volume = 1;
            const voices = speechSynthesis.getVoices() || [];
            const isLikelyMaleVoice = (voice) => /\b(male|david|andrew|ethan|brandon|christopher|eric|jacob|roger|steffan|mark|guy|ryan|daniel|james|george|hemant|ravi|arjun|prabhat|madhur|amit)\b/i.test(voice.name || "");
            const languageVoices = voices.filter(voice => voice.lang && voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()));
            utterance.voice = languageVoices.find(isLikelyMaleVoice) || voices.find(isLikelyMaleVoice) || languageVoices[0] || null;

            utterance.onstart = () => {
                window.VoiceEngine?.beginSpeechOutput?.(text);
                this._setStatus(TTS_STATES.SPEAKING);
                setCoreState("speaking");
                setVisualizer(true);
                window.isSpeaking = true;
                ttsLog("Playback started (browser)");
            };

            utterance.onend = () => {
                this.currentSpeech = null;
                this._setStatus(TTS_STATES.READY);
                setCoreState("idle");
                setVisualizer(false);
                window.isSpeaking = false;
                ttsLog("Playback finished (browser)");
                resolve();
            };

            utterance.onerror = (error) => {
                this.currentSpeech = null;
                if (error.error !== "interrupted") {
                    ttsLog(`Browser TTS error: ${error.error}`);
                }
                this._setStatus(TTS_STATES.READY);
                setCoreState("idle");
                setVisualizer(false);
                window.isSpeaking = false;
                resolve();
            };

            speechSynthesis.speak(utterance);
        });
    },

    // ==========================================
    // STOP / INTERRUPT
    // ==========================================
    stop() {
        ttsLog("Stop requested — clearing queue and stopping playback");

        // Invalidate only speech already requested. The next reply belongs to
        // a new generation and must not be swallowed by a sticky stop flag.
        this._generation++;
        this._lastSpokenHash = null;
        this._currentItem?.cancel();

        // Clear the queue
        this._queue.forEach(item => item.resolve?.({ stopped: true }));
        this._queue = [];

        // Stop current audio playback
        if (this._currentAudioStop) this._currentAudioStop();
        else if (this.currentAudio) { try { this.currentAudio.pause(); } catch (_) {} }

        // Stop browser speechSynthesis
        if (typeof speechSynthesis !== "undefined") {
            try { speechSynthesis.cancel(); } catch (_) {}
        }

        // Stop via main process IPC
        try {
            if (window.jarvis?.voice?.stopSpeaking) {
                Promise.resolve(window.jarvis.voice.stopSpeaking()).catch(error => {
                    ttsLog(`Stop request failed: ${error?.message || error}`);
                });
            }
        } catch (_) {}

        this.currentSpeech = null;
        window.VoiceEngine?.endSpeechOutput?.();
        window.isSpeaking = false;
        this._setStatus(TTS_STATES.STOPPED);
        setCoreState("idle");
        setVisualizer(false);

        // Reset to READY after a brief moment
        setTimeout(() => {
            if (this._status === TTS_STATES.STOPPED) {
                this._setStatus(TTS_STATES.READY);
            }
        }, 200);
    },

    // ==========================================
    // CLEAR QUEUE (for high-priority commands)
    // ==========================================
    clearQueue() {
        ttsLog("Clearing TTS queue (high-priority command)");
        this._queue.forEach(item => item.resolve?.({ stopped: true, cleared: true }));
        this._queue = [];
    },

    // ==========================================
    // INTERRUPT + SPEAK (for new high-priority response)
    // ==========================================
    async interruptAndSpeak(input, options = {}) {
        this.stop();
        return this.speak(input, options);
    },

    // ==========================================
    // IS BUSY
    // ==========================================
    isBusy() {
        return window.isSpeaking || this._processing || this._queue.length > 0;
    },

    // ==========================================
    // HASH (for duplicate detection)
    // ==========================================
    _hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash;
    },

    // ==========================================
    // UPDATE SETTINGS FROM XTTS SERVER
    // ==========================================
    async updateSettings() {
        try {
            if (window.jarvis?.voice?.xttsStatus) {
                const status = await window.jarvis.voice.xttsStatus();
                if (status && status.success) {
                    this._settings.speed = status.speed || 0.95;
                    this._settings.languageMode = status.languageMode || "auto";

                    // Update UI elements
                    const speedEl = document.getElementById("ttsSpeedValue");
                    if (speedEl) speedEl.textContent = this._settings.speed.toFixed(2);

                    const statusEl = document.getElementById("ttsStatusValue");
                    if (statusEl) statusEl.textContent = status.status || "READY";

                    const engineEl = document.getElementById("ttsEngineValue");
                    if (engineEl) engineEl.textContent = status.ttsEngine === "edge" ? "Microsoft Edge TTS" : status.ttsEngine === "sarvam" ? "Sarvam Bulbul v3" : status.ttsEngine === "elevenlabs" ? "ElevenLabs" : status.ttsEngine === "indic-parler" ? "Indic Parler-TTS" : status.ttsEngine === "sapi" ? "Windows SAPI" : "XTTS-v2";

                    const voiceEl = document.getElementById("ttsVoiceValue");
                    if (voiceEl) voiceEl.textContent = status.ttsEngine === "edge"
                        ? "Edge Neural"
                        : status.ttsEngine === "sapi"
                        ? (status.sapiVoice || "Microsoft David")
                        : status.referenceLoaded ? "JARVIS" : "Not loaded";

                    const refEl = document.getElementById("ttsRefVoiceName");
                    if (refEl) refEl.textContent = status.referenceVoice || "—";

                    const durEl = document.getElementById("ttsRefDuration");
                    if (durEl) durEl.textContent = status.referenceDuration ? `${status.referenceDuration.toFixed(1)}s` : "—";

                    const deviceEl = document.getElementById("ttsDeviceValue");
                    if (deviceEl) deviceEl.textContent = status.device || "—";

                    this._setStatus(status.status || TTS_STATES.READY);
                }
            }
        } catch (_) {}
    },
};
