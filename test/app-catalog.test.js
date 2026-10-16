const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createAppCatalog, normalizeName } = require('../src/system/appCatalog');

function fixture(t, extras = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-app-catalog-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const name of ['SKlauncher', 'Uninstall SKlauncher', 'Example Studio', 'Example Player']) fs.writeFileSync(path.join(root, name + '.lnk'), 'shortcut fixture');
    const opened = [];
    const catalog = createAppCatalog({ roots: [{ path: root, depth: 0, source: 'Desktop' }], platform: 'win32', readInventory: async () => ({ items: [], warnings: [] }), shell: { openPath: async value => { opened.push(value); return ''; } }, launchExecutable: async () => ({ success: true }), ...extras });
    return { catalog, opened, root };
}
test('discovers desktop shortcuts, omits uninstallers and normalizes spoken SK names', async t => {
    const { catalog, opened } = fixture(t);
    const list = await catalog.list();
    assert.equal(list.apps.length, 3);
    for (const name of ['SK Launcher', 'sklauncher', 's k launcher', 'SK लॉन्चर', 'एस के लॉन्चर']) {
        assert.equal(normalizeName(name), 'sklauncher');
        const result = await catalog.launch(name);
        assert.equal(result.success, true, name);
        assert.equal(result.data.status, 'launch-requested');
    }
    assert.equal(opened.length, 5);
    assert.ok(opened.every(name => name.endsWith('SKlauncher.lnk')));
    assert.ok(list.apps.every(app => !('targets' in app)));
});
test('ambiguous names and misspellings offer choices without launching', async t => {
    const { catalog, opened } = fixture(t);
    for (const query of ['Example', 'sklaunchr']) {
        const result = await catalog.launch(query);
        assert.equal(result.success, false);
        assert.equal(result.code, 'APP_CHOICE_REQUIRED');
        assert.ok(result.suggestions.length);
    }
    assert.equal(opened.length, 0);
});
test('rejects raw commands; propagates actual Windows launch failure', async t => {
    const { catalog, opened } = fixture(t, { shell: { openPath: async () => 'Shortcut cannot be opened' } });
    for (const input of ['chrome & calc', 'C:\\Windows\\cmd.exe', 'x; y', '$(whoami)']) assert.equal((await catalog.launch(input)).code, 'INVALID_APP_NAME');
    assert.equal(opened.length, 0);
    const result = await catalog.launch('SKLauncher');
    assert.equal(result.success, false);
    assert.match(result.error, /cannot be opened/);
});
test('one inventory scan serves concurrent callers and refresh discovers new apps', async t => {
    let scans = 0;
    const { catalog, root } = fixture(t, { readInventory: async () => { scans++; return { items: [], warnings: [] }; } });
    await Promise.all([catalog.list(), catalog.list(true), catalog.list()]);
    assert.equal(scans, 1);
    fs.writeFileSync(path.join(root, 'NewApp.lnk'), 'fixture');
    assert.equal((await catalog.resolve('NewApp')).success, true);
    assert.equal(scans, 2);
});
test('Store apps and registered executables share the same catalog; missing paths are filtered', async t => {
    const calls = [];
    const { catalog, root } = fixture(t, { readInventory: async () => ({ items: [
        { name: 'Store Timer', kind: 'appId', target: 'Vendor.Timer_123!App', source: 'Windows apps' },
        { name: 'Ghost', kind: 'executable', target: path.join(os.tmpdir(), 'jarvis-no-such-app.exe') }
    ], warnings: ['partial scan'] }), launchExecutable: async (...args) => { calls.push(args); return { success: true }; } });
    const list = await catalog.list();
    assert.equal(list.apps.some(app => app.name === 'Ghost'), false);
    assert.deepEqual(list.warnings, ['partial scan']);
    const store = list.apps.find(app => app.name === 'Store Timer');
    assert.equal((await catalog.launch(store.id, { byId: true })).success, true);
    assert.deepEqual(calls, [['explorer.exe', ['shell:AppsFolder\\Vendor.Timer_123!App']]]);
});
test('related launcher lookup prefers the first installed valid candidate', async t => {
    const { catalog, opened } = fixture(t);
    const result = await catalog.launchAny(['Minecraft Launcher', 'SKLauncher', 'Prism Launcher']);
    assert.equal(result.success, true);
    assert.equal(result.matchedQuery, 'SKLauncher');
    assert.equal(path.basename(opened[0]), 'SKlauncher.lnk');
});

test('bounded executable discovery finds portable apps without shortcuts', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-portable-app-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, 'SKLauncher');
    fs.mkdirSync(bin);
    const executable = path.join(bin, 'SKLauncher.exe');
    fs.writeFileSync(executable, 'fixture');
    const calls = [];
    const catalog = createAppCatalog({
        roots: [{ path: root, depth: 2, source: 'Local Programs', extensions: ['.exe'] }],
        platform: 'win32', readInventory: async () => ({ items: [], warnings: [] }),
        shell: { openPath: async () => '' },
        launchExecutable: async (...args) => { calls.push(args); return { success: true }; }
    });
    const result = await catalog.launch('open sk launcher'.replace(/^open\s+/i, ''));
    assert.equal(result.success, true);
    assert.deepEqual(calls, [[executable, []]]);
});

function nlu(launch = async () => ({ success: true })) {
    const context = { console: { log() {}, error() {} }, window: { addEventListener() {}, jarvis: { system: { openApp: launch } } } };
    vm.createContext(context);
    for (const file of ['naturalCommandEngine', 'commandRoutePolicy']) vm.runInContext(fs.readFileSync(`renderer/js/brain/${file}.js`, 'utf8'), context);
    return context.window;
}
test('English, Hindi and Hinglish app commands reach the local executor', async () => {
    const calls = [];
    const w = nlu(async name => { calls.push(name); return { success: true }; });
    for (const input of ['open SKLauncher', 'open SK लॉन्चर', 'SK लॉन्चर खोलो', 'SKLauncher open कर दो', 'please open SK Launcher', 'can you open SKLauncher please', 'एस के लॉन्चर खोल दो', 'open Example Studio', 'Example Studio ko khol do']) {
        const result = w.JARVISNaturalCommandEngine.detect(input);
        assert.equal(result.intent, 'OPEN_APP', input);
        assert.equal(w.JARVISCommandRoutePolicy.decide(input).route, 'local', input);
        const executed = await w.JARVISNaturalCommandEngine.process(input);
        assert.equal(executed.handled, true, input);
    }
    assert.ok(calls.slice(0, 7).every(name => name === 'sklauncher'));
    assert.equal(calls.at(-1), 'example studio');
});
test('mentions and explanations do not open apps; absent launch confirmation is an error', async () => {
    const w = nlu(async () => undefined);
    for (const input of ['explain how to open SKLauncher', 'why does Notepad not open', 'do not open Chrome', 'tell me about open source software']) assert.notEqual(w.JARVISNaturalCommandEngine.detect(input).intent, 'OPEN_APP', input);
    const result = await w.JARVISNaturalCommandEngine.process('open SKLauncher');
    assert.match(result.response, /did not confirm/);
});
