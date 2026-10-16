"use strict";

/* Professional voice HUD bridge (UPGRADED).
 * Observes the existing VoiceEngine and drives:
 *   - the docked "Voice Command Center" (voiceControl button, status pill,
 *     live transcript, engine/language readout)
 *   - the fullscreen Voice Mode overlay (#vmOrb / #vmStatus / #vmMicBtn)
 * It never replaces the underlying voice engine or its IPC wiring — it
 * only reads state off it and toggles classes/text, so nothing about how
 * STT/TTS actually works changes here. Clicking the center mic proxies to
 * the original #voiceBtn so all existing click handlers keep firing. */
(function () {
    const centerButton = document.getElementById("voiceControl");
    const legacyButton  = document.getElementById("voiceBtn");
    const status         = document.getElementById("voiceCenterStatus");
    const engineState    = document.getElementById("voiceEngineState");
    const transcript      = document.getElementById("voiceTranscript");
    const language         = document.getElementById("voiceLanguageState");
    const confidence       = document.getElementById("voiceConfidenceState");

    const vmOrb    = document.getElementById("vmOrb");
    const vmStatus = document.getElementById("vmStatus");
    const vmMicBtn = document.getElementById("vmMicBtn");

    if (centerButton && legacyButton) {
        centerButton.addEventListener("click", () => legacyButton.click());
    }

    function getVoice() {
        return window.VoiceEngine || window.JARVISVoiceEngine || window.VoiceAgent || null;
    }

    let consecutiveMisses = 0;

    function tick() {
        const voice = getVoice();

        if (!voice) {
            // Voice engine hasn't attached yet (or failed to load). Don't
            // spam a false "error" state on first paint — only surface it
            // once the app has clearly had time to boot.
            consecutiveMisses++;
            if (consecutiveMisses > 40 && status) { // ~10s at 250ms
                status.textContent = "OFFLINE";
                if (engineState) engineState.textContent = "VOICE ENGINE NOT DETECTED";
            }
            return;
        }
        consecutiveMisses = 0;

        const muted     = !!voice.muted;
        const listening = !!voice.isListening;
        const speaking  = !!voice.isSpeaking;
        const hasError  = !!voice.lastError;

        document.body.classList.toggle("voice-active", listening || speaking);
        document.body.classList.toggle("voice-muted", muted);
        document.body.classList.toggle("voice-speaking", speaking);

        if (legacyButton) {
            legacyButton.classList.toggle("listening", listening && !muted);
            legacyButton.classList.toggle("muted", muted);
        }

        let label = "STANDBY";
        if (hasError) label = "ERROR";
        else if (muted) label = "MUTED";
        else if (speaking) label = "SPEAKING";
        else if (listening) label = "LISTENING";

        if (status) {
            status.textContent = label;
            status.classList.toggle("is-error", hasError);
        }

        if (engineState) {
            engineState.textContent = hasError
                ? String(voice.lastError).slice(0, 60)
                : muted
                    ? "MICROPHONE MUTED"
                    : speaking
                        ? "SPEAKING RESPONSE"
                        : listening
                            ? "CAPTURING VOICE"
                            : "VOICE ENGINE READY";
        }

        if (language) language.textContent = String(voice.language || "en-IN").toUpperCase();
        const confidenceValue = Number(voice.lastTranscriptConfidence);
        if (confidence) {
            const available = Number.isFinite(confidenceValue) && confidenceValue > 0;
            confidence.hidden = !available;
            confidence.textContent = available ? `Recognition ${Math.round(Math.min(1, confidenceValue) * 100)}%` : "";
            confidence.title = available ? "Speech recognition confidence from the active speech engine." : "";
        }

        const text = voice.lastTranscript || voice.interimTranscript || "";
        if (transcript) {
            if (text.trim()) {
                transcript.textContent = text.trim();
                transcript.classList.remove("is-placeholder");
            } else if (!transcript.classList.contains("is-placeholder")) {
                transcript.textContent = "Say a command to JARVIS…";
                transcript.classList.add("is-placeholder");
            }
        }

        // Fullscreen voice-mode overlay: keep in sync too, adding a
        // "speaking" visual the base app didn't previously distinguish
        // from "listening".
        if (vmOrb) {
            vmOrb.classList.toggle("listening", listening && !muted);
            vmOrb.classList.toggle("speaking", speaking);
        }
        if (vmMicBtn) {
            vmMicBtn.classList.toggle("listening", listening && !muted);
            vmMicBtn.classList.toggle("muted", muted);
        }
        if (vmStatus && !hasError) {
            vmStatus.textContent = speaking ? "Speaking" : listening ? "Listening" : muted ? "Muted" : "Ready";
        } else if (vmStatus && hasError) {
            vmStatus.textContent = "Voice error";
        }
    }

    setInterval(tick, 250);
    tick();
})();
