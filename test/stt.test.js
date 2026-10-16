"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stt = require("../voiceSTT");

test("STT session lifecycle prevents duplicate starts", async () => {
    assert.deepEqual(stt.startListening(), { started: true });
    assert.equal(stt.startListening().started, false);
    assert.equal(stt.isCurrentlyListening(), true);

    const empty = await stt.transcribeSamples(new Float32Array());
    assert.deepEqual(empty, {
        success: false,
        error: "Audio recording is too short."
    });

    const stopped = await stt.stopListeningAndTranscribe();
    assert.equal(stopped.success, false);
    assert.equal(stt.isCurrentlyListening(), false);
});

test("STT rejects unsupported audio input explicitly", async () => {
    await assert.rejects(
        stt.transcribeSamples("not audio"),
        /Audio samples must be a Float32Array or number array/
    );
});

test("STT language tag normalizer accepts browser locale tags", () => {
    assert.equal(stt.normalizeLanguageTag("en-IN"), "en");
    assert.equal(stt.normalizeLanguageTag("hi-IN"), "hi");
    assert.equal(stt.normalizeLanguageTag("ur_PK"), "ur");
    assert.equal(stt.normalizeLanguageTag(""), undefined);
});

test("STT sanitizes invalid and out-of-range samples", () => {
    const samples = stt.sanitizeSamples([
        -2,
        -0.5,
        0,
        0.5,
        2,
        NaN,
        Infinity
    ]);

    assert.deepEqual(Array.from(samples), [
        -1,
        -0.5,
        0,
        0.5,
        1,
        0,
        0
    ]);
});

test("STT detects silence before loading the Whisper engine", async () => {
    const samples = new Float32Array(16000);
    const result = await stt.transcribeSamples(samples, { language: "en-IN" });

    assert.deepEqual(result, {
        success: false,
        error: "No speech detected."
    });
    assert.equal(stt.isCurrentlyListening(), false);
});

test("STT accepts Hindi, English and Hinglish text", () => {
    assert.equal(stt.isSupportedLanguageText("open chrome and search the weather"), true);
    assert.equal(stt.isSupportedLanguageText("मुझे कल का मौसम बताओ"), true);
    assert.equal(stt.isSupportedLanguageText("jarvis mujhe kya mausam batao today"), true);
    assert.equal(stt.isSupportedLanguageText("मुझे 2 बजे की alarm set kar do, please!"), true);
    assert.equal(stt.isSupportedLanguageText(""), true);
});

test("STT rejects languages other than Hindi/English/Hinglish", () => {
    // Chinese, Russian, Arabic, Bengali, Tamil — all must be rejected
    assert.equal(stt.isSupportedLanguageText("对我做了介绍那么我想说的是"), false);
    assert.equal(stt.isSupportedLanguageText("Привет, как дела у тебя"), false);
    assert.equal(stt.isSupportedLanguageText("مرحبا كيف حالك اليوم"), false);
    assert.equal(stt.isSupportedLanguageText("আমি ভালো আছি ধন্যবাদ"), false);
    assert.equal(stt.isSupportedLanguageText("நான் நல்லா இருக்கிறேன்"), false);
});
