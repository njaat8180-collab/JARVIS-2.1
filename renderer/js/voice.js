
"use strict";

/*
==========================================================
JARVIS PRO MAX
voice.js
V14.2 FINAL STABLE VOICE ENGINE
==========================================================

FEATURES:
- Electron renderer compatible
- Speech Recognition
- Microphone input
- Voice -> ChatEngine
- ChatEngine -> response
- Speech Synthesis / TTS
- listen() Promise API
- startListening()
- stopListening()
- toggleListening()
- Diagnostics
- Renderer UI integration
- VoiceAgent compatibility
- Debug API
==========================================================
*/

// ------------------------------------------------------------
// HINDI/HINGLISH VOICE UPGRADE
// ------------------------------------------------------------
// speaking voice ONLY by counting Devanagari characters. JARVIS's own
// "hinglish" persona (see src/ai/consciousness.js) replies in fully
// ROMANIZED Hindi — e.g. "Main JARVIS hoon, aapka personal AI
// assistant hoon." — which contains ZERO Devanagari characters. That
// text was silently being detected as English and read out by the
// ENGLISH neural voice, which mispronounces Hindi words spelled in
// Latin script (this is the actual "Hindi voice sounds wrong" bug).
//
// This mirrors the same fix already applied to Hindi/Hinglish STT
// (src/speech/stt.js): don't rely on script alone — also recognize
// common romanized Hindi words/connectors. Any text that scores as
// Hindi OR romanized-Hindi/Hinglish is spoken with the Hindi neural
// voice (hi-IN-* voices handle code-mixed Hindi+English content far
// better than an English voice reading Hindi phonetics does).
const HINDI_DEVANAGARI_PATTERN = /[\u0900-\u097F]/;
const ROMANIZED_HINDI_WORD_PATTERN = /\b(hai|hain|hoon|hun|nahi|nahin|kya|kaise|kyun|kyu|kaha|kahan|kab|kaun|kitna|kitne|kitni|mera|meri|mere|tera|teri|tere|aapka|aapki|aapke|tumhara|tumhari|tumhare|humara|humari|hamare|mujhe|tujhe|humein|hume|aap|tum|hum|karo|kare|karta|karti|karte|kar\s*raha|kar\s*rahi|kar\s*rahe|raha|rahi|rahe|gaya|gayi|gaye|tha|thi|the|abhi|filhaal|filhal|bata|batao|batayein|dijiye|chahiye|accha|acha|theek|thik|bahut|bohot|yaar|bhai|matlab|samajh|samjho|zaroor|bilkul)\b/i;

function detectSpokenLanguage(text) {
    const value = String(text || "");
    if (!value.trim()) return "en-IN";

    if (HINDI_DEVANAGARI_PATTERN.test(value)) {
        return "hi-IN";
    }

    // No Devanagari at all — check for romanized Hindi/Hinglish before
    // defaulting to English, so the Hindi voice is used for JARVIS's
    // Latin-script Hindi replies too.
    const hinglishHits = (value.match(new RegExp(ROMANIZED_HINDI_WORD_PATTERN, "gi")) || []).length;
    if (hinglishHits >= 1) {
        return "hi-IN";
    }

    return "en-IN";
}

/* ==========================================================
   INPUT LANGUAGE CLASSIFIER (EN / HI / HINGLISH)
   Used for the [BRAIN] debug-pipeline log and the UI language
   behavior. Mirrors src/speech/stt.js's detectLanguage():
     - Devanagari + Latin mixed  → HINGLISH (code-switched)
     - Devanagari only           → HINDI
     - Latin + romanized Hindi   → HINGLISH
     - Latin only                → ENGLISH
========================================================== */
// Unambiguous romanized-Hindi markers — a single hit is enough.
const HINDI_ROMAN_STRONG = /\b(kholo|khol|batao|batayein|dikhao|dikha|chalao|chalu|shuru|nikalo|lao|dhoondo|dhundo|rakho|dijiye|chahiye|mujhe|humko|humne|tumne|apne|nahin|nahi|kya|kyun|kyu|kahaan|kahan|kaise|kyunki|kyuki|kitna|kitni|kitne|abhi|bilkul|zaroor|theek|thik|achha|accha|karo|karke|karti|karta|karte|raha|rahi|rahe|hoon|hain|jaldi|yaar|bhai|matlab|samajh|chahiye|wala|wali|bataiyega|suno|bolo|band\s+karo|jao|aao|chahiye)\b/gi;
// Common function words — ambiguous alone ("to", "hi" are English too),
// so require at least two different hits.
const HINDI_ROMAN_WEAK = /\b(hai|hain|hoon|hun|tha|thi|the|gaya|mera|meri|mere|hum|hume|aap|tum|kaun|kab|kaisa|kaisi|chahiye|sakta|sakte|ek|kuch|sab|bas|mat|bata|dena|dijiye|khol|band|lo|par|pe|aur|ya|se|ko|ka|ki|ke|ne|toh|bhi|kal|aaj|phir|agar)\b/gi;

function classifyInputLanguage(text) {
    const value = String(text || "").trim();
    if (!value) return "ENGLISH";
    const hasDevanagari = /[\u0900-\u097F]/.test(value);
    const hasLatin = /[A-Za-z]/.test(value);
    if (hasDevanagari && hasLatin) return "HINGLISH";
    if (hasDevanagari) return "HINDI";
    if (!hasLatin) return "ENGLISH";
    const strong = (value.match(HINDI_ROMAN_STRONG) || []).length;
    if (strong > 0) return "HINGLISH";
    const weak = new Set((value.match(HINDI_ROMAN_WEAK) || []).map(w => w.toLowerCase())).size;
    if (weak >= 2) return "HINGLISH";
    return "ENGLISH";
}

class JARVISVoice {

    constructor() {

        this.recognition = null;

        this.synthesis =
            window.speechSynthesis || null;

        this.isSupported = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.focusMode = false;

        this.initialized = false;
        this.booted = false;

        this.language = "en-IN";

        this.voice = null;
        this.useNativeSTT = true;
        this.nativeSTTAvailable = !!(window.jarvis && window.jarvis.voice);

        this.volume = 1;
        this.rate = 1;
        this.pitch = 1;

        this.lastTranscript = "";
        this.lastResponse = "";
        this.lastError = null;

        this._listenPromise = null;
        this._resolveListen = null;
        this._rejectListen = null;

        this.capture = null;
        // Monotonic turn token: a timed-out or aborted Whisper IPC call may
        // still resolve later, but must never become a second command.
        this._captureGeneration = 0;
        this._captureStartPromise = null;
        this._captureStopPromise = null;
        this._ignoreMicUntil = 0;

        // Voice pipeline state for the 3D core + debug pipeline
        this.isProcessingVoice = false;   // transcript accepted, brain working
        this._coreError = false;          // last voice action failed

        // Continuous "no button press needed" conversation mode.
        // autoListen = true means: after every reply, the mic
        // automatically starts listening again on its own.
        this.autoListen = false;

        // muted = true means: mic is paused (won't listen / auto-restart)
        // until unmute() is called. Toggled by the mute button.
        this.muted = false;

        if (this.nativeSTTAvailable && window.jarvis.voice) {
            if (typeof window.jarvis.voice.onTranscript === "function") {
                window.jarvis.voice.onTranscript((text) => this.handleNativeTranscript(text));
            }
        }



        console.log(
            "🎤 JARVIS Voice Engine Created — V14.2"
        );
    }


    /* ======================================================
       INITIALIZE
    ====================================================== */

    init() {

        if (this.initialized) {
            return this.isSupported;
        }

        const SpeechRecognition = null; // Phase 9: cloud/browser STT is forbidden.

        if (!this.nativeSTTAvailable) {

            this.lastError =
                "Speech Recognition is not supported.";

            console.error(
                "❌ Speech Recognition Not Supported"
            );

            this.updateStatus(
                "VOICE UNAVAILABLE"
            );

            return false;
        }

        try {

            if (SpeechRecognition) {
                this.recognition =
                    new SpeechRecognition();

                this.recognition.lang =
                    this.language;

                this.recognition.continuous =
                    false;

                this.recognition.interimResults =
                    false;

                this.recognition.maxAlternatives =
                    this.focusMode ? 3 : 1;

                this.bindRecognitionEvents();
            }

            this.loadVoices();

            this.initialized =
                true;

            this.isSupported =
                !!this.recognition || this.nativeSTTAvailable;

            console.log(
                "✅ Voice Recognition Ready"
            );

            console.log(
                "🌐 Voice Language:",
                this.language
            );

            // ---------------------------------------------------------
            // STT ENGINE VISIBILITY (completes "make offline STT the
            // default" item — this project already sets useNativeSTT =
            // true above and wires real offline transcription end to
            // end in voiceSTT.js/src/speech/stt.js, so nothing about
            // the engine selection changes here. What was missing was
            // any visible confirmation of WHICH engine is actually
            // active, so it could be tested/verified. This logs it
            // clearly and reflects it in a small header label
            // (id="sttEngineLabel", added in index.html) so it's
            // provable at a glance instead of only in devtools.
            // ---------------------------------------------------------
            this.activeSTTEngine =
                (this.useNativeSTT && this.nativeSTTAvailable)
                    ? "whisper"
                    : "unavailable";

            const engineLabel = {
                "whisper": "🎙️ Whisper (offline, default)",
                "unavailable": "⚠️ Offline Voice Unavailable"
            }[this.activeSTTEngine];

            console.log(
                "🧠 STT Engine Active:",
                this.activeSTTEngine === "whisper"
                    ? "Offline Whisper (whisper.cpp, multilingual Hindi+English model) — local, no cloud, no API key."
                    : this.activeSTTEngine === "browser-online"
                        ? "Online browser speech fallback is disabled in Phase 9."
                        : "No STT engine could be initialized."
            );

            try {
                const label = document.getElementById("sttEngineLabel");
                if (label) {
                    label.textContent = engineLabel;
                    label.title =
                        this.activeSTTEngine === "whisper"
                            ? "Voice commands are transcribed locally (offline Whisper model), not sent to any cloud speech API."
                            : "No verified local speech transcription engine is currently available. Cloud/browser speech recognition is disabled.";
                }
            } catch (labelError) {
                // status label is purely cosmetic — never fatal
            }

            this.updateStatus(
                "READY"
            );

            return true;

        } catch (error) {

            this.lastError =
                error?.message ||
                String(error);

            console.error(
                "❌ Voice Init Error:",
                error
            );

            this.initialized =
                false;

            this.isSupported =
                false;

            this.updateStatus(
                "VOICE ERROR"
            );

            return false;
        }
    }


    /* ======================================================
       BOOT
    ====================================================== */

    boot() {

        if (this.booted) {
            return this.isSupported;
        }

        const result =
            this.init();

        this.booted =
            result;

        if (result) {

            console.log(
                "🚀 Voice Engine Boot Complete"
            );

            // ALWAYS-ON MODE: JARVIS starts listening the moment the app
            // is ready — no click on the mic button required. autoListen
            // makes it keep re-arming itself after every reply / pause, so
            // it effectively stays online in the background for the whole
            // session until the user explicitly mutes it.
            this.autoListen = true;

            setTimeout(() => {
                if (this.autoListen && !this.muted && !this.isListening && !this.isSpeaking) {
                    this.startListening();
                }
            }, 400);

        } else {

            console.warn(
                "⚠ Voice Engine Boot Failed"
            );
        }

        return result;
    }


    /* ======================================================
       LOAD TTS VOICES
    ====================================================== */

    loadVoices() {

        if (!this.synthesis) {
            return;
        }

        const selectVoice = () => {

            const voices =
                this.synthesis.getVoices() || [];

            if (!voices.length) {
                return;
            }

            this.voice =
                voices.find(
                    voice =>
                        voice.lang &&
                        voice.lang.toLowerCase() ===
                        this.language.toLowerCase()
                ) ||

                voices.find(
                    voice =>
                        voice.lang &&
                        voice.lang
                            .toLowerCase()
                            .startsWith("en")
                ) ||

                voices[0];

            console.log(
                "🔊 TTS Voice:",
                this.voice?.name ||
                "Default"
            );
        };

        selectVoice();

        this.synthesis.onvoiceschanged =
            selectVoice;
    }


    /* ======================================================
       LANGUAGE
    ====================================================== */

    setLanguage(
        language = "en-IN"
    ) {

        const value =
            String(
                language || "en-IN"
            ).trim();

        this.language =
            value || "en-IN";

        if (this.recognition) {

            this.recognition.lang =
                this.language;
        }

        this.loadVoices();

        console.log(
            "🌐 Voice Language Changed:",
            this.language
        );

        return this.language;
    }


    /* ======================================================
       RATE
    ====================================================== */

    setRate(
        rate = 1
    ) {

        const value =
            Number(rate);

        if (
            Number.isFinite(value)
        ) {

            this.rate =
                Math.max(
                    0.1,
                    Math.min(
                        10,
                        value
                    )
                );
        }

        return this.rate;
    }


    /* ======================================================
       PITCH
    ====================================================== */

    setPitch(
        pitch = 1
    ) {

        const value =
            Number(pitch);

        if (
            Number.isFinite(value)
        ) {

            this.pitch =
                Math.max(
                    0,
                    Math.min(
                        2,
                        value
                    )
                );
        }

        return this.pitch;
    }


    /* ======================================================
       VOLUME
    ====================================================== */

    setVolume(
        volume = 1
    ) {

        const value =
            Number(volume);

        if (
            Number.isFinite(value)
        ) {

            this.volume =
                Math.max(
                    0,
                    Math.min(
                        1,
                        value
                    )
                );
        }

        return this.volume;
    }


    /* ======================================================
       START LISTENING
    ====================================================== */

    async startListening() {

        // DIAGNOSTIC FIX: this used to return silently when muted, so a
        // muted mic looked exactly like a broken STT in the logs (no
        // [VOICE] lines at all). Log it so "stt not working" is
        // distinguishable from "mic is muted".
        if (this.muted) {
            console.warn("🔇 [VOICE] startListening skipped — mic is muted");
            return false;
        }
        if (this.isListening) return true;

        // Courtesy hand-off to the ambient wake-word listener (wakeWord.js),
        // if it's running: stop it before we open the real command mic so
        // the two recognizers don't both try to read the microphone at
        // once. No-op if wakeWord.js isn't loaded or isn't enabled.
        if (window.WakeWordEngine && typeof window.WakeWordEngine.suspend === "function") {
            window.WakeWordEngine.suspend();
        }

        if (this._captureStartPromise) return this._captureStartPromise;
        if (this._captureStopPromise) {
            await this._captureStopPromise;
        }
        this.lastError = null;

        // The native path captures PCM in Chromium and sends only
        // samples to the main process. It does not depend on browser
        // SpeechRecognition or a separately installed SoX executable.
        if (this.useNativeSTT && this.nativeSTTAvailable) {
            this._captureStartPromise = this.startNativeCapture();

            try {
                return await this._captureStartPromise;
            } finally {
                this._captureStartPromise = null;
            }
        }

        // DIAGNOSTIC FIX: this failure path used to be completely silent
        // (status text only, no console output), which made STT look
        // "mysteriously dead" when the preload bridge was missing.
        this.lastError = "STT_RUNTIME_BLOCKED: verified local Whisper engine is unavailable.";
        console.warn("❌ [VOICE] STT runtime blocked — native bridge unavailable", {
            useNativeSTT: this.useNativeSTT,
            nativeSTTAvailable: this.nativeSTTAvailable,
            bridge: !!(window.jarvis && window.jarvis.voice)
        });
        this.updateStatus("STT RUNTIME BLOCKED");
        return false;
    }

    /* ======================================================
       3D CORE STATE SYNC
       Maps the voice engine state onto the 3D energy core:
         speaking > listening > thinking > error > idle
    ====================================================== */

    syncCoreState() {
        try {
            const core = window.JarvisCore3D || window.JarvisOrb3D;
            if (!core || typeof core.setState !== "function") return;
            let state = "idle";
            if (this.isSpeaking) state = "speaking";
            else if (this.isListening) state = "listening";
            else if (this.isProcessingVoice) state = "thinking";
            else if (this._coreError) state = "error";
            if (core.getState && core.getState() === state) return;
            core.setState(state);
        } catch (_) {
            // The core is purely cosmetic — never let it break voice.
        }
    }

    markVoiceProcessing(active) {
        this.isProcessingVoice = !!active;
        clearTimeout(this._voiceProcessingTimer);
        if (active) {
            // Safety net: never stay stuck in "thinking" forever if a
            // response path never reports back (e.g. listen() caller).
            this._voiceProcessingTimer = setTimeout(() => {
                this.isProcessingVoice = false;
                this.syncCoreState();
            }, 15000);
        }
        this.syncCoreState();
    }

    async startNativeCapture() {
        if (!window.jarvis?.voice?.transcribe) {
            this.lastError = "Native STT bridge is not available.";
            this.updateStatus("VOICE UNAVAILABLE");
            return false;
        }

        // Guard against a leftover capture object from a previous turn
        // (e.g. a crashed/aborted cycle). Starting a second capture on
        // top of an old one leaks a MediaStream + AudioContext per turn,
        // which is the main reason long sessions eventually crash/freeze.
        if (this.capture) {
            console.warn("⚠ [VOICE] Stale capture found — cleaning up before restart");
            try { await this.abortListening(); } catch (_) {}
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            this.lastError = "Microphone capture is not available.";
            this.updateStatus("MIC UNAVAILABLE");
            return false;
        }

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            this.lastError = "Audio capture is not available.";
            this.updateStatus("MIC UNAVAILABLE");
            return false;
        }

        const generation = ++this._captureGeneration;
        let stream = null;
        let audioContext = null;

        try {
            const duplexConfig = await window.jarvis?.voice?.getDuplexConfig?.().catch(() => null);
            this.fullDuplexEnabled = (duplexConfig?.data || duplexConfig)?.enabled !== false;
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    // Inspect effective settings below; requested AEC alone
                    // does not prove acoustic separation on this device.
                    autoGainControl: true
                }
            });

            const micTrack = stream.getAudioTracks?.()[0] || stream.getTracks?.()[0];
            const settings = micTrack?.getSettings?.() || {};
            const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
            this.captureDiagnostics = {
                echoCancellationSupported: supported.echoCancellation === true,
                echoCancellation: settings.echoCancellation === true,
                noiseSuppression: settings.noiseSuppression === true,
                autoGainControl: settings.autoGainControl === true
            };

            // Clear, diagnosable mic path: permission granted + capture
            // actually started (this is the point where a Windows privacy
            // block would have thrown NotAllowedError instead).
            console.log("[VOICE][MIC] Microphone permission granted — starting audio capture @16 kHz");

            audioContext = new AudioContextClass({
                sampleRate: 16000
            });
            await audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            // Smaller audio callbacks let VAD notice the end of a phrase
            // sooner (4096 samples added up to ~256 ms at 16 kHz).
            const processor = audioContext.createScriptProcessor(2048, 1, 1);
            const silentGain = audioContext.createGain();
            const chunks = [];

            silentGain.gain.value = 0;

            // ---------------------------------------------------------
            // AUTO-STOP ON SILENCE (VAD)
            // Previously recording only stopped when something else
            // called stopListening() (e.g. clicking Send/Stop again),
            // so the user had to manually end every turn. Now we watch
            // the mic's volume: once real speech has been heard and the
            // user goes quiet for SILENCE_STOP_MS, we stop and transcribe
            // automatically — "user bola, bolna khatam, turant reply."
            // A max-duration safety net avoids an endless recording if
            // the mic stays noisy.
            // ---------------------------------------------------------
            // Use a lower VAD gate so quiet speech is not discarded before
            // Whisper ever receives it. Noise suppression and echo cancellation
            // are already enabled on the microphone track.
            // A fixed 0.005 gate treated keyboard hum, fans, and room noise
            // as speech. Learn a short ambient floor for each capture and
            // keep a conservative minimum gate so noise never reaches STT.
            const BASE_SPEECH_RMS = 0.012;
            // End capture sooner after speech; retain a brief pause for
            // natural sentence breaks while cutting the old 1.1s wait.
            const SILENCE_STOP_MS = 420;
            const MIN_SPEECH_MS = 400;
            const MAX_CAPTURE_MS = 25000;

            processor.onaudioprocess = (event) => {
                // This callback fires many times a second on the audio
                // thread. Any uncaught exception here (a bad frame, a
                // disconnected node, etc.) used to bubble up and could
                // take the whole renderer down mid-conversation — wrap
                // it so a single bad frame just gets skipped instead.
                try {
                    if (!this.capture || this.capture.stopping) return;

                    const cap = this.capture;
                    const rawInput = event.inputBuffer.getChannelData(0);
                    const input = this.removeTTSEcho(rawInput, event.inputBuffer.sampleRate);
                    const frameMs = (input.length / event.inputBuffer.sampleRate) * 1000;
                    let sumSquares = 0;
                    for (let i = 0; i < input.length; i++) {
                        sumSquares += input[i] * input[i];
                    }
                    const rms = Math.sqrt(sumSquares / input.length);
                    if (!cap.hasSpeech && (cap.noiseCalibrationMs || 0) < 350 && rms < 0.04) {
                        cap.noiseFloor = Math.max(0.0015, (cap.noiseFloor || 0.003) * 0.8 + rms * 0.2);
                        cap.noiseCalibrationMs = (cap.noiseCalibrationMs || 0) + frameMs;
                    }
                    const speechRms = Math.max(BASE_SPEECH_RMS, (cap.noiseFloor || 0.003) * 3.2);
                    const ttsActive = this.isSpeaking || window.isSpeaking || window.TTSEngine?.isBusy?.();
                    // Never stop on volume alone: unmatched speaker echo can
                    // be louder than a user. Verify speech while output continues.
                    if (ttsActive && !cap.bargedIn) {
                        if (this.fullDuplexEnabled === false) {
                            chunks.length = 0;
                            cap.hasSpeech = false;
                            cap.monitoringTTS = true;
                            return;
                        }
                        if (!cap.monitoringTTS) {
                            chunks.length = 0;
                            cap.hasSpeech = false;
                            cap.speechMs = cap.silentMs = cap.elapsedMs = 0;
                            cap.monitoringTTS = true;
                        }
                        const output = this._speechOutput;
                        // Keep the initial output guard short enough for a
                        // natural interruption, while still ignoring the
                        // first speaker-buffer burst.
                        const guardUntil = (output?.startedAt || cap.ttsStartedAt || (cap.ttsStartedAt = Date.now())) + 450;
                        if (Date.now() < guardUntil || Date.now() < (cap.bargeInRetryAt || 0)) {
                            chunks.length = 0;
                            cap.bargeInMs = 0;
                            return;
                        }
                        if (cap.bargeInChecking) {
                            cap.bargeInPendingChunks.push(new Float32Array(input));
                            while (cap.bargeInPendingChunks.length > 16) cap.bargeInPendingChunks.shift();
                            return;
                        }
                        if (rms >= 0.015) {
                            if (cap.bargeInMs === 0) this.updateStatus("INTERRUPT LISTENING");
                            chunks.push(new Float32Array(input));
                            while (chunks.length > 16) chunks.shift();
                            cap.bargeInMs = (cap.bargeInMs || 0) + frameMs;
                        } else {
                            chunks.length = 0;
                            cap.bargeInMs = 0;
                        }
                        if ((cap.bargeInMs || 0) >= 450 && !cap.bargeInChecking) {
                            this.verifyBargeIn(cap, event.inputBuffer.sampleRate);
                        }
                        return;
                    }
                    if (cap.monitoringTTS && !cap.bargedIn) {
                        cap.monitoringTTS = false;
                        cap.bargeInMs = 0;
                        cap.ttsStartedAt = 0;
                        this._ignoreMicUntil = Date.now() + 500;
                    }
                    if (!cap.bargedIn && Date.now() < this._ignoreMicUntil) {
                        chunks.length = 0;
                        cap.hasSpeech = false;
                        cap.speechMs = 0;
                        cap.silentMs = 0;
                        cap.elapsedMs = 0;
                        return;
                    }
                    if (rms >= speechRms && !cap.hasSpeech) this.updateStatus("USER SPEAKING");

                    chunks.push(new Float32Array(input));

                    cap.elapsedMs = (cap.elapsedMs || 0) + frameMs;

                    if (rms >= speechRms) {
                        cap.hasSpeech = true;
                        cap.speechMs = (cap.speechMs || 0) + frameMs;
                        cap.silentMs = 0;
                    } else if (cap.hasSpeech) {
                        cap.silentMs = (cap.silentMs || 0) + frameMs;
                    }

                    const shouldAutoStop =
                        cap.hasSpeech &&
                        cap.speechMs >= MIN_SPEECH_MS &&
                        cap.silentMs >= SILENCE_STOP_MS;

                    const hitMaxDuration =
                        cap.elapsedMs >= MAX_CAPTURE_MS;

                    if ((shouldAutoStop || hitMaxDuration) && !cap.autoStopping) {
                        cap.autoStopping = true;
                        console.log(
                            shouldAutoStop
                                ? "[VOICE] Silence detected — sending to STT"
                                : "[VOICE] Max recording time reached — sending to STT"
                        );
                        this.stopNativeCapture();
                    }
                } catch (frameError) {
                    console.error("❌ [VOICE] Audio frame error (skipped):", frameError);
                }
            };

            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(audioContext.destination);

            this.capture = {
                generation,
                stream,
                audioContext,
                source,
                processor,
                silentGain,
                chunks,
                hasSpeech: false,
                speechMs: 0,
                silentMs: 0,
                elapsedMs: 0,
                noiseFloor: 0.003,
                noiseCalibrationMs: 0
            };

            window.jarvis.voice.start();
            this.isListening = true;
            this._coreError = false;
            this.updateStatus("LISTENING");
            this.setOrb(true);
            this.syncCoreState();
            console.log("[VOICE] Microphone started");
            return true;
        } catch (error) {
            stream?.getTracks?.().forEach((track) => track.stop());
            if (audioContext) {
                try {
                    await audioContext.close();
                } catch (_) {}
            }
            this.lastError = error?.message || String(error);
            this.updateStatus(
                error?.name === "NotAllowedError"
                    ? "MIC PERMISSION DENIED"
                    : "MICROPHONE ERROR"
            );
            console.error("❌ [VOICE] Microphone start failed:", error);
            return false;
        }
    }

    // Since JARVIS is already listening continuously, no separate
    // "wake word engine" is needed — but people naturally say "Jarvis,
    // do X". Stripping the name off the front keeps replies on-topic
    // and instant instead of JARVIS trying to answer "Jarvis do X"
    // literally.
    stripWakeWord(text) {
        // Covers common STT mishears of "Jarvis" (jarviz/jarvish/jaarvis/
        // jar vis as two words) so the name still gets stripped even when
        // the transcript is slightly off.
        const wakePattern =
            /^(?:(?:hey|ok|okay|हे|हेलो|हैलो|नमस्ते)\s+)?(?:jarvis|jarviz|jarvish|jaarvis|jar\s+vis|जार्विस|जारविस|जर्विस|जार्विज)[\s,:-]+/i;
        return String(text || "").replace(wakePattern, "").trim() || text;
    }

    handleNativeTranscript(text) {
        const raw = String(text || "").trim();
        const transcript = this.stripWakeWord(raw);
        const ttsBusy = this.isSpeaking || window.isSpeaking || window.TTSEngine?.isBusy?.();
        const interruptPhrase = /\b(?:stop|pause|wait|quiet|silence|listen|hold on|ruk|ruko|rukiye|suno|chup|band karo)\b|रुक|रुको|रुकिए|सुनो|चुप|बंद\s*करो/iu.test(transcript);
        // A late Whisper result can be the assistant's own playback. Drop it
        // while TTS is active, but preserve a real interruption or a command
        // that does not resemble the text JARVIS just spoke.
        if (ttsBusy && !interruptPhrase && this.isSelfVoiceTranscript(transcript, this._speechOutput?.text || this.lastResponse || "")) {
            console.info("[VOICE] Ignored self-echo transcript during TTS playback.");
            return;
        }
        this.isListening = false;
        this.setOrb(false);
        this.updateStatus(transcript ? "PROCESSING" : "READY");

        // CONVERSATION MODE (v2.2) — a live utterance arrived; extend the
        // no-wake-word conversation window. Best-effort.
        try { window.JARVISConversationMode?.onUserUtterance?.(); } catch (_) {}
        if (!transcript) {
            this.isProcessingVoice = false;
            this.syncCoreState();
            return;
        }
        this.lastTranscript = transcript;
        this.lastTranscriptAt = Date.now();
        this.lastTranscriptConfidence = null;
        console.log(`[IPC] Transcript delivered → [BRAIN] Received: "${transcript}"`);
        // Universal language intelligence: detect language + intent
        if (window.JARVISLanguageCore) {
            const langInfo = window.JARVISLanguageCore.analyze(transcript);
            console.log(`[BRAIN] Language: ${langInfo.mode}`);
            console.log(`[BRAIN] Intent: ${langInfo.intent} (confidence: ${langInfo.confidence})`);
            console.log(`[BRAIN] Response Language: ${langInfo.responseLanguage}`);
            this._lastLanguageAnalysis = langInfo;
        } else {
            console.log(`[BRAIN] Language: ${classifyInputLanguage(transcript)}`);
        }
        this.markVoiceProcessing(true);
        if (this._resolveListen) {
            const resolve = this._resolveListen;
            this.clearListenPromise();
            resolve(transcript);
            // BUG FIX (duplicate responses): the listen() caller (e.g. the
            // mic button in renderer.js) forwards the transcript to the
            // ChatEngine itself. We used to ALSO call sendToChat() here, so
            // every mic-button command was processed TWICE (duplicate
            // commands / duplicate replies). Resolving ends our job.
            return;
        }
        this.sendToChat(transcript);
    }

    /* ======================================================
       LISTEN
       Promise API
    ====================================================== */

    listen() {

        if (!this.initialized) {

            if (!this.init()) {

                return Promise.resolve(
                    ""
                );
            }
        }

        if (this.isListening) {

            return (
                this._listenPromise ||
                Promise.resolve(
                    this.lastTranscript
                )
            );
        }

        this._listenPromise =
            new Promise(
                (
                    resolve,
                    reject
                ) => {

                    this._resolveListen =
                        resolve;

                    this._rejectListen =
                        reject;

                    Promise.resolve(this.startListening())
                        .then((started) => {
                            if (!started && this._resolveListen) {
                                const finish = this._resolveListen;
                                this.clearListenPromise();
                                finish("");
                            }
                        })
                        .catch(() => {
                            if (this._resolveListen) {
                                const finish = this._resolveListen;
                                this.clearListenPromise();
                                finish("");
                            }
                        });
                }
            );

        return this._listenPromise;
    }


    /* ======================================================
       STOP LISTENING
    ====================================================== */

    stopListening() {

        // Courtesy hand-back to the ambient wake-word listener, if it was
        // suspended for this command capture. Only resumes if the user
        // actually has wake word mode enabled; otherwise a harmless no-op.
        // Only auto-resumes here when NOT in continuous autoListen mode —
        // autoListen already keeps re-arming startListening() itself
        // (which will re-suspend wake word immediately anyway), so
        // resuming here too would just cause pointless start/stop churn.
        if (window.WakeWordEngine && typeof window.WakeWordEngine.resume === "function" && !this.autoListen) {
            window.WakeWordEngine.resume();
        }

        if (this.useNativeSTT && this.nativeSTTAvailable && this.isListening) {
            return this.stopNativeCapture();
        }

        if (!this.recognition) return false;
        try {
            if (this.isListening) this.recognition.stop();
            return true;
        } catch (error) {
            console.error("❌ Stop Listening Error:", error);
            return false;
        }
    }

    /* ======================================================
       MUTE / UNMUTE
       Lets the user silence the mic without stopping JARVIS
       entirely. When unmuted (and autoListen is on), listening
       resumes automatically — no need to press the mic button.
    ====================================================== */

    setFocusMode(enabled) {
        this.focusMode = enabled === true;
        if (this.recognition) this.recognition.maxAlternatives = this.focusMode ? 3 : 1;
        return this.focusMode;
    }

    mute() {
        this.muted = true;
        this.stopListening();
        this.updateStatus("MUTED");
        this.setMuteUI(true);
        console.log("🔇 Microphone muted");
        return true;
    }

    unmute() {
        this.muted = false;
        this.setMuteUI(false);
        console.log("🔊 Microphone unmuted");

        if (this.autoListen && !this.isListening) {
            this.startListening();
        } else {
            this.updateStatus("READY");
        }

        return true;
    }

    toggleMute() {
        return this.muted ? this.unmute() : this.mute();
    }

    setMuteUI(active) {
        const chatMicBtn = document.getElementById("voiceBtn");
        if (chatMicBtn) {
            chatMicBtn.classList.toggle("muted", !!active);
            chatMicBtn.title = active
                ? "Microphone muted — tap to unmute"
                : "Tap to mute/unmute microphone";
        }

        const vmBtn = document.getElementById("vmMicBtn");
        if (vmBtn) {
            vmBtn.classList.toggle("muted", !!active);
            vmBtn.title = active
                ? "Microphone muted — tap to unmute"
                : "Tap to mute/unmute microphone";
        }
    }

    /* ======================================================
       CONTINUOUS CONVERSATION
       Called after every command is processed (and after
       recoverable recognition errors) so the user can keep
       talking to JARVIS without ever touching the mic button.
    ====================================================== */

    maybeRestartListening() {
        if (!this.autoListen) return;
        if (this.muted) return;
        if (this.isListening) return;

        const restartDelay = Math.max(120, this._ignoreMicUntil - Date.now());
        setTimeout(() => {
            if (this.autoListen && !this.muted && !this.isListening) {
                this.startListening();
            }
        }, restartDelay);
    }

    /* ======================================================
       ARM / RESUME LISTENING FOR SPEECH
       Keep the echo-cancelled mic open so speech can interrupt output.
    ====================================================== */

    pauseForSpeech() {
        if (this.autoListen && !this.muted) {
            Promise.resolve(this.startListening()).catch(error => {
                console.warn("[VOICE] Could not arm barge-in capture:", error);
            });
        }
    }

    beginSpeechOutput(text) {
        this._speechOutput = { text: String(text || ""), startedAt: Date.now() };
        this.resetBargeInCandidate();
    }

    speechPlaybackStarted() {
        if (this._speechOutput) this._speechOutput.startedAt = Date.now();
        this.resetBargeInCandidate();
    }

    endSpeechOutput() {
        this._speechOutput = null;
    }

    resetBargeInCandidate() {
        const cap = this.capture;
        if (!cap) return;
        cap.bargeInEpoch = (cap.bargeInEpoch || 0) + 1;
        cap.bargeInMs = 0;
        cap.bargeInChecking = false;
        cap.bargeInRetryAt = 0;
        cap.ttsStartedAt = Date.now();
        cap.bargedIn = false;
        cap.chunks.length = 0;
        cap.hasSpeech = false;
        cap.speechMs = cap.silentMs = cap.elapsedMs = 0;
    }

    isSelfVoiceTranscript(text, spokenText) {
        const words = value => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
        const candidate = words(text);
        const spoken = words(spokenText);
        if (!candidate.length || !spoken.length) return false;
        if (spoken.join(" ").includes(candidate.join(" "))) return true;
        const known = new Set(spoken);
        return candidate.filter(word => known.has(word)).length / candidate.length >= 0.6;
    }

    async verifyBargeIn(cap, sampleRate) {
        if (this._bargeInRequestPending) return;
        const output = this._speechOutput;
        // Unknown reply text cannot safely exclude self-voice.
        if (!output?.text || !window.jarvis?.voice?.transcribe) return;
        const epoch = cap.bargeInEpoch || 0;
        cap.bargeInChecking = true;
        cap.bargeInPendingChunks = [];
        const candidateChunks = cap.chunks.slice();
        const candidateSpeechMs = cap.bargeInMs;
        const reference = this._ttsEchoReference;
        const trustedReference = reference?.endedAt === null && (reference.matchedFrames || 0) >= 3;
        const candidate = this.resampleAudio(this.concatAudioChunks(cap.chunks), sampleRate, 16000);
        let timer;
        const request = Promise.resolve().then(() => window.jarvis.voice.transcribe(candidate, {}));
        this._bargeInRequestPending = true;
        request.then(() => { this._bargeInRequestPending = false; }, () => { this._bargeInRequestPending = false; });
        try {
            const result = await Promise.race([
                request,
                new Promise(resolve => { timer = setTimeout(() => resolve(null), 4000); })
            ]);
            if (this.capture !== cap || this._speechOutput !== output ||
                (cap.bargeInEpoch || 0) !== epoch || this.muted || !cap.monitoringTTS ||
                !(this.isSpeaking || window.isSpeaking || window.TTSEngine?.isBusy?.())) return;
            const text = String(result?.text || "").trim();
            const explicitInterrupt = /\b(stop|pause|wait|quiet|silence|listen|hold on|ruk|ruko|rukiye|suno|chup|band karo)\b|रुक|रुको|रुकिए|सुनो|चुप|बंद\s*करो/iu.test(text);
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            if (!result || result.success === false || result.stopped || !text ||
                this.isSelfVoiceTranscript(text, output.text) ||
                (!explicitInterrupt && (!trustedReference || wordCount < 2))) {
                cap.bargeInRetryAt = Date.now() + 1200;
                cap.chunks.length = 0;
                cap.bargeInMs = 0;
                return;
            }
            cap.bargedIn = true;
            cap.hasSpeech = true;
            cap.chunks.length = 0;
            cap.chunks.push(...candidateChunks, ...cap.bargeInPendingChunks);
            cap.speechMs = cap.elapsedMs = Math.min(candidateSpeechMs, 2000);
            this.stopSpeaking();
            this._ignoreMicUntil = 0;
            this.updateStatus("LISTENING");
            console.info("[VOICE] Verified user interruption — TTS stopped.");
        } catch (error) {
            if (this.capture !== cap || (cap.bargeInEpoch || 0) !== epoch) return;
            cap.bargeInRetryAt = Date.now() + 1200;
            cap.chunks.length = 0;
            cap.bargeInMs = 0;
            console.warn("[VOICE] Barge-in verification unavailable:", error?.message || error);
        } finally {
            clearTimeout(timer);
            if ((cap.bargeInEpoch || 0) === epoch) {
                cap.bargeInChecking = false;
                cap.bargeInPendingChunks = [];
            }
        }
    }

    // Decode a playback reference off the live capture graph. The media
    // element remains the output device; its currentTime anchors the reference.
    async prepareTTSEchoReference(bytes, audio) {
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) return null;
        try {
            const context = new OfflineContext(1, 1, 16000);
            const decoded = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            const samples = new Float32Array(decoded.length);
            for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
                const data = decoded.getChannelData(channel);
                for (let i = 0; i < data.length; i++) samples[i] += data[i] / decoded.numberOfChannels;
            }
            return { samples, sampleRate: decoded.sampleRate, audio, endedAt: null };
        } catch (error) {
            console.warn("[VOICE] TTS echo reference unavailable; using device echo cancellation:", error?.message || error);
            return null;
        }
    }

    setTTSEchoReference(reference) {
        clearTimeout(this._ttsEchoCleanupTimer);
        this._ttsEchoReference = reference;
    }

    finishTTSEchoReference(audio) {
        const reference = this._ttsEchoReference;
        if (reference?.audio !== audio) return;
        reference.endTime = Number(audio.currentTime) || 0;
        reference.endedAt = Date.now();
        clearTimeout(this._ttsEchoCleanupTimer);
        this._ttsEchoCleanupTimer = setTimeout(() => {
            if (this._ttsEchoReference === reference) this._ttsEchoReference = null;
        }, 650);
    }

    removeTTSEcho(input, sampleRate) {
        const reference = this._ttsEchoReference;
        if (!reference || sampleRate !== reference.sampleRate) return input;
        const tailMs = reference.endedAt === null ? 0 : Date.now() - reference.endedAt;
        if (tailMs > 650) {
            this._ttsEchoReference = null;
            return input;
        }
        const audio = reference.audio;
        if (reference.endedAt === null && (audio.paused || !(audio.currentTime > 0))) return input;
        const playbackTime = reference.endedAt === null ? audio.currentTime : reference.endTime + tailMs / 1000;
        const end = Math.round(playbackTime * sampleRate);
        const samples = reference.samples;
        // Fit up to three correlated paths for direct leakage plus room
        // reflections. Independent user speech remains in the residual.
        const first = Math.max(0, end - input.length - Math.round(sampleRate * 0.6));
        const last = Math.min(samples.length - input.length, end);
        let clean = input;
        for (let path = 0; path < 3; path++) {
            const next = this.subtractTTSEchoPath(clean, samples, first, last);
            if (next === clean) break;
            clean = next;
        }
        if (clean !== input) reference.matchedFrames = (reference.matchedFrames || 0) + 1;
        return clean;
    }

    subtractTTSEchoPath(input, samples, first, last) {
        let inputEnergy = 0;
        // Decimate only the correlation search, never the audio sent to STT.
        for (let i = 0; i < input.length; i += 4) inputEnergy += input[i] * input[i];
        if (inputEnergy < 1e-8) return input;
        let best = null;
        // Account for device latency, room reflections and ScriptProcessor
        // scheduling. Search bounded history (600 ms) rather than whole replies.
        for (let offset = first; offset <= last; offset += 4) {
            let dot = 0, energy = 0;
            for (let i = 0; i < input.length; i += 4) {
                const value = samples[offset + i];
                dot += input[i] * value;
                energy += value * value;
            }
            const score = energy > 1e-8 ? dot * dot / (energy * inputEnergy) : 0;
            if (score >= 0.30 && (!best || score > best.score)) best = { offset, score, gain: dot / energy };
        }
        if (!best) return input;
        // Refine alignment to individual samples around the winning coarse lag.
        const coarse = best.offset;
        let fullInputEnergy = 0;
        for (let i = 0; i < input.length; i++) fullInputEnergy += input[i] * input[i];
        best.score = 0;
        for (let offset = Math.max(0, coarse - 3); offset <= Math.min(samples.length - input.length, coarse + 3); offset++) {
            let dot = 0, energy = 0;
            for (let i = 0; i < input.length; i++) {
                const value = samples[offset + i];
                dot += input[i] * value;
                energy += value * value;
            }
            // Full-resolution energy prevents decimation aliases from suppressing
            // unrelated user speech that happened to match every fourth sample.
            const score = energy > 1e-8 ? dot * dot / (energy * fullInputEnergy) : 0;
            if (score > best.score) Object.assign(best, { offset, score, gain: dot / energy });
        }
        if (best.score < 0.30) return input;
        const clean = new Float32Array(input.length);
        for (let i = 0; i < input.length; i++) clean[i] = input[i] - best.gain * samples[best.offset + i];
        return clean;
    }

    resumeAfterSpeech() {
        // Let output-device echo decay before reopening command capture.
        if (!this.capture?.bargedIn) {
            this._ignoreMicUntil = Math.max(this._ignoreMicUntil, Date.now() + 650);
        }
        if (!this.autoListen || this.muted) {
            this.updateStatus("READY");
            return;
        }

        const restartDelay = Math.max(80, this._ignoreMicUntil - Date.now());
        setTimeout(() => {
            if (this.autoListen && !this.muted && !this.isListening && !this.isSpeaking) {
                this.startListening();
            }
        }, restartDelay);
    }

    async abortListening() {
        const shouldAbortRecognition =
            !!this.recognition && this.isListening && !this.capture;

        if (this.capture) {
            const capture = this.capture;
            this._captureGeneration += 1;
            this.capture = null;
            this.isListening = false;
            capture.stream?.getTracks?.().forEach((track) => track.stop());
            capture.source?.disconnect?.();
            capture.processor?.disconnect?.();
            capture.silentGain?.disconnect?.();
            try {
                await capture.audioContext?.close?.();
            } catch (_) {}
        }

        if (shouldAbortRecognition) {
            try {
                this.recognition.abort();
            } catch (_) {}
        }

        this.isListening = false;
        this.setOrb(false);
        this.updateStatus("READY");
        this.resolveEmptyListen();
        return true;
    }

    async stopNativeCapture() {
        if (this._captureStopPromise) return this._captureStopPromise;

        const capture = this.capture;
        if (!capture) {
            this.isListening = false;
            this.setOrb(false);
            this.updateStatus("READY");
            return false;
        }

        this._captureStopPromise = (async () => {
            this.lastTranscript = "";
            // Keep a stopping capture object until cleanup completes. This
            // makes late audio callbacks harmless instead of making callers
            // dereference a null processor during the short shutdown window.
            capture.stopping = true;
            this.capture = capture;
            this.isListening = false;
            this.setOrb(false);
            this.updateStatus("PROCESSING");

            capture.stream?.getTracks?.().forEach((track) => track.stop());
            capture.source?.disconnect?.();
            capture.processor?.disconnect?.();
            capture.silentGain?.disconnect?.();

            const sampleRate = capture.audioContext?.sampleRate || 16000;
            try {
                await capture.audioContext?.close?.();
            } catch (_) {}

            const samples = this.concatAudioChunks(capture.chunks);
            if (!capture.hasSpeech || (capture.speechMs || 0) < 400) {
                this.lastError = "No clear speech detected; audio was not sent for transcription.";
                console.info("[VOICE] Ignored capture without sustained speech activity.");
                this.updateStatus("READY");
                this.resolveEmptyListen();
                this.maybeRestartListening();
                return false;
            }
            if (!samples.length) {
                this.lastError = "No audio captured.";
                this.updateStatus("READY");
                this.resolveEmptyListen();
                this.maybeRestartListening();
                return false;
            }

            console.log(
                `[VOICE] Audio received — ${(samples.length / 16000).toFixed(2)}s, ` +
                `${samples.length} samples @16kHz`
            );
            console.log("[STT] Recognition started");

            const normalized = this.resampleAudio(
                samples,
                sampleRate,
                16000
            );

            // A hung main-process call (model still loading, IPC stall,
            // Whisper model failed to load) used to leave the UI stuck on
            // "PROCESSING" forever, which looked like the app had
            // crashed. Race it against a timeout so we always recover.
            //
            // BUG FIX (voice/STT reliability, ERROR_LOG E007): this used to
            // be a flat 20s timeout for every call. The very first
            // transcription after install requires the Whisper
            // model (~40-70MB) over the network before it can transcribe
            // anything, which routinely takes longer than 20s — so the
            // user's first ever attempt at using the mic looked broken
            // ("Transcription timed out") even though it was still quietly
            // working. Ask main.js whether the model is ready first, and
            // only use the short timeout once it actually is.
            const SHORT_TIMEOUT_MS = 30000;
            const FIRST_LOAD_TIMEOUT_MS = 180000;

            let timeoutMs = SHORT_TIMEOUT_MS;
            try {
                const modelStatus = await window.jarvis.voice.modelStatus?.();
                if (modelStatus && modelStatus.success && !modelStatus.ready) {
                    timeoutMs = FIRST_LOAD_TIMEOUT_MS;
                    this.updateStatus("DOWNLOADING VOICE MODEL...");
                }
            } catch (_) {
                // If the status check itself fails, fall back to the
                // longer timeout rather than risk a false "error" on a
                // slow first run.
                timeoutMs = FIRST_LOAD_TIMEOUT_MS;
            }

            const withTimeout = (promise) =>
                Promise.race([
                    promise,
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error("Transcription timed out.")),
                            timeoutMs
                        )
                    )
                ]);

            try {
                // BUG FIX (Hindi/Hinglish STT): this used to send
                // `{ language: this.language }`, and this.language defaults
                // to "en-IN" with nothing in the app ever changing it (no
                // language switch exists in the UI). That silently forced
                // Whisper to transcribe every recording as English, even
                // when the user spoke Hindi or Hinglish, producing garbled
                // or wrong transcripts. We now send no language hint at all
                // so the main process can auto-detect it per utterance
                // (see src/speech/stt.js + main.js's voice:transcribe
                // handler). this.language is still used for TTS/browser
                // SpeechRecognition elsewhere and is untouched by this fix.
                const result = await withTimeout(
                    window.jarvis.voice.transcribe(
                        normalized,
                        {}
                    )
                );

                // The user may have aborted or restarted the mic while the
                // main process was decoding. Ignore a late result from that
                // older capture instead of routing a duplicate command.
                if (capture.generation !== this._captureGeneration) {
                    console.warn("[VOICE] Ignoring stale transcription result from an interrupted capture.");
                    return false;
                }

                if (!result?.stopped && (!result || result.success === false)) {
                    this.lastError =
                        result?.error || "Transcription failed.";
                    console.warn(`[STT] Recognition failed: ${this.lastError}`);
                    this._coreError = true;
                    this.updateStatus("VOICE ERROR");
                    this.resolveEmptyListen();
                    this.maybeRestartListening();
                    return false;
                }

                if (result.fallbackReason) {
                    const engineLabel = document.getElementById("sttEngineLabel");
                    if (engineLabel) {
                        engineLabel.textContent = "🎙️ Whisper (offline fallback)";
                        engineLabel.title = `Sarvam STT failed, so this audio stayed local and was transcribed by Whisper. ${result.fallbackReason}`;
                    }
                    console.warn(`[STT] Sarvam unavailable; this turn used local Whisper: ${result.fallbackReason}`);
                }

                console.log(`[STT] Transcript: "${result.text}"`);
                this.handleNativeTranscript(result.text);
                return true;
            } catch (error) {
                this.lastError = error?.message || String(error);
                // Promise.race cannot cancel the underlying IPC call. Bump
                // the token on timeout so its eventual response is inert.
                if (/timed out|timeout/i.test(this.lastError)) this._captureGeneration += 1;
                this._coreError = true;
                this.updateStatus("VOICE ERROR");
                this.resolveEmptyListen();
                console.error("❌ [VOICE] Transcription request failed:", error);
                // Don't leave JARVIS silently dead after one bad turn —
                // recover and keep listening in continuous mode.
                this.maybeRestartListening();
                return false;
            }
        })().finally(() => {
            if (this.capture === capture) this.capture = null;
            this._captureStopPromise = null;
        });

        return this._captureStopPromise;
    }

    concatAudioChunks(chunks = []) {
        const length = chunks.reduce(
            (total, chunk) => total + chunk.length,
            0
        );
        const samples = new Float32Array(length);
        let offset = 0;

        for (const chunk of chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
        }

        return samples;
    }

    resampleAudio(samples, fromRate, toRate) {
        if (!samples.length || fromRate === toRate) {
            return samples;
        }

        const outputLength = Math.max(
            1,
            Math.round(samples.length * toRate / fromRate)
        );
        const output = new Float32Array(outputLength);
        const ratio = fromRate / toRate;

        for (let i = 0; i < output.length; i++) {
            const position = i * ratio;
            const left = Math.floor(position);
            const right = Math.min(left + 1, samples.length - 1);
            const fraction = position - left;
            output[i] =
                samples[left] * (1 - fraction) +
                samples[right] * fraction;
        }

        return output;
    }

    resolveEmptyListen() {
        if (!this._resolveListen) return;
        const resolve = this._resolveListen;
        this.clearListenPromise();
        resolve("");
    }

    /* ======================================================
       TOGGLE
    ====================================================== */

    toggleListening() {

        if (this.isListening) {

            return this.stopListening();
        }

        return this.startListening();
    }


    /* ======================================================
       RECOGNITION EVENTS
    ====================================================== */

    bindRecognitionEvents() {

        if (!this.recognition) {
            return;
        }


        /* --------------------------------------------------
           START
        -------------------------------------------------- */

        this.recognition.onstart =
            () => {

                this.isListening =
                    true;

                this.lastError =
                    null;

                console.log(
                    "🎤 Listening..."
                );

                this.updateStatus(
                    "LISTENING"
                );

                this.setOrb(
                    true
                );
            };


        /* --------------------------------------------------
           RESULT
        -------------------------------------------------- */

        this.recognition.onresult =
            event => {

                try {

                    if (
                        !event ||
                        !event.results ||
                        !event.results.length
                    ) {

                        return;
                    }

                    const result =
                        event.results[
                            event.results.length - 1
                        ];

                    if (
                        !result ||
                        !result[0]
                    ) {

                        return;
                    }

                    let selectedAlternative = result[0];
                    if (this.focusMode && result.length > 1) {
                        let bestScore = -Infinity;
                        for (const alternative of Array.from(result)) {
                            const candidate = String(alternative?.transcript || "").trim();
                            const intentConfidence = window.JARVISNaturalCommandEngine?.detect?.(candidate)?.confidence || 0;
                            const score = (Number(alternative?.confidence) || 0) + intentConfidence * 0.12;
                            if (score > bestScore) {
                                bestScore = score;
                                selectedAlternative = alternative;
                            }
                        }
                    }

                    const transcript =
                        this.stripWakeWord(
                            String(
                                selectedAlternative.transcript ||
                                ""
                            ).trim()
                        );

                    if (!transcript) {
                        return;
                    }

                    this.lastTranscript =
                        transcript;
                    this.lastTranscriptAt = Date.now();
                    this.lastTranscriptConfidence = Number.isFinite(Number(selectedAlternative.confidence)) && Number(selectedAlternative.confidence) > 0
                        ? Number(selectedAlternative.confidence)
                        : null;

                    console.log(
                        "👤 User:",
                        transcript
                    );

                    this.updateStatus(
                        "PROCESSING"
                    );


                    /*
                     * If listen() was called,
                     * resolve it.
                     */

                    if (
                        this._resolveListen
                    ) {

                        const resolve =
                            this._resolveListen;

                        this.clearListenPromise();

                        resolve(
                            transcript
                        );

                        /*
                         * The caller will send
                         * transcript to ChatEngine.
                         */

                        return;
                    }


                    /*
                     * Direct startListening()
                     * automatically sends
                     * transcript to ChatEngine.
                     */

                    this.sendToChat(
                        transcript
                    );

                } catch (error) {

                    console.error(
                        "❌ Recognition Result Error:",
                        error
                    );
                }
            };


        /* --------------------------------------------------
           END
        -------------------------------------------------- */

        this.recognition.onend =
            () => {

                this.isListening =
                    false;

                this.setOrb(
                    false
                );

                console.log(
                    "🎤 Listening Stopped"
                );

                /*
                 * If no transcript was received,
                 * resolve listen() with empty string.
                 */

                if (
                    this._resolveListen
                ) {

                    const resolve =
                        this._resolveListen;

                    this.clearListenPromise();

                    resolve("");
                }

                this.updateStatus(
                    "READY"
                );

                // Browser SpeechRecognition always ends after one
                // utterance (continuous mode isn't reliable across
                // browsers/OSes). Without this, "no button press"
                // conversation mode only worked on the native-STT path.
                this.maybeRestartListening();
            };


        /* --------------------------------------------------
           ERROR
        -------------------------------------------------- */

        this.recognition.onerror =
            event => {

                this.isListening =
                    false;

                this.setOrb(
                    false
                );

                const errorCode =
                    event?.error ||
                    "unknown";

                this.lastError =
                    errorCode;

                console.error(
                    "❌ Voice Recognition Error:",
                    errorCode
                );


                switch (
                    errorCode
                ) {

                    case "not-allowed":

                    case "service-not-allowed":

                        this.updateStatus(
                            "MIC PERMISSION DENIED"
                        );

                        break;


                    case "audio-capture":

                        this.updateStatus(
                            "MICROPHONE ERROR"
                        );

                        break;


                    case "no-speech":

                        this.updateStatus(
                            "NO SPEECH"
                        );

                        break;


                    case "network":

                        this.updateStatus(
                            "NETWORK ERROR"
                        );

                        break;


                    case "aborted":

                        this.updateStatus(
                            "READY"
                        );

                        break;


                    default:

                        this.updateStatus(
                            "VOICE ERROR"
                        );
                }


                /*
                 * Resolve the Promise instead
                 * of creating an unhandled
                 * rejection in normal UI usage.
                 */

                if (
                    this._resolveListen
                ) {

                    const resolve =
                        this._resolveListen;

                    this.clearListenPromise();

                    resolve("");
                }

                // Recoverable errors (timeout with no speech, brief
                // network blip, a manual abort) shouldn't break the
                // "just talk to JARVIS" experience — try listening
                // again automatically. Permission/hardware errors are
                // left alone so we don't spam the user with retries.
                if (
                    errorCode !== "not-allowed" &&
                    errorCode !== "service-not-allowed" &&
                    errorCode !== "audio-capture"
                ) {
                    this.maybeRestartListening();
                }
            };


        /* --------------------------------------------------
           NO MATCH
        -------------------------------------------------- */

        this.recognition.onnomatch =
            () => {

                console.warn(
                    "⚠ No speech match."
                );

                this.updateStatus(
                    "NO MATCH"
                );
            };
    }


    /* ======================================================
       CLEAR PROMISE
    ====================================================== */

    clearListenPromise() {

        this._listenPromise =
            null;

        this._resolveListen =
            null;

        this._rejectListen =
            null;
    }


    /* ======================================================
       SEND TO CHAT ENGINE
    ====================================================== */

    async sendToChat(
        message
    ) {

        const text =
            String(
                message || ""
            ).trim();

        if (!text) {
            return null;
        }

        // This is the single visible transcript insertion point for voice
        // input. Keep the original-language words in the chat; the canonical
        // form below is only for local command matching.
        this.showUserMessage(text);

        // ==========================================================
        // VOICE TOLERANCE ENGINE — STT error correction + Hindi
        // transliteration + phonetic fuzzy matching + grammar.
        //
        // This is the CENTRAL normalization point: all downstream
        // modules (BrowserVoiceControl, ChatEngine, NCE) receive
        // the CANONICAL text, never the raw STT errors.
        //
        // "helo jarvis open crome" → "hello jarvis open chrome"
        // "हेलो जार्विस क्रोम खोलो" → "hello jarvis chrome kholo"
        // ==========================================================
        let commandText = text;
        let detectedLang = "en";
        let vtResult = null;

        try {
            if (window.JARVISVoiceTolerance) {
                vtResult = window.JARVISVoiceTolerance.process(text);
                commandText = vtResult.canonical || text;
                detectedLang = vtResult.lang || "en";

                // Low-confidence + dangerous → clarify instead of execute
                if (vtResult.isDangerous && vtResult.confidence < 0.80) {
                    const clarify = (window.JARVISSmartReplies &&
                        window.JARVISSmartReplies.get("UNKNOWN", { lang: detectedLang })) ||
                        "Sorry, I didn't quite catch that.";
                    if (typeof this.speak === "function") {
                        this.speak(clarify);
                    }
                    return { handled: true, reply: clarify, source: "voice-tolerance", lowConfidence: true };
                }

                if (vtResult.debug && vtResult.debug.corrections.length) {
                    console.log("[VoiceTolerance] corrected:",
                        vtResult.debug.corrections.map(c => `${c.original}→${c.corrected}`).join(", "));
                }
            } else if (window.JARVISHindiTranslit && window.JARVISHindiTranslit.hasDevanagari(text)) {
                // Fallback: HindiTranslit only (older path)
                commandText = window.JARVISHindiTranslit.toCanonical(text);
                detectedLang = "hi";
            }
        } catch (vtError) {
            console.warn("VoiceTolerance error (using raw text):", vtError);
            commandText = text;
        }

        // Preserve literal app payloads before the browser fast path. Speech
        // correction must not rewrite text the user explicitly wants typed.
        const rawLocalIntent = window.JARVISNaturalCommandEngine?.detect?.(text);
        const localVoiceCommand = ["OPEN_APP", "APP_TASK_FLOW", "COMPUTER_USE", "MINECRAFT_WORLD_FLOW", "MINECRAFT_LAUNCH_FLOW", "CREATE_PRESENTATION", "CREATE_PDF", "CREATE_IMAGE", "CREATE_SPREADSHEET", "CREATE_OFFICE_FILE"].includes(rawLocalIntent?.intent);
        if (localVoiceCommand) commandText = text;

        // Smart reply helper: if SmartReplies is available, store the
        // detected language so downstream reply generators can use it.
        this._lastDetectedLang = detectedLang;
        console.info("[VOICE ROUTE] Transcript normalized", {
            rawTranscript: text,
            canonicalCommand: commandText,
            detectedLanguage: detectedLang,
            naturalIntent: window.JARVISNaturalCommandEngine?.detect?.(text)?.intent || "unknown"
        });

        try {

            // ---------------------------------------------
            // BROWSER VOICE CONTROL — fast path
            // Intercepts browser-control phrases ("open youtube",
            // "youtube kholo", "go back", "naya tab", etc.) BEFORE
            // they reach the (heavier, agent-routed) ChatEngine
            // pipeline. Kept fully isolated: any failure here just
            // falls through to the normal ChatEngine path below,
            // so it can never break existing voice→chat behavior.
            // ---------------------------------------------

            if (
                !localVoiceCommand && window.BrowserVoiceControl &&
                typeof window.BrowserVoiceControl.handle === "function"
            ) {

                let browserResult = null;

                try {

                    browserResult =
                        await window.BrowserVoiceControl.handle(commandText);

                } catch (bvcError) {

                    console.error(
                        "❌ BrowserVoiceControl error (falling back to ChatEngine):",
                        bvcError
                    );
                }

                if (browserResult && browserResult.handled) {

                    console.log(
                        "🌐 Voice → Browser Command:",
                        text,
                        "→",
                        browserResult.reply
                    );
                    console.log("[BROWSER] Executing action — browser command executed");

                    this.updateStatus(
                        "BROWSER"
                    );

                    if (typeof this.speak === "function") {
                        this.speak(browserResult.reply);
                    }

                    return browserResult;
                }
            }

            const chat =
                window.ChatEngineInstance ||
                window.ChatEngine ||
                null;

            if (!chat) {

                console.warn(
                    "⚠ ChatEngine Not Available"
                );

                this.updateStatus(
                    "CHAT OFFLINE"
                );

                return null;
            }

            console.log(
                "🎤 Voice → ChatEngine:",
                text
            );
            console.log(`[BRAIN] Routing "${text}" → intent engine`);

            let result;


            if (
                typeof chat.send ===
                "function"
            ) {

                result =
                    await chat.send(
                        commandText,
                        {
                            speak: true,
                            source: "voice",
                            // Keep Hindi as spoken in the chat/AI context.
                            // commandText is only the private normalized form
                            // used by local intent matching.
                            spokenText: text,
                            responseLanguage: detectedLang
                        }
                    );

            }

            else if (
                typeof chat.receive ===
                "function"
            ) {

                result =
                    await chat.receive(
                        text
                    );

            }

            else if (
                typeof chat.process ===
                "function"
            ) {

                result =
                    await chat.process(
                        text
                    );

            }

            else {

                console.error(
                    "❌ ChatEngine has no supported input method."
                );

                this.updateStatus(
                    "CHAT API ERROR"
                );

                return null;
            }


            const response =
                result?.response ||
                result?.text ||
                result?.reply ||
                result?.message ||
                "";            if (response) {

                console.info("[VOICE ROUTE] Chat completed", {
                    responseSource: result?.source || "unknown",
                    intent: result?.intent || "unknown",
                    handled: result?.handled === true
                });

                this.lastResponse =
                    String(
                        response
                    );

                console.log(
                    "🤖 JARVIS:",
                    this.lastResponse
                );
                console.log(`[BRAIN] Response generated (${result?.source || "chat"}) → handing to TTS`);
            }

            this.updateStatus(
                "ONLINE"
            );

            return result;

        } catch (error) {

            console.error(
                "❌ Voice → Chat Error:",
                error
            );

            this.updateStatus(
                "CHAT ERROR"
            );

            return null;
        } finally {

            // One transcript = exactly one Brain request. The brain is
            // done now (or failed) — drop the "thinking" state.
            this.markVoiceProcessing(false);

            // Continuous mode: automatically start listening again
            // once the reply has been handled, so the user never
            // has to press the mic button between commands.
            this.maybeRestartListening();
        }
    }


    /* ======================================================
       OFFLINE LISTEN (Whisper via renderer PCM + IPC)
       These aliases are retained for callers from older builds.
    ====================================================== */

    listenOffline() {

        return this.startListening();
    }

    async stopOfflineListening() {

        const stopped = await this.stopListening();
        return stopped ? this.lastTranscript : "";
    }

    /* ======================================================
       SPEAK
    ====================================================== */

    speak(
        text
    ) {

        const value =
            String(
                text || ""
            ).trim();

        if (!value) {
            return false;
        }

        this.speakSmart(value);
        return true;
    }

    // XTTS-v2 is now the primary TTS engine. The main process
    // `voice:speak` IPC handler routes through XTTS-v2 first, then
    // falls back to SAPI, then signals browser fallback. The renderer
    // TTSEngine (renderer/js/tts.js) handles the queue, playback, 3D
    // core state, and debug logging.
    //
    // If the main process returns audioBase64, it's XTTS-v2 or SAPI
    // audio that needs to be played via an <audio> element. If it
    // returns engine="browser", we fall back to browser speechSynthesis.
    async speakSmart(value) {

        // If the TTSEngine has a queue or is already processing,
        // we let it handle the new request (it will queue it).
        // The TTSEngine's speak() method handles the full pipeline.

        if (window.TTSEngine && typeof window.TTSEngine.speak === "function") {
            // The TTSEngine.speak() calls voice:speak IPC which routes
            // through XTTS-v2 → SAPI → browser automatically.
            const language = detectSpokenLanguage(value);
            // Map to the simple language code the IPC handler expects
            const langCode = language === "hi-IN" ? "hi" : "en";

            this.pauseForSpeech();
            this.isProcessingVoice = false;
            this.isSpeaking = true;
            this.setOrb(true);
            this.syncCoreState();
            console.log(`[TTS] Response generated (lang: ${langCode}) — speaking via XTTS-v2`);

            try {
                const result = await window.TTSEngine.speak(value, { language: langCode });
                this.isSpeaking = false;
                this.setOrb(false);
                this.updateStatus("READY");
                this.syncCoreState();

                if (!result || result.success === false) {
                    console.warn("[TTS] Edge/SAPI speech failed:", result?.error || "no speech result");
                    this.updateStatus("TTS UNAVAILABLE");
                }
                this.resumeAfterSpeech();
            } catch (error) {
                this.isSpeaking = false;
                this.setOrb(false);
                this.updateStatus("READY");
                this.syncCoreState();
                console.warn("[TTS] Edge/SAPI speech failed:", error);
                this.updateStatus("TTS UNAVAILABLE");
                this.resumeAfterSpeech();
            }
            return;
        }

        // Fallback: old direct IPC path (if TTSEngine isn't loaded yet)
        this.speakNormal(value);
    }

    // Small TTL cache around getMyVoiceSettings() so speakSmart()
    // doesn't pay an IPC round-trip on every reply for a setting that
    // almost never changes mid-session.
    async _getMyVoiceSettingsCached() {
        const now = Date.now();
        if (this._myVoiceSettingsCache && (now - this._myVoiceSettingsCache.at) < 5000) {
            return this._myVoiceSettingsCache.value;
        }
        const value = await window.jarvis.voice.getMyVoiceSettings();
        this._myVoiceSettingsCache = { value, at: now };
        return value;
    }

    // Plays audio from the local voice-clone server. Returns true only
    // if audio actually played, so the caller can fall back cleanly.
    speakWithMyVoice(value) {

        return new Promise((resolve) => {

            window.jarvis.voice.speakCloned(value, {})
                .then((result) => {

                    if (!result || result.success === false || !result.audioBase64) {
                        console.warn(
                            "⚠ My-voice server error:",
                            result && result.error
                        );
                        resolve(false);
                        return;
                    }

                    this.beginSpeechOutput(value);
                    this.pauseForSpeech();
                    this.isSpeaking = true;
                    this.setOrb(true);

                    const audio = new Audio(
                        `data:${result.mime || "audio/wav"};base64,${result.audioBase64}`
                    );

                    audio.onended = () => {
                        this.endSpeechOutput();
                        this.isSpeaking = false;
                        this.setOrb(false);
                        this.updateStatus("READY");
                        this.resumeAfterSpeech();
                        resolve(true);
                    };

                    audio.onerror = () => {
                        this.endSpeechOutput();
                        this.isSpeaking = false;
                        this.setOrb(false);
                        this.resumeAfterSpeech();
                        resolve(false);
                    };

                    audio.play().catch(() => {
                        this.endSpeechOutput();
                        this.isSpeaking = false;
                        this.setOrb(false);
                        this.resumeAfterSpeech();
                        resolve(false);
                    });
                })
                .catch((error) => {
                    console.warn("⚠ My-voice request failed:", error);
                    resolve(false);
                });
        });
    }

    // The original SAPI/browser-speechSynthesis path, unchanged in
    // behavior from before — just pulled out into its own method so
    // speakSmart() can fall back to it.
    speakNormal(
        value
    ) {

        // Prefer offline Windows SAPI TTS via the main process when
        // available; fall back to browser speechSynthesis otherwise
        // (dev environment, non-Windows, or if SAPI fails at runtime).
        if (window.jarvis && window.jarvis.voice && typeof window.jarvis.voice.speak === "function") {

            // Auto-select Hindi when Devanagari OR romanized Hindi/Hinglish
            // words are present, otherwise English. This keeps bilingual
            // (including fully-romanized Hinglish) replies aligned with
            // the text actually generated instead of defaulting to
            // English just because there's no Devanagari script.
            const language = detectSpokenLanguage(value);

            this.beginSpeechOutput(value);
            this.pauseForSpeech();
            this.isProcessingVoice = false;
            this.isSpeaking = true;
            this.setOrb(true);
            this.syncCoreState();
            console.log(`[TTS] Response generated (lang: ${language}) — speaking`);

            window.jarvis.voice.speak(value, { language })
                .then((result) => {

                    this.endSpeechOutput();
                    this.isSpeaking = false;
                    this.setOrb(false);
                    this.updateStatus("READY");
                    console.log("[TTS] Speaking finished");

                    if (!result || result.success === false) {
                        console.warn(
                            "⚠ Local SAPI Speak Failed:",
                            result && result.error
                        );
                        this.resumeAfterSpeech();
                        return;
                    }

                    if (result.voiceMismatch) {
                        // No installed SAPI voice matched the requested culture
                        // (e.g. hi-IN), so Windows spoke the text with a voice
                        // that can't actually read it. Warn clearly instead of
                        // silently pretending it worked.
                        console.warn(
                            `⚠ No SAPI voice installed for "${result.requestedCulture}" — ` +
                            `spoke with "${result.usedVoice}" instead, which will mispronounce this text. ` +
                            `Install a matching language pack/voice in Windows Settings > Time & Language > Speech.`
                        );
                    }

                    this.resumeAfterSpeech();
                })
                .catch((error) => {

                    this.endSpeechOutput();
                    this.isSpeaking = false;
                    this.setOrb(false);
                    this.updateStatus("READY");
                    this.syncCoreState();

                    console.warn(
                        "⚠ Local SAPI Speak Error:",
                        error
                    );
                    this.resumeAfterSpeech();
                });

            return true;
        }

        this.updateStatus("TTS UNAVAILABLE");
        return false;
    }

    speakViaBrowser(
        value
    ) {
        const text = String(value || "").trim();
        if (!text || !window.TTSEngine || typeof window.TTSEngine.speak !== "function") {
            console.warn("[TTS] Browser voice path suppressed because the selected-provider queue is unavailable.");
            return false;
        }

        // Older callers reached speechSynthesis directly, bypassing the
        // selected provider. Route them through the same serialized queue.
        const language = detectSpokenLanguage(text);
        window.TTSEngine.speak(text, { language: language === "hi-IN" ? "hi" : "en" })
            .then(result => {
                if (!result || result.success === false) console.warn("[TTS] Selected-provider playback failed:", result?.error || "unknown playback error");
            })
            .catch(error => console.error("[TTS] Selected-provider playback failed:", error?.message || error));
        return true;
    }


    /* ======================================================
       LEGACY / AGENT ALIASES
       Several older callers use start()/stop()/toggle().
       Keep these names mapped to the canonical APIs so the
       VoiceAgent and ChatEngine do not silently call missing
       methods.
    ====================================================== */

    start() {
        return this.startListening();
    }

    stop() {
        return this.stopListening();
    }

    toggle() {
        return this.toggleListening();
    }


    /* ======================================================
       STOP SPEAKING
    ====================================================== */

    stopSpeaking() {
        try {
            if (window.TTSEngine?.stop) window.TTSEngine.stop();
            else if (window.jarvis?.voice?.stopSpeaking) {
                Promise.resolve(window.jarvis.voice.stopSpeaking()).catch(error => {
                    console.warn("Voice provider stop failed:", error);
                });
            }
            this.synthesis?.cancel();

            this.isSpeaking =
                false;

            this.setOrb(
                false
            );

            return true;

        } catch (error) {

            console.error(
                "❌ Stop Speaking Error:",
                error
            );

            return false;
        }
    }


    /* ======================================================
       UI STATUS
    ====================================================== */

    updateStatus(
        status
    ) {

        // Track errors for the 3D core's error state (red tint), and
        // clear them on any healthy status so it doesn't stick.
        const statusText = String(status || "");
        if (/ERROR|DENIED|BLOCKED|UNAVAILABLE|STUCK/i.test(statusText)) {
            this._coreError = true;
        } else if (this._coreError && /^(READY|ONLINE|LISTENING|PROCESSING|BROWSER|NO SPEECH|NO MATCH|MUTED|IDLE)$/i.test(statusText)) {
            this._coreError = false;
        }
        this.syncCoreState();

        try {

            if (
                window.Renderer &&
                typeof
                window.Renderer
                    .setVoiceStatus ===
                "function"
            ) {

                window.Renderer
                    .setVoiceStatus(
                        status
                    );
            }


            const chatStatus =
                document.getElementById(
                    "chatStatus"
                );

            if (chatStatus) {

                chatStatus.textContent =
                    String(status);
            }

        } catch (error) {

            console.warn(
                "⚠ Voice Status UI Error:",
                error
            );
        }
    }


    /* ======================================================
       ORB
    ====================================================== */

    setOrb(
        active
    ) {

        try {
            // TTS and microphone capture share the same legacy boolean API,
            // but they need different visual states. Resolve the state here
            // so every caller (native STT, browser STT, XTTS and SAPI) keeps
            // the orb in sync without duplicating UI logic.
            const speaking = !!active && !!this.isSpeaking;
            const listening = !!active && !speaking;
            const visualState = speaking ? "speaking" : listening ? "listening" : "ready";

            if (
                window.Renderer &&
                typeof
                window.Renderer
                    .setOrbState ===
                "function"
            ) {

                window.Renderer
                    .setOrbState(
                        listening
                    );
            }

            if (document.body) {
                document.body.dataset.orbState = visualState;
            }

            const vmOrb =
                document.getElementById("vmOrb");

            if (vmOrb) {
                vmOrb.classList.toggle(
                    "listening",
                    listening
                );
                vmOrb.classList.toggle(
                    "speaking",
                    speaking
                );
                vmOrb.dataset.voiceState = visualState;
            }

            const vmMicBtn =
                document.getElementById("vmMicBtn");

            if (vmMicBtn) {
                vmMicBtn.classList.toggle(
                    "listening",
                    listening
                );
                vmMicBtn.classList.toggle("speaking", speaking);
            }

            const vmStatus =
                document.getElementById("vmStatus");

            if (vmStatus) {
                vmStatus.textContent =
                    speaking ? "Speaking" : listening ? "Listening" : "Ready";
            }

        } catch (error) {

            console.warn(
                "⚠ Voice Orb Error:",
                error
            );
        }
    }


    /* ======================================================
       SHOW USER MESSAGE
    ====================================================== */

    showUserMessage(
        text
    ) {

        try {

            if (
                window.Renderer &&
                typeof
                window.Renderer
                    .addUserMessage ===
                "function"
            ) {

                window.Renderer
                    .addUserMessage(
                        text
                    );

                return;
            }


            const box =
                document.getElementById(
                    "chatMessages"
                );

            if (!box) {
                return;
            }


            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "message user-message";

            div.textContent =
                String(text);

            box.appendChild(
                div
            );

            box.scrollTop =
                box.scrollHeight;

        } catch (error) {

            console.warn(
                "⚠ Transcript UI Error:",
                error
            );
        }
    }


    /* ======================================================
       DIAGNOSTICS
    ====================================================== */

    diagnostics() {

        return {

            supported:
                this.isSupported,

            initialized:
                this.initialized,

            booted:
                this.booted,

            listening:
                this.isListening,

            speaking:
                this.isSpeaking,

            language:
                this.language,

            lastTranscript:
                this.lastTranscript,

            lastResponse:
                this.lastResponse,

            lastError:
                this.lastError,

            recognition:
                !!this.recognition,

            synthesis:
                !!this.synthesis,

            voice:
                this.voice
                    ? this.voice.name
                    : "Default"
        };
    }


    /* ======================================================
       TEST
    ====================================================== */

    test() {

        const status =
            this.diagnostics();

        console.log(
            "🧪 JARVIS VOICE DIAGNOSTICS:",
            status
        );

        return status;
    }
}


/* ==========================================================
   GLOBAL INSTANCE
========================================================== */

if (
    !window.VoiceEngine
) {

    window.VoiceEngine =
        new JARVISVoice();
}

window.VoiceAgent =
    window.VoiceEngine;

window.JARVISVoiceEngine =
    window.VoiceEngine;


/* ==========================================================
   AUTO BOOT
========================================================== */

function bootVoiceEngine() {

    try {

        if (
            window.VoiceEngine &&
            typeof
            window.VoiceEngine.boot ===
            "function"
        ) {

            window.VoiceEngine.boot();
        }

        console.log(
            "🎤 voice.js Loaded — V14.2 FINAL"
        );

    } catch (error) {

        console.error(
            "❌ Voice Boot Error:",
            error
        );
    }
}


if (
    document.readyState ===
    "loading"
) {

    window.addEventListener(
        "DOMContentLoaded",
        bootVoiceEngine,
        {
            once: true
        }
    );

} else {

    bootVoiceEngine();
}


/* ==========================================================
   CRASH RECOVERY
   The mic/audio pipeline (getUserMedia, AudioContext, the
   Whisper IPC round-trip) sometimes throws unexpectedly. Left
   unhandled, that used to freeze the voice engine in a stuck
   "LISTENING"/"PROCESSING" state until the whole app was
   restarted. Instead: catch it, reset the voice engine's
   internal state, and — if continuous mode was on — resume
   listening automatically so one bad moment doesn't end the
   session.
========================================================== */

let __voiceRecoveryTimer = null;

function recoverVoiceEngine(reason) {

    const voice = window.VoiceEngine;
    if (!voice) return;

    console.error("🛠 [VOICE] Recovering after error:", reason);

    try {
        if (voice.capture) {
            voice.capture.stream?.getTracks?.().forEach((t) => t.stop());
            voice.capture.audioContext?.close?.().catch(() => {});
            voice.capture = null;
        }
    } catch (_) {}

    voice.isListening = false;
    voice.isSpeaking = false;
    voice._captureStartPromise = null;
    voice._captureStopPromise = null;
    voice.setOrb(false);
    voice.updateStatus("READY");

    clearTimeout(__voiceRecoveryTimer);
    __voiceRecoveryTimer = setTimeout(() => {
        if (voice.autoListen && !voice.muted && !voice.isListening && !voice.isSpeaking) {
            voice.startListening();
        }
    }, 500);
}

window.addEventListener("error", (event) => {
    const message = String(event?.message || "");
    const source = String(event?.filename || "");
    if (
        source.includes("voice.js") ||
        /voice|mic|audio|speech|Whisper|recognition/i.test(message)
    ) {
        recoverVoiceEngine(event?.error || message);
    }
});

window.addEventListener("unhandledrejection", (event) => {
    const message = String(event?.reason?.message || event?.reason || "");
    if (/voice|mic|audio|speech|Whisper|recognition|transcri/i.test(message)) {
        recoverVoiceEngine(event?.reason);
    }
});


/* ==========================================================
   DEBUG API
========================================================== */

window.JARVISVoiceDebug = {

    start() {

        return window.VoiceEngine
            .startListening();
    },


    stop() {

        return window.VoiceEngine
            .stopListening();
    },


    abort() {

        return window.VoiceEngine
            .abortListening();
    },


    toggle() {

        return window.VoiceEngine
            .toggleListening();
    },


    listen() {

        return window.VoiceEngine
            .listen();
    },


    speak(
        text
    ) {

        return window.VoiceEngine
            .speak(text);
    },


    stopSpeaking() {

        return window.VoiceEngine
            .stopSpeaking();
    },


    status() {

        return window.VoiceEngine
            .diagnostics();
    }
};


console.log(
    "🧪 JARVIS Voice Debug API Ready"
);
