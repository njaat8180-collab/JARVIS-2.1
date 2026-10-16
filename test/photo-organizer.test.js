const test = require('node:test');
const assert = require('node:assert/strict');
const { similarity, signatureSimilarity } = require('../src/media/photoOrganizer');

test('photo similarity is deterministic and bounded', () => {
    assert.equal(similarity('1010', '1010'), 1);
    assert.equal(similarity('0000', '1111'), 0);
    assert.equal(similarity('10', '1010'), 0.5);
});

test('multi-signal similarity rewards matching structure and color', () => {
    const same = { averageHash: '1010', differenceHash: '1100', color: [120, 80, 40] };
    const close = { averageHash: '1010', differenceHash: '1101', color: [125, 82, 44] };
    const different = { averageHash: '0000', differenceHash: '0000', color: [250, 250, 250] };
    assert.equal(signatureSimilarity(same, same), 1);
    assert.ok(signatureSimilarity(same, close) > signatureSimilarity(same, different));
});
