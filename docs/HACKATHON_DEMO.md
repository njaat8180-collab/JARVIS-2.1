# JARVIS Hackathon Demo Pack

## Product story

**JARVIS is an evidence-first Windows desktop copilot.** It can inspect a screen locally, look up a question in its supported research/browser paths, show what it actually did, and stop for approval before actions that can change the machine or affect another person.

The demo should prove one complete user journey, not advertise every feature:

> A user sees an unfamiliar error → shares the relevant window → asks JARVIS to identify it → asks it to search the exact error → reviews source links and suggested next steps → explicitly approves any consequential action.

Screen understanding uses the configured local Ollama vision model. Research links and browser navigation depend on the installed/configured providers and internet access. If a step is unavailable, show the error and continue only with steps that have evidence.

## Demo run of show

### One-minute introduction

“JARVIS is a Windows desktop assistant that connects screen understanding, research, and real desktop actions. The important difference is that it shows the evidence for each step, verifies outcomes where possible, and asks before consequential actions. I’ll show it diagnosing a visible error and finding a source-backed next step.”

### Three-minute live walkthrough

1. Prepare a window with a real, harmless error message and keep a browser tab available.
2. Start JARVIS, share only that window, and ask: **‘Jarvis, read and explain the error visible here.’**
3. Ask JARVIS to search the exact error on Google in its browser. Confirm the query is the error text, not the words “find on Google.”
4. Open the relevant result and describe the source and the specific evidence that supports the proposed fix. Avoid presenting an unverified search snippet as fact.
5. Ask for a consequential action such as installing software or changing a system setting. Show the approval gate; decline or approve deliberately.
6. In Task Center, show the action result, verification status, source links, elapsed time, and any fallback or failure reason.
7. If a provider or page fails, show the honest failure reason, retry the safe research step, and explain that no destructive action ran.

### Optional Computer Use segment

Press **Control** in the composer to start a bounded Computer Use session. Share the target window first, then use one visible action at a time. Normal navigation actions can run inside the session; typing, hotkeys, double-clicks, and right-clicks show an action-time confirmation. The **Emergency stop** button immediately ends the session. Do not use this demo mode for passwords, payment details, security prompts, or arbitrary terminal commands.

Do not stage a fake success state. Use a prepared, reproducible error and disclose any fixture, prerecorded clip, or preloaded source used in the demo.

## Submission checklist

- [ ] One-sentence problem, target user, and measurable benefit.
- [ ] Working Windows demo with a clean test account and no personal data visible.
- [ ] 60-second intro and 2–3 minute live or recorded walkthrough.
- [ ] Repository setup instructions, supported model/provider list, and architecture diagram.
- [ ] Evaluation report from `npm run eval:agent` and, when available, a sanitized Task Agent store report.
- [ ] Three high-resolution screenshots, a short demo video, and known limitations.
- [ ] Disclose pre-existing JARVIS code, third-party packages/models, APIs, image/data sources, and demo fixtures according to the event rules.

## Reproducible evaluation

Run the safe, offline command/approval evaluation:

```powershell
npm run eval:agent -- --out artifacts/jarvis-agent-eval.json
```

It evaluates 46 fixed commands and does not open apps, browse, write user files, or execute system actions. To include a real persisted Task Agent history, pass its `tasks.json` path:

```powershell
npm run eval:agent -- --task-store "<path-to-tasks.json>" --out artifacts/jarvis-agent-eval.json
```

Never include API keys, personal messages, private browser history, or screen captures in an evaluation report submitted publicly. Report the hardware, model names, network state, and test date alongside latency numbers.

## Honest scope

- The evaluator measures deterministic routing and approval policy. It does not claim to benchmark AI factual accuracy or live site compatibility.
- Task Agent run metrics are based on recorded tasks; old tasks without runtime metadata are excluded from duration averages.
- Vision quality depends on the local model, display scale, screenshot legibility, and available memory/compute.
- Login, CAPTCHA, paywalls, and site restrictions remain outside JARVIS’s control.
- A visual claim must be labeled as a preview, structural check, or real application render; these are not interchangeable.
