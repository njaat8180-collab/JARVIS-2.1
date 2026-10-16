"use strict";

/**
 * JARVIS — OFFLINE STT VALIDATION (informational diagnostics)
 * scripts/test-stt.js
 * ------------------------------------------------------------
 * Validates, in order, using the SAME engine chain the app uses:
 *   1. voice_settings.json (VAD + engine mode)
 *   2. whisper.cpp runtime + GGML model (auto-downloads once if allowed)
 *   3. transcripts a WAV file if one is supplied as argv[2] (real
 *      end-to-end verification of Hindi/English/Hinglish audio)
 *
 * Usage:  node scripts/test-stt.js [path/to/audio.wav]
 * ------------------------------------------------------------
 */

const path = require("path");
const fs = require("fs");
const voiceSTT = require(path.join(__dirname, "..", "voiceSTT"));
const whisperProvider = require(path.join(__dirname, "..", "stt", "whisper", "provider"));

function ok(msg) { console.log(`  [OK] ${msg}`); }
function bad(msg, hint) { console.log(`  [FAIL] ${msg}` + (hint ? ` — ${hint}` : "")); }

async function main() {
    console.log("=== JARVIS offline STT validation ===\n");

    // ---- 1. VOICE SETTINGS ----
    console.log("[1] Voice settings");
    const settings = voiceSTT.getVoiceSettings();
    ok(`engine mode: ${settings.engine}`);
    ok(`VAD: silenceRms=${settings.silenceRmsThreshold}, minSamples=${settings.minAudioSamples}, trimSilence=${settings.trimSilence}`);
    console.log("");

    // ---- 2. WHISPER.CPP (offline engine) validation ----
    console.log("[2] whisper.cpp (offline engine) validation");
    try {
        const w = whisperProvider.getStatus();
        if (w.executable.found) {
            ok(`whisper.cpp runtime found (${w.executable.source}): ${w.executable.path}`);
        } else {
            bad("whisper.cpp runtime found", w.executable.autoDownloadSupported
                ? "will auto-download on first launch (or run: npm run setup:whisper)"
                : "install whisper.cpp and set whisperExecutable / WHISPER_CPP_PATH");
        }
        if (w.model.status === "READY") {
            ok(`model ${w.model.name} ready at ${w.model.path} (${Math.round(w.model.sizeBytes / 1048576)} MB)`);
        } else if (w.model.autoDownload) {
            console.log(`  [..] model ${w.model.name}: ${w.model.status} — downloading once…`);
            const model = await whisperProvider.ensureModel();
            if (model.ok) ok(`model ${w.model.name} downloaded to ${model.path}`);
            else bad("model download", model.error);
        } else {
            bad(`model ${w.model.name} ${w.model.status}`, "download manually into models/whisper/ or enable whisperAutoDownload");
        }
    } catch (e) {
        bad("whisper provider loads", e.message);
    }
    console.log("");

    // ---- 3. FULL STATUS ----
    console.log("[3] Combined engine status");
    const status = voiceSTT.getModelStatus();
    console.log(`  • engine: ${status.engine}, ready: ${status.ready}`);
    console.log(`  • whisper.cpp: exe=${status.whisper.executable.found}, model=${status.whisper.model.status} (${status.whisper.model.name})`);
    console.log(`  • whisper-js fallback: ready=${status.whisperJs.ready}, cached=${status.whisperJs.modelCached}`);
    console.log("");

    // ---- 4. REAL TRANSCRIPTION (optional, WAV path via argv) ----
    const wavPath = process.argv[2];
    if (wavPath && fs.existsSync(wavPath)) {
        console.log(`[4] Transcribing ${wavPath}`);
        const { execFileSync } = require("child_process");
        try {
            // Decode the WAV into Float32 samples the same way the renderer does.
            const buf = fs.readFileSync(wavPath);
            const parseWav = (b) => {
                // minimal RIFF/PCM 16-bit mono parser
                const numChannels = b.readUInt16LE(22);
                const sampleRate = b.readUInt32LE(24);
                const bits = b.readUInt16LE(34);
                let offset = 12;
                let dataLen = 0;
                while (offset + 8 <= b.length) {
                    const id = b.toString("ascii", offset, offset + 4);
                    const size = b.readUInt32LE(offset + 4);
                    if (id === "data") { dataLen = size; break; }
                    offset += 8 + size;
                }
                if (numChannels !== 1 || bits !== 16) {
                    throw new Error(`expected 16-bit mono WAV (got ${bits}-bit, ${numChannels}ch)`);
                }
                const n = Math.floor(dataLen / 2);
                const samples = new Float32Array(n);
                for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(offset + 8 + i * 2) / 32768;
                return { samples, sampleRate };
            };
            const { samples, sampleRate } = parseWav(buf);
            console.log(`  • ${samples.length / sampleRate}s @${sampleRate}Hz`);
            const result = await voiceSTT.transcribeSamples(samples, {});
            if (result.success) {
                ok(`transcript: "${result.text}"`);
                ok(`language: ${result.language}, engine: ${result.engine}, ${result.durationMs}ms`);
            } else {
                bad("transcription", result.error);
            }
        } catch (e) {
            bad(`transcribing ${wavPath}`, e.message);
        }
    } else {
        console.log("[4] (skipped — pass a 16-bit mono WAV path to test real transcription)");
    }
    console.log("");

    console.log("Validation complete.");
}

main().catch((e) => {
    console.error(`Validation crashed: ${e.message}`);
    process.exit(1);
});
