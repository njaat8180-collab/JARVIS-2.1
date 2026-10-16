# Deprecated: memoryAgent.js

Audited during the "orphaned agents" wiring pass and found to be **mislabeled** —
its internal header comments and code (`const MonitorAgent = {...}`, `storageKey:
"jarvis_monitor_v1"`) are a duplicate of `brain/agents/MonitorAgent.js`, not an
actual memory agent. It appears the filename and content were mismatched during
an earlier generation/copy step.

It was never `<script>`-loaded by `index.html`, so this was dead code with no
runtime effect either way — moved here rather than silently deleted, per this
project's existing convention (see `browser/_deprecated_BrowserParserV10/`).

Real memory functionality lives in the already-loaded, already-working
`memoryManagerAgent.js` (session/fact persistence) plus the newly-wired
`knowledgeAgent.js` (structured, searchable knowledge entries). No functionality
was lost by removing this file from the live tree.
