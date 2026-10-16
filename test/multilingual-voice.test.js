"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stt = require("../src/speech/stt");

test("detectLanguage classifies English, Hindi, Hinglish", () => {
    assert.equal(stt.detectLanguage("open YouTube"), "en");
    assert.equal(stt.detectLanguage("What is the weather in Delhi?"), "en");
    assert.equal(stt.detectLanguage("जार्विस यूट्यूब खोलो"), "hi");
    assert.equal(stt.detectLanguage("दिल्ली का मौसम बताओ"), "hi");
    assert.equal(stt.detectLanguage("Jarvis YouTube kholo"), "hinglish");
    assert.equal(stt.detectLanguage("Google par Minecraft search karo"), "hinglish");
    assert.equal(stt.detectLanguage("YouTube open karo"), "hinglish");
    assert.equal(stt.detectLanguage("Jarvis Delhi का weather बताओ"), "hinglish");
});

test("detectLanguage does not misclassify pure English", () => {
    // "hi" / "to" / "do" are English words too — must stay English.
    assert.equal(stt.detectLanguage("Hi Jarvis, do you know the time?"), "en");
    assert.equal(stt.detectLanguage("Tell me the current temperature"), "en");
    assert.equal(stt.detectLanguage("Play music"), "en");
});

test("getSTTLanguageCode maps detected languages to forced STT hints", () => {
    assert.equal(stt.getSTTLanguageCode("hi"), "hi");
    assert.equal(stt.getSTTLanguageCode("en"), "en");
    // Hinglish maps to auto (undefined) — Whisper's multilingual model
    // handles mixed Hindi+English speech best with auto-detection.
    assert.equal(stt.getSTTLanguageCode("hinglish"), undefined);
    assert.equal(stt.getSTTLanguageCode("unknown"), undefined);
});

test("BrowserVoiceControl.parse handles EN / HI / Hinglish commands", () => {
    // Minimal window mock so the renderer module loads under node:test.
    global.window = global;
    global.window.BrowserUI = null;
    global.window.jarvis = { browser: {} };
    delete require.cache[require.resolve("../renderer/js/browserVoiceControl.js")];
    require("../renderer/js/browserVoiceControl.js");
    const B = global.window.BrowserVoiceControl;

    assert.equal(B.parse("open YouTube").action, "open");
    assert.equal(B.parse("YouTube kholo").action, "open");
    assert.equal(B.parse("YouTube खोलो").action, "open");
    assert.equal(B.parse("जार्विस यूट्यूब खोलो").action, "open");
    assert.equal(B.parse("Google par Minecraft search karo").action, "search");
    assert.equal(B.parse("latest AI news search karo").action, "search");
    assert.equal(B.parse("new tab").action, "new-tab");
    assert.equal(B.parse("नया टैब").action, "new-tab");
    assert.equal(B.parse("go back").action, "back");
    assert.equal(B.parse("वापस जाओ").action, "back");
    assert.equal(B.parse("reload").action, "reload");
    assert.equal(B.parse("ताज़ा करो").action, "reload");

    // English proper nouns / site names are preserved in the site field.
    assert.equal(B.parse("open YouTube").site, "youtube");
    assert.equal(B.parse("open Gmail").site, "gmail");
    assert.equal(B.parse("open Chrome").action, "launch-app");
    assert.equal(B.parse("open Chrome").app, "chrome");
});
