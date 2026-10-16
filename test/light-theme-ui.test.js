const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('renderer/css/ui-refresh.css', 'utf8');

test('light theme uses a scoped low-glare Aurora Glass palette', () => {
    assert.match(css, /body\[data-theme="light"\]\s*\{[\s\S]*--ui-bg:\s*#e8eef6/);
    assert.match(css, /body\[data-theme="light"\] \.header/);
    assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
});

test('light theme provides readable text and interactive states', () => {
    assert.match(css, /body\[data-theme="light"\] \.message \.message-content/);
    assert.match(css, /body\[data-theme="light"\] \.mission-primary-button:hover/);
    assert.match(css, /body\[data-theme="light"\] input/);
});
