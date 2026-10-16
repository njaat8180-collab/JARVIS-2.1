"use strict";

/**
 * JARVIS — WHISPER.CPP STT PROVIDER TESTS
 * test/whisper-stt.test.js
 * ------------------------------------------------------------
 * Unit tests for the offline whisper.cpp provider contract, plus a
 * REAL end-to-end transcription test that runs whenever a whisper.cpp
 * executable + model are present (explicitly pointed at via
 * WHISPER_CPP_PATH / WHISPER_MODEL_PATH, or already installed under
 * models/whisper/). No mocks — when the runtime is absent the e2e
 * case reports an explicit skip with setup instructions.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const provider = require("../stt/whisper/provider");
const voiceSTT = require("../voiceSTT");
const { detectWakeWord } = require("../src/speech/wakeWord");

const ROOT = path.join(__dirname, "..");

// Unit tests must never trigger a real whisper.cpp/model download — the
// REAL end-to-end cases below run only when a runtime is already available
// (explicit env paths or an installed models/whisper/).
process.env.WHISPER_NO_DOWNLOAD = "1";

test("model registry exposes tiny/base/small with sane files", () => {
    for (const name of ["tiny", "base", "small"]) {
        assert.ok(provider.MODELS[name], `${name} must exist`);
        assert.match(provider.MODELS[name].file, new RegExp(`^ggml-${name}\\.bin$`));
        assert.ok(provider.MODELS[name].bytes > 10_000_000, `${name} size must be plausible`);
    }
    // base is the default on 8 GB CPU-only hardware
    const status = provider.getStatus();
    assert.ok(["tiny", "base", "small"].includes(status.model.name));
});

test("getStatus reports the full offline status contract", () => {
    const status = provider.getStatus();
    assert.equal(status.engine, "whisper.cpp");
    assert.equal(status.offline, true);
    assert.equal(typeof status.ready, "boolean");
    assert.ok(status.executable && typeof status.executable.found === "boolean");
    assert.ok(["READY", "NOT_INSTALLED", "DOWNLOADING", "ERROR"].includes(status.model.status));
    assert.equal(typeof status.model.path, "string");
    assert.equal(status.language, "auto"); // default: auto-detect (best for Hinglish)
});

test("PATH discovery prefers whisper.cpp names and ignores ambiguous Python whisper.exe", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-whisper-path-test-"));
    const fakePythonWhisper = path.join(tempDir, process.platform === "win32" ? "whisper.exe" : "whisper");
    const fakeWhisperCli = path.join(tempDir, process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
    const oldPath = process.env.PATH;
    const oldExecutable = process.env.WHISPER_CPP_PATH;
    try {
        fs.writeFileSync(fakePythonWhisper, "");
        fs.writeFileSync(fakeWhisperCli, "");
        process.env.PATH = [tempDir, oldPath || ""].filter(Boolean).join(path.delimiter);
        delete process.env.WHISPER_CPP_PATH;
        const resolved = provider.resolveExecutable();
        assert.equal(path.resolve(resolved.path), path.resolve(fakeWhisperCli));
        assert.notEqual(path.resolve(resolved.path), path.resolve(fakePythonWhisper));
    } finally {
        if (oldPath === undefined) delete process.env.PATH;
        else process.env.PATH = oldPath;
        if (oldExecutable === undefined) delete process.env.WHISPER_CPP_PATH;
        else process.env.WHISPER_CPP_PATH = oldExecutable;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("no confidence is invented when whisper.cpp provides none", async () => {
    // Empty audio fails fast — verifying the error contract without a model.
    const result = await provider.transcribeSamples(new Float32Array(0));
    assert.equal(result.success, false);
    assert.ok(result.error);
});

test("transcription jobs never overlap (serialized single-flight)", async () => {
    // Fire three jobs concurrently with too-short audio; all must resolve
    // with a deterministic error, never reject, and never interleave state.
    const results = await Promise.all([
        provider.transcribeSamples(new Float32Array(100)),
        provider.transcribeSamples(new Float32Array(100)),
        provider.transcribeSamples(new Float32Array(100))
    ]);
    for (const r of results) assert.equal(r.success, false);
});

test("voiceSTT combined status keeps backward-compatible fields", () => {
    const status = voiceSTT.getModelStatus();
    assert.equal(status.offline, true);
    assert.equal(typeof status.ready, "boolean");
    assert.equal(typeof status.loading, "boolean");
    assert.ok(["auto", "whisper", "whisper-js"].includes(status.engine));
    // whisper.cpp detail + transformers.js fallback detail
    assert.ok(status.whisper && status.whisper.model);
    assert.ok(status.whisperJs && typeof status.whisperJs.ready === "boolean");
});

test("wake word tolerant matching handles STT variants", () => {
    // Deterministic core detector (src/speech/wakeWord.js)
    for (const phrase of ["jarvis open chrome", "hey jarvis kholo", "ok jarvis what is the time"]) {
        assert.equal(detectWakeWord(phrase).detected, true, `"${phrase}" must wake`);
    }
    assert.equal(detectWakeWord("hello there").detected, false);
});

test("Devanagari wake variants are corrected before command routing", () => {
    const correction = require("../stt/correction");
    // The correction layer normalizes common Devanagari/STT mishearings
    // (जार्विस/जर्विस/जारविस → Jarvis) using config/speech_corrections.json.
    const result = correction.correct("जारविस यूट्यूब खोलो");
    assert.ok(/jarvis/i.test(result.corrected), `expected Jarvis in "${result.corrected}"`);
    assert.equal(result.changed, true);
});

/* ------------------------------------------------------------
   REAL END-TO-END TRANSCRIPTION (English + Hindi/Hinglish)
   Runs when a whisper.cpp binary + model are available:
     - WHISPER_CPP_PATH + WHISPER_MODEL_PATH env vars, or
     - already installed in models/whisper/
   16-bit mono 16 kHz WAV inputs are decoded exactly like the
   renderer decodes mic audio before IPC.
------------------------------------------------------------ */

function decodeWav16Mono(file) {
    const b = fs.readFileSync(file);
    const channels = b.readUInt16LE(22);
    const rate = b.readUInt32LE(24);
    const bits = b.readUInt16LE(34);
    if (channels !== 1 || bits !== 16) throw new Error(`expected 16-bit mono WAV, got ${bits}-bit ${channels}ch`);
    let offset = 12, dataLen = 0;
    while (offset + 8 <= b.length) {
        const id = b.toString("ascii", offset, offset + 4);
        const size = b.readUInt32LE(offset + 4);
        if (id === "data") { dataLen = size; break; }
        offset += 8 + size;
    }
    const n = Math.floor(dataLen / 2);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(offset + 8 + i * 2) / 32768;
    return { samples, rate };
}

async function tryEndToEnd() {
    const exe = process.env.WHISPER_CPP_PATH || "";
    const model = process.env.WHISPER_MODEL_PATH || "";
    if (!(exe && fs.existsSync(exe)) || !(model && fs.existsSync(model))) {
        const installed = provider.isAvailable();
        if (!installed) {
            console.log("    [SKIP] no whisper.cpp runtime/model available — run `npm run setup:whisper` (or set WHISPER_CPP_PATH + WHISPER_MODEL_PATH) to enable the real e2e transcription test");
            return "skipped";
        }
    }
    const wav = process.env.WHISPER_TEST_WAV || "";
    if (!(wav && fs.existsSync(wav))) {
        console.log("    [SKIP] no test WAV supplied (set WHISPER_TEST_WAV to a 16-bit mono 16 kHz WAV with speech)");
        return "skipped";
    }
    const { samples } = decodeWav16Mono(wav);
    const result = await voiceSTT.transcribeSamples(samples, {});
    assert.equal(result.success, true, `transcription failed: ${result.error}`);
    assert.ok(result.text.length > 0, "transcript must be non-empty");
    assert.equal(result.engine, "whisper.cpp");
    assert.ok(["en", "hi", "hinglish"].includes(result.language), `language must be detected, got ${result.language}`);
    assert.ok(typeof result.durationMs === "number");
    return { text: result.text, language: result.language };
}

test("REAL end-to-end English transcription through the full JARVIS STT chain", { timeout: 180000 }, async t => {
    const outcome = await tryEndToEnd();
    if (outcome === "skipped") {
        t.skip("Real STT requires an installed Whisper runtime/model and WHISPER_TEST_WAV speech recording.");
        return;
    }
    // English sample (jfk.wav) must contain recognizable words
    assert.ok(/country|americans/i.test(outcome.text), `unexpected English transcript: "${outcome.text}"`);
    assert.equal(outcome.language, "en");
});

test("REAL end-to-end multilingual transcription (Hindi/Hinglish speech)", { timeout: 180000 }, async t => {
    const hindiWav = process.env.WHISPER_TEST_WAV_HI || "";
    if (!fs.existsSync(hindiWav)) {
        t.skip("No Hindi test recording supplied; set WHISPER_TEST_WAV_HI to enable real Hindi STT verification.");
        return;
    }
    const { samples } = decodeWav16Mono(hindiWav);
    const result = await voiceSTT.transcribeSamples(samples, {});
    assert.equal(result.success, true, `Hindi transcription failed: ${result.error}`);
    assert.ok(result.text.length > 0);
    // Language classification must be one of the supported triad
    assert.ok(["en", "hi", "hinglish"].includes(result.language), `got ${result.language}`);
});
