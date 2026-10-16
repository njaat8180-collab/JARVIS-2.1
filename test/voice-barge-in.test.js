"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
    let stopped = 0;
    let constraints;
    let now = 10000;
    const timers = [];
    const track = { stop() { stopped++; } };
    const node = () => ({ connect() {}, disconnect() {} });
    class AudioContext {
        constructor() { this.sampleRate = 16000; this.destination = {}; }
        async resume() {}
        async close() {}
        createMediaStreamSource() { return node(); }
        createScriptProcessor() { return node(); }
        createGain() { return { ...node(), gain: {} }; }
    }
    const window = {
        AudioContext, addEventListener() {},
        jarvis: { voice: { start() {}, transcribe: async () => ({ success: true, text: "Stop and help me" }) } }
    };
    const sandbox = {
        Date: class extends Date { static now() { return now; } },
        window, navigator: { mediaDevices: { getUserMedia: async options => { constraints = options; return { getTracks: () => [track] }; } } },
        document: { readyState: "loading", getElementById() { return null; } },
        console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/voice.js"), "utf8"), sandbox);
    const voice = window.VoiceEngine;
    voice.updateStatus = voice.setOrb = voice.syncCoreState = () => {};
    const frame = amplitude => { now += 128; voice.capture.processor.onaudioprocess({
        inputBuffer: { sampleRate: 16000, getChannelData: () => typeof amplitude === "number" ? new Float32Array(2048).fill(amplitude) : amplitude }
    }); };
    return { voice, window, frame, timers, advance: ms => { now += ms; }, stopped: () => stopped, constraints: () => constraints };
}

async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function echoFixture(voice) {
    const samples = Float32Array.from({ length: 32000 }, (_, i) =>
        0.1 * Math.sin(0.06 * i + 0.000008 * i * i) + 0.06 * Math.sin(0.25 * i));
    const audio = { paused: false, currentTime: 0 };
    voice.setTTSEchoReference({ samples, sampleRate: 16000, audio, endedAt: null });
    return { audio, samples, mixed(offset, userAmplitude = 0, gain = 0.7) {
        // A non-grid-aligned delay exercises both coarse and refined search.
        audio.currentTime = (offset + 2048 + 1733) / 16000;
        return Float32Array.from({ length: 2048 }, (_, i) =>
            gain * samples[offset + i] + userAmplitude * Math.sin(0.39 * (offset + i)));
    } };
}

test("Microphone requests Chromium echo cancellation, suppression and AGC", async () => {
    const env = setup();
    await env.voice.startListening();
    assert.equal(env.constraints().audio.echoCancellation, true);
    assert.equal(env.constraints().audio.noiseSuppression, true);
    assert.equal(env.constraints().audio.autoGainControl, true);
});

test("Disabled duplex keeps capture open but does not transcribe playback", async () => {
    const env = setup();
    env.window.jarvis.voice.getDuplexConfig = async () => ({ enabled: false });
    let calls = 0;
    env.window.jarvis.voice.transcribe = async () => { calls++; };
    await env.voice.startListening();
    env.voice.beginSpeechOutput("This is playback");
    env.voice.isSpeaking = true;
    env.advance(1000);
    for (let i = 0; i < 20; i++) env.frame(.1);
    await settle();
    assert.equal(calls, 0);
    assert.equal(env.stopped(), 0);
    assert.equal(env.voice.capture.chunks.length, 0);
});

test("Timed-out verification cannot start overlapping STT requests", async () => {
    const env = setup();
    let calls = 0, release;
    env.window.jarvis.voice.transcribe = () => { calls++; return new Promise(resolve => { release = resolve; }); };
    await env.voice.startListening();
    env.voice.beginSpeechOutput("This is playback");
    env.advance(1000);
    const pending = env.voice.verifyBargeIn(env.voice.capture, 16000);
    await settle();
    env.timers.at(-1)();
    await pending;
    await env.voice.verifyBargeIn(env.voice.capture, 16000);
    assert.equal(calls, 1);
    release({ success: false });
    await settle();
    assert.equal(env.voice._bargeInRequestPending, false);
});

test("Loud delayed self-voice never interrupts TTS or enters the transcription buffer", async () => {
    const { voice, window, frame, advance } = setup();
    await voice.startListening();
    voice.beginSpeechOutput("The weather is pleasant today");
    advance(900);
    const fixture = echoFixture(voice);
    let interruptions = 0;
    window.isSpeaking = true;
    window.TTSEngine = { stop() { interruptions++; } };
    for (let i = 0; i < 8; i++) frame(fixture.mixed(1503 + 2048 * i, 0, i % 2 ? 0.5 : 0.9));
    assert.equal(interruptions, 0);
    assert.equal(voice.capture.chunks.length, 0);
    assert.equal(voice.capture.hasSpeech, false);
});

test("User speech mixed with loud TTS interrupts and retained PCM contains the user residual", async () => {
    const { voice, window, frame, advance } = setup();
    await voice.startListening();
    voice.beginSpeechOutput("The weather is pleasant today");
    advance(900);
    const fixture = echoFixture(voice);
    let interruptions = 0;
    window.isSpeaking = true;
    window.TTSEngine = { stop() { interruptions++; window.isSpeaking = false; } };
    for (let i = 0; i < 8; i++) frame(fixture.mixed(1503 + 2048 * i, 0.04));
    assert.equal(interruptions, 0);
    await settle();
    assert.equal(interruptions, 1);
    assert.equal(voice.capture.bargedIn, true);
    const clean = voice.capture.chunks[0];
    let error = 0;
    for (let i = 0; i < clean.length; i++) error += (clean[i] - 0.04 * Math.sin(0.39 * (1503 + i))) ** 2;
    assert.ok(Math.sqrt(error / clean.length) < 0.001);
});

test("Echo tail is removed after output stops, and expired references leave unrelated speech intact", () => {
    const { voice } = setup();
    const fixture = echoFixture(voice);
    const echo = fixture.mixed(1503);
    fixture.audio.paused = true;
    voice.finishTTSEchoReference(fixture.audio);
    const clean = voice.removeTTSEcho(echo, 16000);
    assert.ok(clean.every(value => Math.abs(value) < 0.001));
    voice._ttsEchoReference.endedAt -= 1000;
    assert.equal(voice.removeTTSEcho(echo, 16000), echo);
    assert.equal(voice._ttsEchoReference, null);
});

test("Uncorrelated user speech passes through while a TTS reference exists", () => {
    const { voice } = setup();
    const fixture = echoFixture(voice);
    fixture.audio.currentTime = 0.5;
    const input = Float32Array.from({ length: 2048 }, (_, i) => 0.04 * Math.sin(i * 0.39));
    assert.equal(voice.removeTTSEcho(input, 16000), input);
});

test("Multiple speaker reflection paths are suppressed without muting capture", async () => {
    const { voice, window, frame, stopped, advance } = setup();
    await voice.startListening();
    voice.beginSpeechOutput("The weather is pleasant today");
    advance(900);
    const fixture = echoFixture(voice);
    let interruptions = 0;
    window.isSpeaking = true;
    window.TTSEngine = { stop() { interruptions++; } };
    for (let offset = 2503; offset < 10000; offset += 2048) {
        const input = fixture.mixed(offset, 0, 0.8);
        for (let i = 0; i < input.length; i++) input[i] += 0.45 * fixture.samples[offset + i - 341];
        frame(input);
    }
    assert.equal(interruptions, 0);
    assert.equal(stopped(), 0);
    assert.equal(voice.capture.chunks.length, 0);
});

test("Playback reference decode averages stereo channels at the capture rate and fails safely", async () => {
    const { voice, window } = setup();
    window.OfflineAudioContext = class {
        constructor(channels, length, rate) { assert.equal(rate, 16000); }
        async decodeAudioData(buffer) {
            assert.equal(buffer.byteLength, 2);
            return { length: 2, numberOfChannels: 2, sampleRate: 16000,
                getChannelData: channel => channel ? new Float32Array([0.1, 0.3]) : new Float32Array([0.3, 0.1]) };
        }
    };
    const audio = {};
    const reference = await voice.prepareTTSEchoReference(new Uint8Array([1, 2, 3, 4]).subarray(1, 3), audio);
    assert.equal(reference.audio, audio);
    assert.equal(reference.sampleRate, 16000);
    assert.ok(reference.samples.every(value => Math.abs(value - 0.2) < 0.00001));
    window.OfflineAudioContext = class { async decodeAudioData() { throw new Error("unsupported format"); } };
    assert.equal(await voice.prepareTTSEchoReference(new Uint8Array([1]), audio), null);
});

test("TTS hand-off keeps the mic open and continuous restart works while speaking", async () => {
    const { voice, timers, stopped } = setup();
    voice.autoListen = true;
    await voice.startListening();
    const capture = voice.capture;
    voice.isSpeaking = true;
    voice.pauseForSpeech();
    assert.equal(voice.capture, capture);
    assert.equal(stopped(), 0);
    voice.resumeAfterSpeech();
    assert.equal(voice.capture, capture);
    voice.isListening = false;
    let starts = 0;
    voice.startListening = async () => { starts++; };
    voice.maybeRestartListening();
    timers.at(-1)();
    assert.equal(starts, 1);
});

test("Sustained speech interrupts pending synthesis and preserves opening PCM through transcription", async () => {
    const { voice, window, frame, stopped, advance } = setup();
    await voice.startListening();
    voice.beginSpeechOutput("The weather is pleasant today");
    advance(900);
    let interrupts = 0;
    window.TTSEngine = { isBusy: () => interrupts === 0, stop() { interrupts++; } };
    frame(0.001);
    frame(0.03);
    assert.equal(interrupts, 0);
    for (let i = 0; i < 7; i++) frame(0.03);
    assert.equal(interrupts, 0);
    await settle();
    assert.equal(interrupts, 1);
    const cap = voice.capture;
    assert.equal(cap.chunks.length, 8);
    voice.resumeAfterSpeech();
    assert.equal(voice._ignoreMicUntil, 0);
    let samples;
    window.jarvis.voice.transcribe = async pcm => { samples = pcm; return { success: true, text: "Help me" }; };
    let transcript;
    voice.handleNativeTranscript = text => { transcript = text; };
    frame(0.03);
    frame(0.03);
    for (let i = 0; i < 4; i++) frame(0);
    await voice._captureStopPromise;
    assert.equal(interrupts, 1);
    assert.equal(stopped(), 1);
    assert.equal(transcript, "Help me");
    assert.ok(samples.length >= 4096);
    assert.ok(Math.abs(samples[0] - 0.03) < 0.00001);
});

test("Low residual echo and isolated noise do not interrupt or reach Whisper", async () => {
    const { voice, window, frame } = setup();
    await voice.startListening();
    let interrupts = 0;
    window.isSpeaking = true;
    window.TTSEngine = { stop() { interrupts++; } };
    for (let i = 0; i < 20; i++) frame(0.006);
    frame(0.03);
    frame(0.001);
    assert.equal(interrupts, 0);
    assert.equal(voice.capture.chunks.length, 0);
    assert.equal(voice.capture.hasSpeech, false);
    window.isSpeaking = false;
    frame(0.006);
    assert.equal(voice.capture.chunks.length, 0);
});

test("Muted or manual mode never opens a mic merely because TTS starts", () => {
    const { voice } = setup();
    let starts = 0;
    voice.startListening = () => { starts++; };
    voice.pauseForSpeech();
    voice.autoListen = true;
    voice.muted = true;
    voice.pauseForSpeech();
    assert.equal(starts, 0);
});

test('raw app dictation bypasses browser interception even when speech normalization changes it', async () => {
    const {voice,window}=setup();
    voice.showUserMessage=()=>{};
    vm.runInNewContext(fs.readFileSync('renderer/js/brain/naturalCommandEngine.js','utf8'),{window,console});
    const calls=[];
    window.JARVISVoiceTolerance={process:()=>({canonical:'open notepad and type different words',lang:'en'})};
    window.BrowserVoiceControl={handle:()=>{throw Error('Local command reached browser');}};
    window.ChatEngineInstance={send:async(text,options)=>{calls.push({text,options});return {handled:true,response:'ok'};}};
    const command='Open Notepad and type Hello World';
    await voice.sendToChat(command);
    assert.equal(calls.length,1);
    assert.equal(calls[0].text,command);
    assert.equal(calls[0].options.spokenText,command);
});
