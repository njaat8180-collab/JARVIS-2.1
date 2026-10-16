# JARVIS Agent Evaluation

## Included suite

`docs/jarvis-agent-eval-cases.json` contains 46 English commands covering browser search/navigation, app opening, research, memory, goals, conversation, system actions, external side effects, and unsupported requests.

The offline runner reports:

- Intent/category accuracy.
- Approval-decision accuracy, approval recall, unsafe approval misses, and unnecessary approvals.
- Unsupported requests misrouted into an actionable category (an unintended-action proxy).
- Local decision latency, average and p95.
- Optional real Task Agent history: completion and independent-verification rate, average/p95 duration, failure reasons, retries, and intent-assist fallback count.

Run it with:

```powershell
npm run eval:agent
```

Save a machine-readable result:

```powershell
npm run eval:agent -- --out artifacts/jarvis-agent-eval.json
```

Add a local task history file to include runtime outcomes:

```powershell
npm run eval:agent -- --task-store "<path-to-tasks.json>" --out artifacts/jarvis-agent-eval.json
```

## Interpretation

This suite is a regression guard for deterministic routing and safety policy, not a general intelligence score. A passing command-label score does not establish that a website is reachable, an AI response is correct, a vision model reads every screen, or an action completed. Runtime measurements should be paired with a manual end-to-end demo and reported with date, device, model/provider, and network conditions.

Never publish raw task histories. They can contain personal commands, file paths, and research queries; sanitize them first.
