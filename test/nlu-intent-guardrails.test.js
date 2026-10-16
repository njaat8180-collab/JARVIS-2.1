const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
    console,
    window: {
        addEventListener() {},
        jarvis: {}
    }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('renderer/js/language/LanguageCore.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('renderer/js/brain/naturalCommandEngine.js', 'utf8'), context);

const language = context.window.JARVISLanguageCore;
const engine = context.window.JARVISNaturalCommandEngine;

test('time and date rules require an explicit request in both NLU layers', () => {
    for (const input of ['what time is it', 'London time', 'time batao', 'kitne baje hain']) {
        assert.equal(language.analyze(input).intent, 'TIME', `LanguageCore should keep: ${input}`);
        assert.equal(engine.detect(input).intent, 'TIME', `NCE should keep: ${input}`);
    }

    for (const input of ["what's today's date", 'aaj ki date', 'date batao']) {
        assert.equal(language.analyze(input).intent, 'DATE', `LanguageCore should support: ${input}`);
        assert.equal(engine.detect(input).intent, 'DATE', `NCE should support: ${input}`);
    }

    for (const input of [
        'the meeting time changed',
        'time management tips',
        'the release date is next week',
        'date of birth is required',
        'news is difficult to follow',
        'weather API design',
        'the shutdown process is still running'
    ]) {
        assert.notEqual(language.analyze(input).intent, 'TIME', `LanguageCore false TIME: ${input}`);
        assert.notEqual(language.analyze(input).intent, 'DATE', `LanguageCore false DATE: ${input}`);
        assert.notEqual(engine.detect(input).intent, 'TIME', `NCE false TIME: ${input}`);
        assert.notEqual(engine.detect(input).intent, 'DATE', `NCE false DATE: ${input}`);
        assert.notEqual(engine.detect(input).intent, 'WEATHER', `NCE false WEATHER: ${input}`);
        assert.notEqual(engine.detect(input).intent, 'NEWS', `NCE false NEWS: ${input}`);
        assert.notEqual(language.analyze(input).intent, 'SYSTEM_CONTROL', `LanguageCore false SYSTEM_CONTROL: ${input}`);
        assert.notEqual(engine.detect(input).intent, 'SYSTEM_CONTROL', `NCE false SYSTEM_CONTROL: ${input}`);
    }
});
