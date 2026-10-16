const test = require('node:test');
const assert = require('node:assert/strict');
const { match } = require('../renderer/js/accessibilityTargets');
const editor = { name: '', controlType: 'ControlType.Document', windowName: 'Untitled - Notepad', value: 'Hello world', width: 500, height: 400 };
test('unnamed Notepad editor is found without matching unrelated window labels', () => {
 assert.equal(match('the editable text area in notepad', [editor]), editor);
 assert.equal(match('the editable text area in chrome', [editor]), null);
});
test('verification requires complete text, not one matching word', () => {
 assert.equal(match('the text Hello world', [editor]), editor);
 assert.equal(match('the text Hello missing world', [editor]), null);
 assert.equal(match('search results for hello', [editor]), null);
});
test('ambiguous or hidden buttons cannot yield an accessibility click', () => {
 const button = {name:'Play', width:80, height:40};
 assert.equal(match('Play', [button]), button);
 assert.equal(match('Play', [button, {...button}]), null);
 assert.equal(match('Play', [{...button, offscreen:true}]), null);
 assert.equal(match('the first world Play button', [button]), null);
});
test('focused and search editors are selected without guessing between fields', () => {
 const search = {name:'Address and search bar', controlType:'ControlType.Edit', windowName:'Google Chrome', keyboardFocusable:true, keyboardFocused:true, width:500, height:30};
 const other = {name:'Login', controlType:'ControlType.Edit', windowName:'Google Chrome', keyboardFocusable:true, width:300, height:30};
 assert.equal(match('the search field in chrome', [search, other]), search);
 assert.equal(match('the focused editable text area in chrome', [search, other]), search);
 assert.equal(match('the editable text area in chrome', [search, other]), null);
});
test('unique profile labels can be matched from natural selection wording', () => {
 const profile = {name:'Nakul Kumar profile', controlType:'ControlType.Button', windowName:'Google Chrome', width:160, height:40};
 assert.equal(match('Nakul Kumar profile', [profile]), profile);
});
