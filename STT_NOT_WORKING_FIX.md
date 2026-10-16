# STT (Whisper) kaam nahi kar raha? — Fix

## Root cause
`@huggingface/transformers` package (jo Whisper model actually chalata hai) `node_modules`
mein install nahi hai. `mic` package bhi missing hai. Baaki sab wiring (main.js, preload.js,
voice.js) sahi hai.

## Fix (ek hi command)
Project folder mein jaake:

```
npm install
```

Isse `@huggingface/transformers` aur `mic` dono install ho jayenge.

## Pehli baar chalane par
- App start karne ke baad, jab pehli baar mic use karenge, Whisper model
  (`Xenova/whisper-tiny`, ~40-70MB) internet se download hoga — is waqt
  **internet connection zaroori hai**, download hone tak thoda time lagega.
- Model download ho jaane ke baad woh cache ho jata hai (userData folder mein
  `whisper-models/`), phir offline bhi chalega.
- Agar first run pe koi firewall/network Hugging Face ko block kar raha ho, download
  fail hoga aur STT kaam nahi karega — is case mein console (`npm start` ke terminal
  output) mein error dikhega jaise "Failed to fetch" ya "ENOTFOUND huggingface.co".

## Verify karne ke liye
Terminal mein `npm start` chalayein aur console logs dekhein — mic se bolne ke baad
yeh lines dikhni chahiye:
```
🎤 [STT] Received <N> audio samples
🧠 [STT] Loading Whisper model...
🧠 [STT] Whisper model ready — transcribing...
📝 [STT] Transcript: "..."
```
Agar yahan koi error print ho (module not found / fetch failed / permission denied),
wahi exact error message bataiye — usse exact fix bata sakunga.

## Doosri common wajah: mic permission
Browser/Electron mic permission na di ho toh bhi STT chup-chaap fail hota hai.
Windows Settings → Privacy → Microphone mein Electron/JARVIS ko allow karein, aur app
ke andar jab mic permission popup aaye toh "Allow" karein.
