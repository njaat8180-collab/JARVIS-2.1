"use strict";
const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const voiceSTT = require(path.join(__dirname, "..", "voiceSTT.js"));
const fs = require("fs");

const preload = path.join(app.getPath("temp"), "jarvis-stt-mic-preload.js");
fs.writeFileSync(preload, `const { contextBridge, ipcRenderer } = require("electron"); contextBridge.exposeInMainWorld("sttTest", { transcribe: (samples) => ipcRenderer.invoke("stt:test", samples) });`);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(permission === "media"));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === "media");
  ipcMain.handle("stt:test", async (_event, samples) => voiceSTT.transcribeSamples(samples, { language: process.env.JARVIS_STT_LANGUAGE || "en-IN" }));
  const win = new BrowserWindow({ width: 600, height: 360, webPreferences: { preload, contextIsolation: true, nodeIntegration: false } });
  const html = `<!doctype html><meta charset=utf-8><title>JARVIS STT Test</title><style>body{font:16px sans-serif;padding:24px}button{font-size:18px;padding:10px 16px}#status{margin:14px 0;font-weight:600}pre{white-space:pre-wrap}</style><h2>JARVIS Whisper STT Test</h2><div id=status>Requesting microphone...</div><button id=start disabled>Start 6-second recording</button><pre id=out></pre><script>
(async()=>{const s=document.getElementById('status'),b=document.getElementById('start'),o=document.getElementById('out');let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});s.textContent='Microphone OK. Click the button and speak clearly.';b.disabled=false;}catch(e){s.textContent='MIC FAILED: '+e.name+' — '+e.message;return;}b.onclick=async()=>{b.disabled=true;const AC=AudioContext||webkitAudioContext;const ac=new AC({sampleRate:16000});await ac.resume();const src=ac.createMediaStreamSource(stream),p=ac.createScriptProcessor(4096,1,1),g=ac.createGain();g.gain.value=0;const chunks=[];p.onaudioprocess=e=>chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));src.connect(p);p.connect(g);g.connect(ac.destination);s.textContent='LISTENING — speak now...';await new Promise(r=>setTimeout(r,6000));p.disconnect();src.disconnect();g.disconnect();stream.getTracks().forEach(t=>t.stop());await ac.close();const n=chunks.reduce((a,c)=>a+c.length,0),all=new Float32Array(n);let off=0;for(const c of chunks){all.set(c,off);off+=c.length;}s.textContent='Transcribing with Whisper...';try{const r=await window.sttTest.transcribe(all);o.textContent=JSON.stringify(r,null,2);s.textContent=r&&r.success?'STT PASS — '+r.text:'STT FAILED';}catch(e){o.textContent=e.stack||String(e);s.textContent='STT FAILED';}b.disabled=false;};})();</script>`;
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
});
app.on("window-all-closed",()=>app.quit());
