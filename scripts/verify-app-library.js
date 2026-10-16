"use strict";
// Real renderer, preload and Windows inventory, with a disposable app profile.
// No provider calls or desktop input. --launch-sklauncher explicitly tests that app.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = path.resolve('artifacts/app-library-verification');
fs.mkdirSync(directory, { recursive: true });
app.setPath('userData', path.join(directory, 'profile'));
const users = path.join(app.getPath('userData'), 'database', 'users', 'users.json');
fs.mkdirSync(path.dirname(users), { recursive: true });
if (!fs.existsSync(users)) fs.writeFileSync(users, JSON.stringify({ users: [], activeUserId: null, version: 2 }));
const report = { checks: [], errors: [] };
const save = () => fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
let running = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => { report.errors.push('Verification timed out'); save(); app.exit(1); }, 90000);
app.on('browser-window-created', (_event, win) => {
    win.webContents.once('did-finish-load', async () => {
        if (running || !/renderer[\\/]index\.html/.test(win.webContents.getURL())) return;
        running = true;
        const evaluate = code => win.webContents.executeJavaScript(code, true);
        try {
            await delay(3000);
            await evaluate(`(async () => { if(window.VoiceEngine) { window.VoiceEngine.autoListen=false; window.VoiceEngine.muted=true; await window.VoiceEngine.abortListening?.(); } window.WakeWordEngine?.stop?.(); window.TTSEngine?.stop?.(); })()`);
            const apps = await evaluate('window.jarvis.system.listApps()');
            const data = apps.data || apps;
            assert.equal(apps.success, true);
            const sk = data.apps.find(item => /^sklauncher$/i.test(item.name));
            assert.ok(sk, 'SKLauncher must be discovered on this PC');
            report.checks.push({ name: 'real-windows-inventory', count: data.apps.length, sklauncher: sk, warnings: data.warnings });
            for (const command of ['open SK लॉन्चर', 'SKLauncher open कर दो', 'एस के लॉन्चर खोलो']) {
                const route = await evaluate(`window.JARVISCommandRoutePolicy.decide(${JSON.stringify(command)})`);
                assert.equal(route.route, 'local');
                assert.equal(route.detected.entities.app, 'sklauncher');
            }
            report.checks.push({ name: 'mixed-language-routing', success: true });
            for (const size of [[1440, 980], [1024, 800]]) {
                win.setSize(...size); await delay(200);
                await evaluate("document.getElementById('navDashboard').click()"); await delay(300);
                const geometry = await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,library:!!window.JARVISAppLibrary, nodeExposed:typeof window.require!=='undefined'})`);
                assert.equal(geometry.overflow, false); assert.equal(geometry.nodeExposed, false);
                fs.writeFileSync(path.join(directory, `dashboard-${size[0]}.png`), (await win.webContents.capturePage()).toPNG());
                report.checks.push({ name: `dashboard-${size[0]}`, ...geometry });
            }
            win.setSize(1440, 980); await delay(200);
            await evaluate('window.JARVISAppLibrary.open("SK लॉन्चर")'); await delay(500);
            const search = await evaluate(`({open:document.querySelector('.app-library-dialog').open,results:[...document.querySelectorAll('.library-app strong')].map(el=>el.textContent)})`);
            assert.equal(search.open, true); assert.ok(search.results.some(name => /^sklauncher$/i.test(name)));
            fs.writeFileSync(path.join(directory, 'app-library-search.png'), (await win.webContents.capturePage()).toPNG());
            await evaluate('window.JARVISAppLibrary.open("")'); await delay(200);
            fs.writeFileSync(path.join(directory, 'app-library.png'), (await win.webContents.capturePage()).toPNG());
            await evaluate("document.querySelector('.app-library-dialog').close(); document.body.dataset.theme='light'"); await delay(200);
            fs.writeFileSync(path.join(directory, 'dashboard-light.png'), (await win.webContents.capturePage()).toPNG());
            report.checks.push({ name: 'search-and-dialog', ...search });
            if (process.argv.includes('--launch-sklauncher')) {
                const launch = await evaluate("window.jarvis.system.openApp('SK लॉन्चर')");
                assert.equal(launch.success, true);
                report.checks.push({ name: 'real-sklauncher-launch-request', result: launch });
                await delay(8000);
                const windows = await new Promise(resolve => require('node:child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-Process | Where-Object { $_.MainWindowTitle -match 'SKlauncher' } | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10000 }, (_error, stdout) => resolve(stdout.trim())));
                report.checks.push({ name: 'launcher-window-observation', windows: windows || 'No SKLauncher window observed; launch request acceptance alone is not proof of readiness.' });
            }
        } catch (error) { report.errors.push(error.stack || error.message); }
        finally { clearTimeout(watchdog); save(); console.log(JSON.stringify(report, null, 2)); app.exit(report.errors.length ? 1 : 0); }
    });
});
require('../main');
