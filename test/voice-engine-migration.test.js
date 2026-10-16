const test = require('node:test');
const assert = require('node:assert/strict');
const { createVoiceEngineMigration } = require('../src/speech/voiceEngineMigration');

test('Vosk migration fails closed and preserves Whisper', async () => {
    let saved = false;
    const service = createVoiceEngineMigration({
        getSettings: async () => ({ sttEngine: 'offline' }),
        saveSettings: async () => { saved = true; return { sttEngine: 'vosk' }; }
    });
    const result = await service.preflight('vosk');
    assert.equal(result.success, false);
    assert.equal(result.code, 'ENGINE_UNSUPPORTED');
    assert.equal(saved, false);
    assert.match(result.error, /native Windows speech dependencies/i);
});

test('cleanup requires a separate approval and never deletes the active fallback', async () => {
    const service = createVoiceEngineMigration({ getSettings: async () => ({ sttEngine: 'offline' }) });
    const result = await service.cleanup('whisper');
    assert.equal(result.success, false);
    assert.equal(result.code, 'APPROVAL_REQUIRED');
});
