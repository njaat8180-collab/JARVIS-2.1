"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const stt = require("../voiceSTT");
const { detectWakeWord } = require("../src/speech/wakeWord");
const { VoiceStateMachine } = require("../src/speech/voiceStateMachine");

test("Phase 9 STT is local-only (offline whisper.cpp engine chain)", () => {
    const status = stt.getModelStatus();
    assert.equal(status.offline, true);
    assert.equal(typeof status.ready, "boolean");
    // Engine modes (config/voice_settings.json -> "engine"):
    //   "auto"        whisper.cpp (local subprocess, offline) first, local
    //                 transformers.js Whisper fallback
    //   "whisper"     whisper.cpp only — no fallback
    //   "whisper-js"   local Whisper (transformers.js, in-process) only —
    //                 one-time model download from HuggingFace, then
    //                 fully offline.
    // (Legacy values "vosk" / "sravaani" are treated as "auto".)
    assert.ok(
        status.engine === "auto" ||
        status.engine === "whisper" ||
        status.engine === "whisper-js",
        `unexpected engine: ${status.engine}`
    );
});

test("missing local STT is reported honestly as runtime blocked", async () => {
    const samples = new Float32Array(16000);
    samples[8000] = 0.5;
    const result = await stt.transcribeSamples(samples, { language: "en-IN" });
    assert.equal(result.success, false);
    // Either the VAD honestly rejects near-silence, or an engine error is
    // reported with a meaningful message (Vosk/Whisper/network/module).
    assert.match(
        result.error,
        /No speech detected|too short|STT|Vosk|Whisper|module|fetch|network/i
    );
});

test("wake-word detector is deterministic", () => {
    assert.deepEqual(detectWakeWord("hey jarvis open chrome"), {
        detected: true, phrase: "hey jarvis", remainder: "open chrome"
    });
    assert.equal(detectWakeWord("hello there").detected, false);
});

test("voice state machine rejects invalid transitions", () => {
    const machine = new VoiceStateMachine();
    assert.equal(machine.transition("listening"), "listening");
    assert.equal(machine.transition("processing"), "processing");
    assert.throws(() => machine.transition("wake_detected"), /Invalid voice transition/);
});

test("renderer voice code contains no browser SpeechRecognition fallback", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "voice.js"), "utf8");
    assert.match(source, /const SpeechRecognition = null/);
});

test("ambient wake-word capture uses only the local Whisper bridge", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "renderer", "js", "wakeWord.js"), "utf8");
    assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
    assert.match(source, /window\.jarvis\.voice\.transcribe/);
    assert.match(source, /_resample\(captured, sampleRate, 16000\)/);
    const executable = source.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(executable, /webkitSpeechRecognition|SpeechRecognition/);
});


test("Phase 9 has no network speech dependency in package or voice IPC", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    assert.equal(deps.includes("msedge-tts"), false);
    assert.equal(deps.includes("openai"), false);

    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert.doesNotMatch(main, /voice:speak-edge|msedge-tts/i);
    assert.doesNotMatch(preload, /voice:speak-edge|msedge-tts/i);
});

test("Phase 9 local TTS sends speech text as stdin and does not interpolate it into PowerShell", () => {
    const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    assert.match(main, /System\.Speech\.Synthesis\.SpeechSynthesizer/);
    assert.match(main, /child\.stdin\.write\(value \+ "\\n"\)/);
    assert.doesNotMatch(main, /-Command["'][^\\n]*value/);
});
