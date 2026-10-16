"use strict";

// Runs the real Electron entry point with an isolated profile. No IPC,
// provider, generator, or action implementation is replaced by this probe.
// --documents uses the configured real provider and can consume API credits.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "artifacts", "desktop-verification");
const profile = path.join(directory, "profile");
const outputs = path.join(directory, "outputs", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(path.join(profile, "database", "users"), { recursive: true });
fs.mkdirSync(outputs, { recursive: true });
const registry = path.join(profile, "database", "users", "users.json");
if (!fs.existsSync(registry)) fs.writeFileSync(registry, JSON.stringify({ users: [], activeUserId: null, version: 2 }));
app.setPath("userData", profile);
app.setPath("documents", outputs);
const report = { startedAt: new Date().toISOString(), mode: "real Electron, isolated profile; text transcript supplied to real ChatEngine", checks: [], errors: [] };
const reportPath = path.join(directory, "runtime-report.json");
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
save();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false;
const watchdog = setTimeout(() => { report.errors.push("Runtime verification exceeded 12 minutes."); save(); app.exit(1); }, 12 * 60 * 1000);
const record = (name, value) => { report.checks.push({ name, at: new Date().toISOString(), ...value }); save(); };
app.on("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", async () => {
        if (running || !window.webContents.getURL().replaceAll('\\', '/').endsWith('/renderer/index.html')) return;
        running = true;
        record('renderer-loaded', { url: window.webContents.getURL() });
        const evaluate = code => window.webContents.executeJavaScript(code, true);
        try {
            await delay(3000);
            const state = await evaluate(`(async () => {
                const voice = window.VoiceEngine;
                if (voice) { voice.autoListen = false; voice.muted = true; await voice.abortListening?.(); }
                window.WakeWordEngine?.stop?.(); window.TTSEngine?.stop?.();
                return { ready: !!window.ChatEngine && !!window.jarvis, title: document.title,
                    readyState: document.readyState, bridge: Object.keys(window.jarvis || {}) };
            })()`);
            record("startup", { ...state, visible: window.isVisible(), preferences: {
                sandbox: window.webContents.getLastWebPreferences().sandbox,
                contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
                nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration
            } });
            if (!state.ready) throw new Error("Real renderer or preload bridge did not become ready.");
            // Capture actual application rendering and geometry, not a replica.
            for (const view of ["dashboard", "chat", "documents", "settings", "voice"]) {
                const navId = { dashboard: "navDashboard", chat: "navChat", documents: "navDocuments", settings: "navSettings", voice: "navVoice" }[view];
                await evaluate(`document.getElementById(${JSON.stringify(navId)}).click()`);
                await delay(300);
                const geometry = await evaluate(`(() => { const layout = document.querySelector('.mainLayout'); return {
                    view: document.body.className, width: innerWidth, height: innerHeight,
                    columns: getComputedStyle(layout).gridTemplateColumns,
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    chat: (() => { const el = document.querySelector('.chat-panel'); return { parent: el.parentElement.className, display: getComputedStyle(el).display, hidden: el.hidden, style: el.getAttribute('style'), rect: el.getBoundingClientRect().toJSON(), rules: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).filter(r => r.selectorText && el.matches(r.selectorText) && r.style.display).map(r => r.cssText) }; })(),
                    panels: [...layout.children].filter(el => getComputedStyle(el).display !== 'none').map(el => { const r = el.getBoundingClientRect(); return { id: el.id, class: el.className, x: r.x, y: r.y, width: r.width, height: r.height }; })
                }; })()`);
                const screenshot = path.join(directory, `${view}.png`);
                fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
                record(`layout-${view}`, { ...geometry, screenshot });
            }
            await evaluate(`document.getElementById('navChat').click()`);
            await evaluate(`(async () => { if (window.VoiceEngine) { window.VoiceEngine.autoListen = false; window.VoiceEngine.muted = true; await window.VoiceEngine.abortListening?.(); } window.WakeWordEngine?.stop?.(); })()`);
            const health = await evaluate(`window.jarvis.aiProvider.health()`);
            record("provider-health", { result: health });
            if (process.argv.includes("--documents")) {
                const transcript = "minecraft ke upar ek achchhee se peepeetee bao aur usamen but saree imejes lagan";
                const result = await evaluate(`window.ChatEngine.send(${JSON.stringify(transcript)}, { source: 'voice', rawTranscript: ${JSON.stringify(transcript)}, spokenText: ${JSON.stringify(transcript)}, speak: false })`);
                record("real-voice-transcript-to-ppt", { transcript, result });
                const pdf = await evaluate(`window.ChatEngine.send('Create a PDF about cybersecurity basics', { speak: false })`);
                record("real-chat-to-pdf", { result: pdf });
                const workbook = await evaluate(`window.jarvis.documents.createSpreadsheet('Monthly expense tracker with formulas')`);
                record("real-ipc-to-xlsx", { result: workbook });
                const docx = await evaluate(`window.jarvis.documents.createOfficeFile('docx', 'Study guide about safe passwords', { language: 'en' })`);
                record("real-ipc-to-docx", { result: docx });
                const files = [];
                const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (/\.(pptx|pdf|xlsx|docx)$/i.test(p)) files.push(p); } };
                walk(outputs);
                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    const bytes = fs.readFileSync(file);
                    let proof = {};
                    if (ext === ".pptx") {
                        const zip = await require("jszip").loadAsync(bytes, { checkCRC32: true });
                        const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
                        const text = (await Promise.all(slides.map(name => zip.file(name).async("string")))).join(" ");
                        proof = { slideCount: slides.length, mediaCount: Object.keys(zip.files).filter(name => /^ppt\/media\/[^/]+$/.test(name)).length, pictureCount: (text.match(/<p:pic>/g) || []).length, containsTopic: /minecraft|माइनक्राफ्ट/i.test(text) };
                        if (!proof.slideCount || !proof.containsTopic) throw new Error("Generated PPTX does not contain expected Minecraft slides.");
                        if (!proof.pictureCount) report.errors.push("Generated PPTX contains no inserted images.");
                    } else if (ext === ".pdf") {
                        const parsed = await require("pdf-parse")(bytes);
                        proof = { pages: parsed.numpages, textCharacters: parsed.text.length };
                        if (proof.pages < 1 || proof.textCharacters < 80) throw new Error("Generated PDF has no readable content.");
                    } else if (ext === ".docx") {
                        const parsed = await require("mammoth").extractRawText({ buffer: bytes });
                        proof = { textCharacters: parsed.value.length };
                        if (proof.textCharacters < 80) throw new Error("Generated DOCX has no readable content.");
                    } else {
                        const book = require("xlsx").read(bytes, { type: "buffer", cellFormula: true, sheetStubs: true });
                        proof = { sheets: book.SheetNames, formulaCount: Object.values(book.Sheets).reduce((n, sheet) => n + Object.values(sheet).filter(cell => cell?.f).length, 0) };
                        if (!proof.sheets.length) throw new Error("Generated workbook has no sheets.");
                    }
                    record("saved-artifact-verification", { file, bytes: bytes.length, ...proof });
                }
                for (const extension of [".pptx", ".pdf", ".xlsx", ".docx"]) {
                    if (!files.some(file => file.endsWith(extension))) report.errors.push(`No real ${extension} generated.`);
                }
            }
        } catch (error) {
            report.errors.push(String(error.stack || error));
        } finally {
            clearTimeout(watchdog);
            report.finishedAt = new Date().toISOString(); save();
            console.log("RUNTIME_REPORT=" + reportPath);
            app.exit(report.errors.length ? 1 : 0);
        }
    });
});
require("../main.js");
