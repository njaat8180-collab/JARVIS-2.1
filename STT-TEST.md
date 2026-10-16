# JARVIS STT tests

```bash
npm install
npm run test:stt
```

Real WAV + Whisper:
```bash
npm run test:stt -- --file test-audio.wav
```

Real microphone + Whisper:
```bash
npm run test:stt:mic
```

The microphone test records for 6 seconds, then sends the captured 16 kHz PCM to the same Whisper STT service used by JARVIS.
