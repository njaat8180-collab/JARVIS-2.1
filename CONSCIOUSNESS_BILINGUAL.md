# JARVIS Consciousness + Bilingual Layer

This build adds an engineered **self-state simulation**: identity, continuity count, focus, mood, recent topics, language state and a short reflective status. It is designed to make the interface feel consistent and present; it does not claim literal subjective consciousness.

## AI
Set `GEMINI_API_KEY` in `.env`. The main process uses the existing `@google/genai` dependency.

## Hindi + English
The AI automatically detects Devanagari, English, or mixed Hinglish and answers in the matching style. Voice output selects `hi-IN` for Hindi text and `en-IN` for English text. On Windows, Hindi speech requires an installed Hindi SAPI voice; otherwise Windows may fall back to its available voice.

## Run
```bash
npm install
npm start
```
