# JARVIS PRO MAX — Voice Flow

## Target Pipeline

```text
Electron renderer microphone
   ↓
   Web Audio PCM capture (mono, 16 kHz)
   ↓
   IPC audio transfer
   ↓
   Whisper in the main process
   ↓
Partial + Final Transcript
   ↓
Wake Word / Activation Logic
   ↓
ChatEngine / Intent
   ↓
Brain Pipeline
   ↓
Action / Response
   ↓
TTS
```

## Responsibilities

### Audio Capture
- open the microphone through `navigator.mediaDevices.getUserMedia`
- collect PCM frames through Web Audio without a SoX dependency
- resample to 16 kHz before sending audio to Whisper
- stop tracks, disconnect nodes, and close the audio context

### STT
- lazily initialize the Whisper model
- process one final audio buffer per command
- return one transcript through the `voice:transcribe` IPC handler
- reset a failed model load so a later attempt can recover

### Wake Word
- activate command mode
- prevent duplicate activation
- stop/listen according to the project policy

### Transcript Router
- send the final transcript to exactly one intended consumer
- preserve transcript text
- avoid duplicate event listeners

### TTS
- speak responses
- manage queue
- support fallback
- recover from failures

## Reliability Requirements

1. Voice failure must not crash JARVIS.
2. Text input must remain usable if voice fails.
3. Do not create duplicate microphone listeners.
4. Do not send both partial and final results as separate commands unless explicitly intended.
5. Avoid overlapping TTS playback unless queueing is intentional.
6. Stop microphone resources on shutdown.
7. Log meaningful state transitions.
8. Keep model loading separate from command execution.

## Test Cases

- microphone starts
- microphone stops
- valid speech produces transcript
- silence produces no command
- partial transcript does not accidentally execute
- final transcript executes once
- STT failure recovers
- TTS failure falls back
- voice failure leaves text chat working
- repeated start/stop does not create duplicate listeners
