const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Chat = require('../renderer/js/chat.js');
function runtime(launch) {
    const calls = [];
    const window = {
        addEventListener() {},
        JARVISComputerUse: {isActive:()=>true, setAccessMode:async()=>({success:true})},
        jarvis: { system: { openApp: async (...args) => { calls.push(args); return launch; } } },
        JARVISScreenShare: { shouldAnalyzeQuestion: () => true, analyze: () => { throw Error('Wrong screen-question route'); } }
    };
    const ctx = vm.createContext({ window, console, setTimeout: callback => callback() });
    vm.runInContext(fs.readFileSync('renderer/js/brain/naturalCommandEngine.js', 'utf8'), ctx);
    return { window, calls, engine: window.JARVISNaturalCommandEngine };
}
test('Store search works without vision and never falls back to another app', async () => {
    for (const launch of [{ success: true, searchHandled: true }, { success: false, error: 'Store unavailable' }, undefined]) {
        const r = runtime(launch);
        const result = await r.engine.process('Open Microsoft Store and search cloud');
        assert.equal(r.calls.length, 1);
        assert.equal(r.calls[0][0].toLowerCase(), 'microsoft store');
        assert.equal(r.calls[0][1].searchQuery, 'cloud');
        assert.equal(result.handled, true);
        if (!launch?.success) assert.doesNotMatch(result.response, /accepted|verified|completed/i);
    }
});
test('Notepad payload stays literal and launch failure cannot trigger typing', async () => {
    const r = runtime({ success: false, error: 'Notepad unavailable' });
    const command = 'Jarvis, open Notepad and type minecraft खेलेगा and open Chrome';
    const detected = r.engine.detect(command);
    assert.equal(detected.intent, 'APP_TASK_FLOW');
    assert.equal(detected.entities.app, 'Notepad');
    assert.equal(detected.entities.text, 'minecraft खेलेगा and open Chrome');
    const result = await r.engine.execute(detected);
    assert.equal(r.calls.length, 1);
    assert.equal(result.response, 'Notepad unavailable');
});
test('chat keeps wake-word app commands atomic and bypasses screen-question interception', async () => {
    const r = runtime({ success: true, searchHandled: true });
    const previous = global.window;
    global.window = r.window;
    try {
        const chat = new Chat();
        const command = 'Jarvis, open Microsoft Store and search cloud and download it';
        assert.deepEqual(chat._splitCompoundCommand(command), [command]);
        const typed = 'Jarvis, open Notepad and type Hello and open Chrome';
        assert.deepEqual(chat._splitCompoundCommand(typed), [typed]);
        await chat.processBrainRouter('Open Microsoft Store and search cloud', {});
        assert.equal(r.calls.length, 1);
        await chat.processBrainRouter('Open Notepad', {});
        assert.equal(r.calls[1][0].toLowerCase(), 'notepad');
    } finally { global.window = previous; }
});

test('browser voice fast path leaves local app workflows for ChatEngine', async () => {
    const r = runtime({success:true});
    const ctx=vm.createContext({window:r.window, console});
    vm.runInContext(fs.readFileSync('renderer/js/browserVoiceControl.js','utf8'),ctx);
    for (const text of ['Open Notepad', 'Open Notepad and type hello world', 'Jarvis, open Notepad and type Hello and open Chrome']) {
        assert.equal(r.window.BrowserVoiceControl.parse(text),null,text);
        assert.equal((await r.window.BrowserVoiceControl.handle(text)).handled,false,text);
    }
    assert.notEqual(r.window.BrowserVoiceControl.parse('search Google for Notepad'),null);
});

test('unknown open targets never become implicit web searches', async () => {
 const window={BrowserUI:{navigateActiveTab:()=>{throw Error('Unexpected navigation');}},jarvis:{browser:{}}};
 const ctx=vm.createContext({window,console});vm.runInContext(fs.readFileSync('renderer/js/browserVoiceControl.js','utf8'),ctx);
 for(const command of ['open Notepad and type hello world','open custom editor','launch unknown desktop app','custom editor kholo','open google chrome and type hello']) {
  assert.equal(window.BrowserVoiceControl.parse(command),null,command);
  assert.equal((await window.BrowserVoiceControl.handle(command)).handled,false,command);
 }
 assert.equal(window.BrowserVoiceControl.parse('open youtube').action,'open');
 assert.equal(window.BrowserVoiceControl.parse('open example.com').action,'open');
 assert.equal(window.BrowserVoiceControl.parse('search Google for Notepad').action,'search');
});
