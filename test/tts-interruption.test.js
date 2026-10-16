"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createEngine(speak) {
    let stopped = 0;
    const sandbox = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        document: { getElementById() { return null; } },
        setTimeout,
        window: { jarvis: { voice: { speak, stopSpeaking() { stopped++; return Promise.resolve(); } } } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/tts.js"), "utf8"), sandbox);
    const engine = sandbox.window.TTSEngine;
    const played = [];
    engine._playAudio = async audio => { played.push(audio); return { success: true }; };
    return { engine, played, stopped: () => stopped };
}

test("Stop while synthesis is pending prevents late audio and releases the speech queue", async () => {
    let finishOldRequest;
    const { engine, played, stopped } = createEngine(text => text === "Old reply"
        ? new Promise(resolve => { finishOldRequest = resolve; })
        : Promise.resolve({ success: true, audioBase64: "new-audio" }));
    const first = engine.speak("Old reply");
    const queued = engine.speak("Queued old reply");
    engine.stop();
    assert.equal((await first).stopped, true);
    assert.equal((await queued).stopped, true);
    assert.equal(stopped(), 1);
    assert.equal(engine.isBusy(), false);
    assert.equal((await engine.speak("New reply")).success, true);
    finishOldRequest({ success: true, audioBase64: "stale-audio" });
    await Promise.resolve();
    assert.deepEqual(played, ["new-audio"]);
});

test("Stop while idle does not discard the next response", async () => {
    const { engine, played } = createEngine(async () => ({ success: true, audioBase64: "reply" }));
    engine.stop();
    assert.equal((await engine.speak("Hello")).success, true);
    assert.deepEqual(played, ["reply"]);
});

test("Interrupt-and-speak can replace the same text while its old synthesis is pending", async () => {
    let calls = 0;
    const { engine, played, stopped } = createEngine(() => ++calls === 1
        ? new Promise(() => {})
        : Promise.resolve({ success: true, audioBase64: "replacement" }));
    const old = engine.speak("Same response");
    const replacement = engine.interruptAndSpeak("Same response");
    assert.equal((await old).stopped, true);
    assert.equal((await replacement).success, true);
    assert.equal(stopped(), 1);
    assert.deepEqual(played, ["replacement"]);
});

test("A provider cancellation is not treated as successful direct playback", async () => {
    const { engine, played } = createEngine(async () => ({ success: true, stopped: true }));
    const result = await engine.speak("Do not play this");
    assert.equal(result.success, false);
    assert.equal(result.stopped, true);
    assert.deepEqual(played, []);
});

test("Stop during audio playback pauses output, releases the queue and revokes its URL", async () => {
    let paused = 0;
    let revoked = 0;
    let armed = 0;
    let played = 0;
    let reference = null;
    let finishedReference = null;
    const sandbox = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        document: { getElementById() { return null; } },
        setTimeout, Blob, atob,
        URL: { createObjectURL: () => "blob:tts", revokeObjectURL() { revoked++; } },
        Audio: class { play() { assert.ok(reference); played++; return Promise.resolve(); } pause() { paused++; } },
        window: {
            VoiceEngine: {
                pauseForSpeech() { armed++; },
                async prepareTTSEchoReference(bytes, audio) { assert.equal(bytes.length, 5); return { audio }; },
                setTTSEchoReference(value) { reference = value; },
                finishTTSEchoReference(audio) { finishedReference = audio; }
            },
            jarvis: { voice: {
                speak: async () => ({ success: true, audioBase64: "YXVkaW8=", mime: "audio/mpeg" }),
                stopSpeaking: async () => {}
            } }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/tts.js"), "utf8"), sandbox);
    const engine = sandbox.window.TTSEngine;
    const result = engine.speak("Long reply");
    for (let i = 0; i < 10 && !played; i++) await Promise.resolve();
    assert.equal(played, 1);
    assert.ok(engine.currentAudio);
    assert.equal(sandbox.window.isSpeaking, true);
    assert.ok(armed >= 2);
    engine.stop();
    assert.equal((await result).stopped, true);
    assert.equal(paused, 1);
    assert.equal(revoked, 1);
    assert.equal(engine.currentAudio, null);
    assert.equal(engine.isBusy(), false);
    assert.equal(finishedReference, reference.audio);
});

test("Stop during echo reference decoding prevents delayed playback and reference installation", async () => {
    let finishDecode;
    let played = 0;
    let installed = 0;
    const sandbox = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        document: { getElementById() { return null; } }, setTimeout, Blob, atob,
        URL: { createObjectURL: () => "blob:tts", revokeObjectURL() {} },
        Audio: class { play() { played++; return Promise.resolve(); } pause() {} },
        window: {
            VoiceEngine: {
                prepareTTSEchoReference() { return new Promise(resolve => { finishDecode = resolve; }); },
                setTTSEchoReference() { installed++; }
            },
            jarvis: { voice: { stopSpeaking: async () => {} } }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../renderer/js/tts.js"), "utf8"), sandbox);
    const engine = sandbox.window.TTSEngine;
    const playback = engine._playAudio("YXVkaW8=", "audio/mpeg", "en", "english");
    engine.stop();
    assert.equal((await playback).stopped, true);
    finishDecode({ samples: new Float32Array(1) });
    await Promise.resolve();
    assert.equal(played, 0);
    assert.equal(installed, 0);
});
