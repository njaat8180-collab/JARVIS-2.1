// ==========================================
// JARVIS PRO MAX
// XTTS-v2 TTS Settings Controller
// renderer/js/ttsSettings.js
// ==========================================
//
// Connects the TTS settings UI elements to the
// XTTS-v2 IPC channels. Handles:
//   - Status polling and display
//   - Speed slider
//   - Language selection
//   - Voice preview (test button)
//   - Reference voice info
//
// ==========================================

"use strict";

(function () {

    const POLL_INTERVAL = 5000; // 5 seconds
    let pollTimer = null;
    let initialized = false;

    // ==========================================
    // DOM HELPERS
    // ==========================================
    function $(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    function setBadge(status) {
        const badge = $("ttsStatusBadge");
        if (!badge) return;
        badge.textContent = status;
        badge.className = `tts-status-badge tts-status-${(status || "ready").toLowerCase()}`;
    }

    const ENGINE_LABELS = { edge: "Microsoft Edge TTS", sarvam: "Sarvam Bulbul v3", elevenlabs: "ElevenLabs Multilingual v2", "indic-parler": "Indic Parler-TTS (local)", sapi: "Windows SAPI (offline)", xtts: "XTTS-v2 (offline)" };

    // ==========================================
    // FETCH XTTS STATUS
    // ==========================================
    async function fetchStatus() {
        try {
            if (!window.jarvis?.voice?.xttsStatus) return;
            const result = await window.jarvis.voice.xttsStatus();
            if (!result || result.success === false) {
                setText("ttsEngineValue", "XTTS-v2");
                setText("ttsVoiceValue", "—");
                setBadge("ERROR");
                setText("ttsDeviceValue", "—");
                setText("ttsRefStatus", "Server not reachable");
                setText("ttsRefLoaded", "No");
                setText("ttsRefSpeakerCached", "No");
                return;
            }

            const s = result.data || result;

            const selectedEngine = s.ttsEngine || "edge";
            if (window.TTSEngine) window.TTSEngine._selectedEngine = selectedEngine;
            setText("ttsEngineValue", ENGINE_LABELS[selectedEngine] || ENGINE_LABELS.edge);
            setText("ttsVoiceValue", s.referenceLoaded ? "JARVIS" : "Not loaded");
            const engineSelect = $("ttsEngineSelect");
            if (engineSelect) engineSelect.value = selectedEngine;
            if (selectedEngine === "sapi") {
                const voiceSelect = $("ttsSapiVoiceSelect");
                setText("ttsVoiceValue", voiceSelect?.value || s.sapiVoice || "Microsoft David");
            } else if (selectedEngine === "edge") {
                const edgeVoice = s.edgeVoice || "auto";
                setText("ttsVoiceValue", edgeVoice === "auto" ? "Edge Auto · Hindi/Roman Hindi/English" : `Edge · ${edgeVoice}`);
            } else if (selectedEngine === "sarvam") {
                setText("ttsVoiceValue", "Sarvam Aditya · Bulbul v3");
            } else if (selectedEngine === "elevenlabs") {
                setText("ttsVoiceValue", `ElevenLabs · ${s.elevenLabsVoiceId || "configured voice"}`);
            } else if (selectedEngine === "indic-parler") {
                setText("ttsVoiceValue", "Male Indian voice · Hindi / English");
            } else if (selectedEngine === "xtts" && s.voiceProfile === "nakul-reference") {
                setText("ttsVoiceValue", "Nakul की Voice");
            }
            const edgeVoiceSelect = $("ttsEdgeVoiceSelect");
            if (edgeVoiceSelect) {
                edgeVoiceSelect.value = s.voiceProfile === "sarvam-grok"
                    ? "grok-sarvam-voice"
                    : selectedEngine === "indic-parler"
                    ? "indic-parler"
                    : selectedEngine === "xtts" && s.voiceProfile === "nakul-reference"
                        ? "nakul-reference"
                        : s.edgeVoice || "auto";
            }
            const edgeVoiceStatus = $("ttsEdgeVoiceStatus");
            if (edgeVoiceStatus) edgeVoiceStatus.textContent = s.edgeVoice === "auto" || !s.edgeVoice
                ? "Auto chooses the female Swara voice for Hindi/Roman Hindi and female Neerja for English."
                : s.edgeVoice === "madhur"
                    ? "Madhur is the best available native Edge Hindi male voice. For a richer Hindi male voice, choose Sarvam Bulbul v3."
                : "This free Microsoft Edge neural voice will be used when Edge TTS is selected.";
            setBadge(s.status || "READY");
            setText("ttsDeviceValue", s.device || "cpu");

            // Reference voice info
            setText("ttsRefVoiceName", s.referenceVoice || "jarvis_reference.wav");
            setText("ttsRefDuration", s.referenceDuration ? `${Number(s.referenceDuration).toFixed(1)}s` : "—");
            setText("ttsRefLoaded", s.referenceLoaded ? "✓ Yes" : "✗ No");
            setText("ttsRefSpeakerCached", s.speakerCached ? "✓ Yes" : "✗ No");
            setText("ttsRefStatus", selectedEngine === "edge" ? "Online Edge voice selected · internet required" : selectedEngine === "sarvam" ? (s.sarvamConfigured ? "Sarvam online · API key saved" : "Sarvam online · API key required") : selectedEngine === "elevenlabs" ? (s.elevenLabsConfigured ? "ElevenLabs online · API key saved" : "ElevenLabs online · API key required") : selectedEngine === "indic-parler" ? "Local Indic Parler-TTS · model loads on first use" : selectedEngine === "xtts" && s.voiceProfile === "nakul-reference" ? "Nakul की Voice · local reference voice" : s.available ? "Available on this computer" : "Local voice server not running");

            const sttSelect = $("sttEngineSelect");
            if (sttSelect) sttSelect.value = s.sttEngine || "offline";
            const sttLabel = $("sttEngineLabel");
            if (sttLabel) {
                const online = ["sarvam", "elevenlabs"].includes(s.sttEngine || "offline");
                sttLabel.textContent = s.sttEngine === "elevenlabs" ? "🎙️ ElevenLabs Scribe v2 (online)" : online ? "🎙️ Sarvam Saaras v4 (online)" : "🎙️ Whisper (offline)";
                sttLabel.title = online ? "Microphone audio is sent to the selected speech API for transcription." : "Voice audio is transcribed locally by Whisper.";
            }
            const keyStatus = $("sarvamApiKeyStatus");
            if (keyStatus) keyStatus.textContent = s.sarvamConfigured
                ? "Sarvam key is configured in JARVIS."
                : "No Sarvam key saved. Paste one above and save it.";
            const elevenStatus = $("elevenLabsApiKeyStatus");
            if (elevenStatus) elevenStatus.textContent = s.elevenLabsConfigured
                ? "ElevenLabs key is configured in JARVIS."
                : "No ElevenLabs key saved. Paste one above and save it.";

            // Speed slider sync
            if (s.speed !== undefined) {
                const slider = $("ttsSpeedSlider");
                const display = $("ttsSpeedValue");
                if (slider) slider.value = s.speed;
                if (display) display.textContent = Number(s.speed).toFixed(2);
            }

            // Language mode sync
            if (s.languageMode) {
                const sel = $("ttsLanguageSelect");
                if (sel) sel.value = s.languageMode;
            }

            const voiceSelect = $("ttsSapiVoiceSelect");
            const voiceStatus = $("ttsSapiVoiceStatus");
            if (voiceSelect) {
                const voiceResult = await window.jarvis.voice.sapiVoices?.();
                const voiceData = voiceResult?.data || voiceResult || {};
                const voices = voiceData.voices || [];
                const requested = s.sapiVoice || "Microsoft David";
                voiceSelect.replaceChildren();
                const requestedOption = document.createElement("option");
                requestedOption.value = requested;
                requestedOption.textContent = `${requested} (preferred)`;
                voiceSelect.appendChild(requestedOption);
                voices.forEach((voice) => {
                    if (!voice?.name || voice.name.toLowerCase() === requested.toLowerCase()) return;
                    const option = document.createElement("option");
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.culture || "unknown"})`;
                    voiceSelect.appendChild(option);
                });
                voiceSelect.value = requested;
                if (voiceStatus) {
                    const exact = voices.some(v => String(v.name || "").toLowerCase().includes(requested.toLowerCase()));
                    const maleFallback = /david/i.test(requested) && voices.some(v => /david|andrew|ryan|mark|guy|daniel|james|george|hemant|ravi|arjun|prabhat|madhur|amit/i.test(v.name || ""));
                    voiceStatus.textContent = exact
                        ? `${requested} is installed and will be used when SAPI speaks.`
                        : maleFallback
                            ? `${requested} is not installed; an available Microsoft male voice will be used.`
                            : `${requested} is not installed. Windows will use the closest available voice.`;
                }
            }

            // Update TTSEngine settings
            if (window.TTSEngine && window.TTSEngine._settings) {
                window.TTSEngine._settings.speed = s.speed || 0.95;
                window.TTSEngine._settings.languageMode = s.languageMode || "auto";
            }

        } catch (error) {
            console.warn("[TTS Settings] Status fetch failed:", error);
            setBadge("ERROR");
            setText("ttsRefStatus", "Error");
        }
    }

    // ==========================================
    // SAVE SETTINGS
    // ==========================================
    async function saveSettings(patch) {
        try {
            if (!window.jarvis?.voice?.xttsSettings) return;
            await window.jarvis.voice.xttsSettings(patch);
            console.log("[TTS Settings] Saved:", patch);
        } catch (error) {
            console.warn("[TTS Settings] Save failed:", error);
        }
    }

    // ==========================================
    // TEST VOICE
    // ==========================================
    async function testVoice() {
        const btn = $("ttsTestVoiceBtn");
        const lang = $("ttsLanguageSelect")?.value || "auto";

        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Generating...";
        }

        try {
            const selectedEngine = $("ttsEngineSelect")?.value || "edge";
            if (["edge", "sarvam", "elevenlabs", "indic-parler"].includes(selectedEngine)) {
                if (!window.VoiceEngine?.speak) throw new Error("JARVIS voice playback is unavailable");
                const result = await window.VoiceEngine.speak(selectedEngine === "sarvam" ? "This is the Sarvam online voice." : selectedEngine === "elevenlabs" ? "This is the ElevenLabs online voice." : selectedEngine === "indic-parler" ? "यह Indic Parler TTS की स्थानीय आवाज़ है।" : "This is the Microsoft Edge neural voice.");
                if (result?.success === false) throw new Error(result.error || "Voice test failed.");
                setBadge("READY");
                if (["sarvam", "elevenlabs"].includes(selectedEngine) && result?.fallbackReason) {
                    setText("ttsRefStatus", `${result.fallbackReason} Test audio used the next available voice.`);
                } else if (selectedEngine === "sarvam") setText("ttsRefStatus", "Sarvam TTS connected and test audio played.");
                else if (selectedEngine === "elevenlabs") setText("ttsRefStatus", "ElevenLabs TTS connected and test audio played.");
                if (selectedEngine === "indic-parler") setText("ttsRefStatus", "Indic Parler-TTS selected; local test audio played if the model is available.");
            } else if (selectedEngine === "sapi") {
                if (!window.jarvis?.voice?.speak) throw new Error("Windows voice playback is unavailable");
                const result = await window.jarvis.voice.speak(
                    "This is the selected Windows voice.",
                    { language: lang === "hi" ? "hi" : "en" }
                );
                if (!result || result.success === false) throw new Error(result?.error || "Voice test failed");
            } else {
                if (!window.jarvis?.voice?.xttsTest) throw new Error("XTTS voice preview is unavailable");
                const result = await window.jarvis.voice.xttsTest(lang);
                if (result && result.success && result.audioBase64) {
                    const audio = new Audio(`data:${result.mime || "audio/wav"};base64,${result.audioBase64}`);
                    audio.play().catch(e => console.warn("[TTS Settings] Test playback failed:", e));
                    console.log("[TTS Settings] Test voice played");
                } else {
                    console.warn("[TTS Settings] Test voice failed:", result?.error || "Unknown error");
                    if (btn) btn.textContent = "✗ Failed";
                    setTimeout(() => { if (btn) { btn.textContent = "▶ Test Voice"; } }, 2000);
                }
            }
        } catch (error) {
            console.error("[TTS Settings] Test error:", error);
            if (["sarvam", "edge", "elevenlabs", "indic-parler"].includes($("ttsEngineSelect")?.value)) {
                setBadge("API ERROR");
                if ($("ttsRefStatus")) $("ttsRefStatus").textContent = error?.message || "Speech API test failed.";
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "▶ Test Voice";
            }
        }
    }

    // ==========================================
    // INITIALIZE
    // ==========================================
    function init() {
        if (initialized) return;
        initialized = true;

        // Speed slider
        const slider = $("ttsSpeedSlider");
        const display = $("ttsSpeedValue");
        if (slider) {
            slider.addEventListener("input", () => {
                if (display) display.textContent = parseFloat(slider.value).toFixed(2);
            });
            slider.addEventListener("change", () => {
                saveSettings({ speed: parseFloat(slider.value) });
            });
        }

        // Language select
        const langSel = $("ttsLanguageSelect");
        if (langSel) {
            langSel.addEventListener("change", () => {
                saveSettings({ languageMode: langSel.value });
            });
        }

        const sapiVoiceSelect = $("ttsSapiVoiceSelect");
        if (sapiVoiceSelect) {
            sapiVoiceSelect.addEventListener("change", () => saveSettings({ sapiVoice: sapiVoiceSelect.value }));
        }

        const edgeVoiceSelect = $("ttsEdgeVoiceSelect");
        if (edgeVoiceSelect) edgeVoiceSelect.addEventListener("change", () => {
            if (edgeVoiceSelect.value === "grok-sarvam-voice") {
                const preset = window.jarvis?.aiProvider?.useGrokWithSarvamVoice?.();
                if (preset) preset.then((result) => {
                    if (result?.success === false) throw new Error(result.error || "Could not activate the Grok + Sarvam preset.");
                    setText("ttsEngineValue", "Sarvam Bulbul v3");
                    setText("ttsVoiceValue", "Sarvam STT/TTS · Grok replies");
                    setText("ttsRefStatus", "Grok answers selected · Sarvam microphone and voice output selected.");
                }).catch((error) => console.warn("[TTS Settings] Grok + Sarvam preset failed:", error));
            } else if (edgeVoiceSelect.value === "indic-parler") {
                saveSettings({ ttsEngine: "indic-parler", voiceProfile: "indic-parler" });
                const engineSelect = $("ttsEngineSelect");
                if (engineSelect) engineSelect.value = "indic-parler";
                setText("ttsEngineValue", ENGINE_LABELS["indic-parler"]);
                setText("ttsVoiceValue", "Indic Parler-TTS · Male offline Indian voice");
            } else if (edgeVoiceSelect.value === "nakul-reference") {
                saveSettings({ ttsEngine: "xtts", voiceProfile: "nakul-reference" });
                const engineSelect = $("ttsEngineSelect");
                if (engineSelect) engineSelect.value = "xtts";
                setText("ttsEngineValue", ENGINE_LABELS.xtts);
                setText("ttsVoiceValue", "Nakul की Voice");
            } else {
                saveSettings({ edgeVoice: edgeVoiceSelect.value, voiceProfile: "edge-auto" });
            }
        });

        const engineSelect = $("ttsEngineSelect");
        if (engineSelect) {
            engineSelect.addEventListener("change", () => {
                if (window.TTSEngine) window.TTSEngine._selectedEngine = engineSelect.value;
                saveSettings({ ttsEngine: engineSelect.value });
                setText("ttsEngineValue", ENGINE_LABELS[engineSelect.value] || ENGINE_LABELS.edge);
            });
        }

        const sttSelect = $("sttEngineSelect");
        if (sttSelect) sttSelect.addEventListener("change", () => {
            saveSettings({ sttEngine: sttSelect.value });
            const sttLabel = $("sttEngineLabel");
            const online = ["sarvam", "elevenlabs"].includes(sttSelect.value);
            if (sttLabel) {
                sttLabel.textContent = sttSelect.value === "elevenlabs" ? "🎙️ ElevenLabs Scribe v2 (online)" : online ? "🎙️ Sarvam Saaras v4 (online)" : "🎙️ Whisper (offline)";
                sttLabel.title = online ? "Microphone audio is sent to the selected speech API for transcription." : "Voice audio is transcribed locally by Whisper.";
            }
        });

        // Test voice button
        const testBtn = $("ttsTestVoiceBtn");
        if (testBtn) {
            testBtn.addEventListener("click", testVoice);
        }

        const saveSarvamKey = $("ttsSaveSarvamApiKey");
        if (saveSarvamKey) saveSarvamKey.addEventListener("click", async () => {
            const key = $("ttsSarvamApiKey")?.value?.trim() || "";
            if (!key) { setText("sarvamApiKeyStatus", "Paste a Sarvam API key first."); return; }
            saveSarvamKey.disabled = true;
            try {
                const result = await window.jarvis?.voice?.xttsSettings?.({ sarvamApiKey: key });
                if (result?.success === false) throw new Error(result.error || "Could not save the Sarvam key.");
                $("ttsSarvamApiKey").value = "";
                setText("sarvamApiKeyStatus", "Sarvam key saved securely in JARVIS.");
                await fetchStatus();
            } catch (error) { setText("sarvamApiKeyStatus", error.message || "Could not save the Sarvam key."); }
            finally { saveSarvamKey.disabled = false; }
        });

        const saveElevenLabsKey = $("ttsSaveElevenLabsApiKey");
        if (saveElevenLabsKey) saveElevenLabsKey.addEventListener("click", async () => {
            const key = $("ttsElevenLabsApiKey")?.value?.trim() || "";
            if (!key) { setText("elevenLabsApiKeyStatus", "Paste an ElevenLabs API key first."); return; }
            saveElevenLabsKey.disabled = true;
            try {
                const result = await window.jarvis?.voice?.xttsSettings?.({ elevenLabsApiKey: key });
                if (result?.success === false) throw new Error(result.error || "Could not save the ElevenLabs key.");
                $("ttsElevenLabsApiKey").value = "";
                setText("elevenLabsApiKeyStatus", "ElevenLabs key saved securely in JARVIS.");
                await fetchStatus();
            } catch (error) { setText("elevenLabsApiKeyStatus", error.message || "Could not save the ElevenLabs key."); }
            finally { saveElevenLabsKey.disabled = false; }
        });

        // Refresh status button
        const refreshBtn = $("ttsRefreshStatusBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", fetchStatus);
        }

        // Initial status fetch
        setTimeout(fetchStatus, 1000);

        // Start polling
        pollTimer = setInterval(fetchStatus, POLL_INTERVAL);

        console.log("[TTS Settings] Initialized (XTTS-v2 controller)");
    }

    // ==========================================
    // AUTO-INIT
    // ==========================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Expose for manual refresh
    window.JarvisTTSSettings = {
        refresh: fetchStatus,
        init,
        testVoice,
    };

})();
