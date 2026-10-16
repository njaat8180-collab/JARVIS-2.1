# PHASE 5 — RESEARCH INTEGRATION

Status: COMPLETE (implementation + tests). Live network verification is
environment-blocked (`x-deny-reason: host_not_allowed`); see
"Live research test" below.

## What changed

`src/evolution/researchProvider.js` (Phase 4's deterministic, network-free
`LocalDeterministicResearchProvider` is unchanged and remains the
`EvolutionEngine`'s default) gained three new, strictly read-only classes:

- `WikipediaResearchProvider` — adapts `src/services/wikipedia.js`'s
  existing `summary()`.
- `StructuredDataResearchProvider` — adapts `src/services/dataSources.js`'s
  existing `wikidataSearch()` (or any other exported function by name).
- `MultiSourceResearchProvider` — fans a single goal-derived query
  (`goal.name`) out to both adapters in parallel and returns every
  result, succeeded and failed, normalized to:
  `{ query, source, title, summary, url, retrievedAt, success, error, metadata }`.

No new HTTP client, no second Wikipedia/Wikidata client, and no second
cache were created. `main.js` passes `MultiSourceResearchProvider` the
same `wikipediaService`/`dataSourcesService` references it already wraps
with `offlineCache.wrapModule()` for every other command in the app, so
Phase 5 research automatically gets the existing cache-through / offline
fallback behavior for free.

`EvolutionEngine._analyze()`/`.start()` are now `async` (they `await`
`researchProvider.research(goal)`), and `_buildProposal()` now attaches
`research` (source list, succeeded/failed sources) and `provenance`
(per-source title/query/URL/timestamp/summary) to every proposal — never
fabricated, always defaulted safely when a provider (e.g. the Phase 4
mock) doesn't supply per-source evidence.

The architecture is unchanged:

```
EvolutionEngine -> researchProvider -> existing research services
                 -> normalized evidence -> deterministic analyzer
                 -> proposal -> approval gate
```

Research success never implies approval: the session permission gate and
the explicit `approveProposal(proposalId)` call are both still required,
regardless of how much evidence was found (see
`test/research-provider.test.js`, test 20).

## Safety

- Read-only only: every adapter only ever calls an existing service
  function and reads plain fields off its JSON response. Nothing fetched
  is ever `eval`'d, `require`'d, written to disk, or shelled out to
  (test 21).
- Only `https://` URLs are ever surfaced in a normalized result or
  proposal provenance (test 21b).
- Evidence text is bounded to 2000 characters before being stored
  (test 14).
- Every source call has an additional, injectable timeout on top of the
  timeout the underlying service already enforces, so a hung/mocked
  service can never hang `research()` (test 9).
- No AI/LLM of any kind is used anywhere in this module.

## Live research test

This sandbox's outbound network is disabled by policy (confirmed via the
egress proxy's `x-deny-reason: host_not_allowed` header on both
`en.wikipedia.org` and `www.wikidata.org`), so a real end-to-end network
call could not be executed here:

```
LIVE RESEARCH TEST: BLOCKED BY ENVIRONMENT
```

All 27 Phase 5 test assertions in `test/research-provider.test.js` are
fully deterministic and mock every source at the `wikipediaService` /
`dataSourcesService` injection points — none of them depend on live
network access, and none of them were skipped or weakened to work around
the block. When run somewhere with outbound HTTPS access, no code change
is required — `MultiSourceResearchProvider`'s defaults already
`require("../services/wikipedia")` / `require("../services/dataSources")`
for real.
