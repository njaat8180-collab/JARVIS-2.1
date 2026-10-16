# Cognition / Memory Update — What Changed

This is an honest, scoped changelog for this pass. It does **not** implement
the full 28-section master prompt — see "Not done" at the bottom.

## Files created

- `src/ai/memory.js` — was a 0-byte empty stub; now a real `MemoryEngine`:
  - Extracts explicit facts from messages (English + Hinglish patterns:
    "my name is X", "mera naam X hai", "I live in X"). Never invents facts.
  - Persists to `<userData>/jarvis-memory.json`, survives a corrupt file
    without crashing.
  - `buildContextBlock()` injects known facts into the AI system prompt so
    JARVIS can recall them across turns.
  - Tracks short-term "working memory" (last 20 turns, in-process only).
- `test/cognition.test.js` — 15 real `node:test` unit tests for the memory
  engine and the consciousness layer. All passing (verified with
  `npm test`, which now runs this alongside the existing `test/stt.test.js`
  — 20/20 total).

## Files modified

- `src/ai/consciousness.js` — extended the existing (already-working)
  `ConsciousnessLayer` additively:
  - New fields: `awarenessLevel`, `activeGoal`, `role`, `userRelationship`.
  - New `setMode()` — a deterministic state machine
    (IDLE/LISTENING/UNDERSTANDING/THINKING/RESPONDING/REFLECTING/ERROR).
  - New `setGoal()` / `getHealthSummary()` for the Health dashboard.
  - `buildSystemPrompt()` now accepts optional extra context (used to
    inject memory facts) without changing its existing call sites.
  - All previously-existing fields/methods are unchanged, so the existing
    Consciousness Core HUD keeps working with no HUD-side changes required.
- `main.js`:
  - `ai:ask` now runs through a small **request queue**
    (`enqueueAIRequest`/`runAIRequestQueue`) so concurrent requests are
    processed strictly in order instead of racing against shared
    `chatHistory`/memory state, or being silently dropped.
  - Extracts facts from the user's message via `MemoryEngine` before
    calling Gemini, and injects `memory.buildContextBlock()` into the
    system prompt.
  - Structured log lines added: `[COGNITION]`, `[MEMORY]`, `[LANGUAGE]`.
  - `consciousness:state` now also returns a `health` object (state, focus,
    mood, language, confidence %, awareness %, active goal, memory fact
    count) for the Health dashboard.
  - New handlers: `memory:get-facts`, `memory:forget-fact`.
- `preload.js` — exposes `window.jarvis.ai.getMemoryFacts()` and
  `window.jarvis.ai.forgetMemoryFact(key)`.
- `renderer/js/health.js` — `refreshConsciousness()` (previously defined
  but never called) is now actually wired into the Health panel's
  `refresh()` cycle, and populates a new **MEMORY** metric card.
- `renderer/index.html` — added an **AWARENESS** and **GOAL** stat to the
  existing Consciousness Core card (which was already inside the Health
  panel, not a separate main-UI widget), and a new **MEMORY** metric card
  next to CPU/RAM/GPU/DISK.
- `renderer/js/consciousness.js` — renders the two new stats above.
- `package.json` — `test` script now runs both test files
  (`test/stt.test.js test/cognition.test.js`).

## Verified

- `node --check` passes clean on every edited `.js` file.
- `npm test` passes 20/20 (5 pre-existing STT tests + 15 new tests),
  run in this sandbox.
- Fact extraction/recall/persistence/corrupt-file-recovery, language
  detection (en/hi/hinglish), and the THINKING→RESPONDING/ERROR state
  machine are all covered by real, passing tests — not just written and
  assumed to work.

## Not done in this pass (be aware before you test)

- **Voice/TTS/STT changes**: none. I don't have a microphone, speakers,
  or the ability to launch the actual Electron window in this sandbox, so
  I did not touch `voice.js`, `tts.js`, or the STT/TTS echo-protection
  logic. Please test those yourself with real hardware.
- The full 28-section "CognitiveCore" architecture (separate
  AttentionManager/GoalManager/ReflectionEngine/EventBus classes, a
  request-queue UI indicator, background-learning integration, etc.) was
  **not** built as standalone modules — I extended the existing, working
  `ConsciousnessLayer` + added a real `MemoryEngine` instead of creating
  parallel systems, per the "reuse existing modules, don't duplicate"
  instruction in the brief. If you want the fuller multi-module
  architecture, that's a much larger follow-up.
- The large, currently-unused `renderer/js/brain/*` tree (agents,
  browser-intelligence stack, learning engines, a `_deprecated_*` folder)
  was left untouched — `main.js`'s live chat path doesn't call into it,
  and touching it was out of scope for a change this size.
- One latent-but-dead bug I found and did **not** fix: `renderer/js/ai.js`
  calls `.trim()` on the object `window.jarvis.askAI()` returns, as if it
  were a string. It's currently unreachable (chat.js always resolves
  `window.jarvis.askAI` first via a different, correct code path), so I
  left it as-is rather than touch code you didn't ask about — flagging it
  here in case you ever wire `ai.js` back in.

## How to test

```
cd "JARVIS PRO MAX DESKTOP HEALTH UPGRADE"
npm install
npm test              # should show 20 passing
npm start              # launch the app, needs GEMINI_API_KEY in .env
```

Try in chat: "My name is Nakul." then "What is my name?" — it should
recall correctly now. Open the Health panel and check the new **MEMORY**
card and the **AWARENESS**/**GOAL** stats on the Consciousness Core card.
