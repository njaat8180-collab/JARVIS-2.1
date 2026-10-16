# JARVIS repair checkpoint — 11 October 2026

## Release decision

**Development build verified; NOT production-ready. The full master brief is not complete.**

This checkpoint preserves the existing application and its appearance. It fixes test isolation, regression discovery, document verification, account/session security, and task execution limits. It also verifies actual source and packaged Electron startup and a live provider-backed document workflow.

No claim is made that every source file or privileged IPC handler has received a complete security review. Existing historical completion documents are not evidence that the current master brief is finished.

## Changes

| Files | Change and purpose |
|---|---|
| `package.json` | Default test command discovers every `test/*.test.js` file, including previously omitted IPC, documents, Lab, voice interruption, and provider tests. |
| `test/helpers/isolated-user-storage.js`, `test/user-system*.test.js` | Legacy account tests now use unique temporary databases, including their simulated module reload. They no longer create test accounts in `src/database`. |
| `test/knowledge-chain.test.js` | Serialize shared-state async tests and await completion before reporting results; previously an assertion could fail after a zero-failure summary. |
| `renderer/js/labEngine.js`, `test/lab-engine.test.js` | Clearly label built-in exercises; retain interactive projects and test their actual code/preview availability instead of requiring an obsolete template identifier. |
| `src/assistant/taskVerifier.js`, `test/task-verifier.test.js` | Parse PDF pages, extract DOCX text, and validate populated XLSX workbooks. Reject counterfeit PDF/DOCX output, escaped real paths, and files over a 64 MiB automatic-verification limit. Existing PPTX slide/CRC checks retained. |
| `main.js` | Include actual PDF and spreadsheet output directories in task verification; derive role-change and account-merge authority from the active unlocked administrator rather than a renderer-supplied actor ID. |
| `src/users/userManager.js`, `test/user-security.test.js` | Remove PIN hashes from account-list, active-account and account-switch responses. Activity cannot unlock a locked/expired session. Reinitialization preserves locks; a saved PIN account starts locked. |
| `src/assistant/taskExecutor.js`, `test/task-budgets.test.js` | Reject plans exceeding 32 steps and invalid continuation positions. Bound execution to three minutes by default (trusted dependency override capped at five minutes). Signal cooperative cancellation and stop issuing subsequent actions. Never automatically retry a timed-out operation. |
| `scripts/verify-packaged-runtime.js` | Launch the actual development executable with an isolated profile, assert renderer/bridge readiness and absence of Node require, capture a screenshot, and close the launched instance. |

Cancellation cannot forcibly undo an already-issued OS action or stop an adapter that ignores its abort signal. Errors explicitly disclose this uncertainty. The time budget applies to each execution/resume invocation; no global lifetime or token budget is implemented.

## Evidence

Paths below are relative to the project root.

| Verification | Result | Evidence |
|---|---|---|
| Expanded initial regression | 548 pass, 3 fail, 2 skip; also exposed a false-green legacy async assertion | `artifacts/repair-20261011-tests.log` |
| Final full regression | **559 pass, 0 fail, 2 skip** across 561 reported tests | `artifacts/repair-20261011-final-tests.log` |
| Account security and legacy account suites | Passed in temporary storage | `artifacts/repair-20261011-user-security.log`; final regression includes subsequent session tests |
| Bounded tasks and verifier/orchestrator checks | 51 pass at focused check | `artifacts/repair-20261011-task-budgets.log` |
| Source Electron startup and view navigation | Renderer ready; sandbox/contextIsolation true; nodeIntegration false | `artifacts/desktop-verification/runtime-report.json` |
| Live Hinglish text transcript → PPTX | 10 slides, 8 pictures; Minecraft content present | Same runtime report and its recorded output path |
| Live chat → PDF | 4 pages, 4,019 extracted text characters | Same runtime report |
| Live IPC → DOCX | 3,038 extracted text characters | Same runtime report |
| Live IPC → XLSX | 3 sheets, 14 formulas | Same runtime report |
| Updated independent verifier → all four live files | All VERIFIED | `artifacts/repair-20261011-real-file-verification.json` |
| Windows directory build | Builder exited 0 | `artifacts/repair-20261011-build.log` |
| Actual packaged executable startup | Ready; Node require absent; no probe errors | `artifacts/packaged-verification/report.json` and `dashboard.png` |
| Package inspection | Six inspected runtime files match current source; no `.env`, database, or artifacts entries | `artifacts/repair-20261011-package-inspection.json` |
| Dependency audit | 19 findings: 8 high, 11 moderate, 0 critical | `artifacts/repair-20261011-dependency-audit.json` |

Some legacy test files contain their own assertion counters and appear as one Node subtest. The aggregate is the Node test runner's count, not a count of distinct acceptance scenarios.

The two skips require English and Hindi speech recordings. Supplying a transcript to ChatEngine is **not** microphone, wake-word, or speech-recognition verification. PDF parsing is not a visual review of every page. PPTX structure and pictures were verified, but Microsoft PowerPoint automation is unavailable. Excel formula presence does not prove recalculation in desktop Excel.

The source runtime log includes an Edge/SAPI `no speech result` message during probe-driven stopping, and a deprecated ScriptProcessorNode warning. Audible speech and stop/fallback behavior still need a dedicated hardware test. The probe's empty error array does not imply an empty application console.

## Feature completion matrix

WORKING means only the tested scope named here, not every capability in the master prompt.

| Area | Status | Evidence / remaining gap |
|---|---|---|
| Electron startup / core UI | WORKING | Source and packaged runtime probes; actual dashboard screenshot reviewed. Full interaction/accessibility coverage remains partial. |
| Electron isolation / IPC security | PARTIALLY WORKING | Sandbox, context isolation, sender-policy tests, account fixes verified. Complete per-channel authorization/schema review remains open. |
| Multilingual command routing | WORKING | Automated Hindi/Hinglish routing and live noisy Hinglish presentation request. This is text routing. |
| Microphone, wake word, STT | BLOCKED BY EXTERNAL DEPENDENCY | Speech recordings/hardware acceptance absent; local model support is present but not live-tested here. |
| TTS / interruption | PARTIALLY WORKING | Controlled tests pass; live generation appears in logs, but audible and fallback acceptance remains unverified. |
| Sarvam / configurable provider | WORKING | Live content generation completed. Broader health/failure behavior tested with controlled mocks. |
| Ollama | BLOCKED BY EXTERNAL DEPENDENCY | Health check reports installed but server unreachable on localhost:11434. |
| Persistent memory / account data | PARTIALLY WORKING | Persistence, privacy, account and memory regression suites pass. Full retention/export/authorization acceptance remains open. |
| Windows computer control | PARTIALLY WORKING | Existing adapters and controlled tests; no live opening/closing/control acceptance in this checkpoint. |
| Browser automation / research | PARTIALLY WORKING | Existing integration tests and live presentation workflow. No exhaustive real website, form, download, or external-action permission verification. |
| PPTX generation | WORKING | Actual 10-slide deck with images generated and structurally parsed. Existing-PPT editing and native PowerPoint fidelity remain unverified. |
| PDF, DOCX, XLSX generation | WORKING | Real generated artifacts parsed; task verifier strengthened. Arbitrary editing/conversion and visual fidelity remain incomplete. |
| Task agent / verification | PARTIALLY WORKING | Planning/adapters, real-file verification, cancellation and new execution bounds tested. General arbitrary multi-step coding/install workflows are not complete. |
| Coding assistant / prompt maker | PARTIALLY WORKING | Existing Lab/source templates preserved. No verified general project-edit/test/install workflow or full prompt-maker acceptance. |
| Paired mobile control | MISSING | No complete paired companion/authorized ADB implementation verified. |
| Smart-home control | MISSING | No complete authenticated device registry/protocol integration verified. |
| Persistent general scheduling | MISSING | Existing shutdown timer and background-learning scheduling do not satisfy general persistent reminders/recurrence/missed-task recovery. |
| System monitoring | PARTIALLY WORKING | OS diagnostics and dashboard exist. Initial screenshot still shows checking states; complete live metric/error acceptance outstanding. |
| Supervised self-upgrade / rollback | MISSING | Existing JSON recovery and evolution/checkpoint modules do not implement the required external supervisor, isolated upgrade, activation approval, and rollback acceptance. |
| Safe file management | PARTIALLY WORKING | Existing operations and confirmation checks; authorized-root, bulk dry-run, overwrite and archive acceptance need full review. |
| Trusted plugin installation | MISSING | No complete permission-isolated extension lifecycle verified. |
| Performance | PARTIALLY WORKING | Serial tests and bounded tasks; real source startup measured by probe. No controlled before/after benchmark on target 8 GB hardware. |
| Release dependencies | BROKEN | Unresolved audit findings block a production security sign-off. |

## Phase checkpoint

The repository contains earlier implementations spanning all requested phases; their presence is not completion evidence.

- Phases 1–2: architecture sampled and inventory recorded; baseline/changed-file rollback copies and tests available. A comprehensive every-file audit is unfinished.
- Phase 3: source/package startup verified and specific account/IPC defects repaired; complete authorization review remains open.
- Phases 4–7: multilingual/memory/adapter regressions pass; live speech, desktop and browser acceptance remain incomplete.
- Phase 8: all four principal output formats generated through the real app and parsed; editing/conversion/fidelity requirements remain partial.
- Phase 9: execution limits and stronger verification implemented and tested; general autonomous agent acceptance remains partial.
- Phases 10–14: existing features preserved; missing items above still require implementation and verification.
- Phase 15: regression/build smoke checks pass, but production release is blocked.

## Installation, startup and configuration

Development checkout: use a supported Node installation, run `npm ci`, then `npm start`. The checked-in `package-lock.json` pins dependency resolution. This checkpoint did not upgrade dependency versions. Do not apply an automatic force-fix: the audit suggests major migrations and even incompatible downgrades for some packages.

The directory build is `artifacts/repair-20261011-build/win-unpacked/JARVIS.exe`. Keep the **entire win-unpacked directory** together. It is a development package, not an installed or production-certified release. Installer creation, publisher signature verification, clean-machine installation and uninstall remain unverified. Older files in `dist` are unrelated historical builds.

Use the application's provider/settings UI to configure credentials, models, microphone and voice. Do not embed credentials in renderer code or distributable files. Local Ollama must be started independently with an installed configured model. Microsoft PowerPoint is optional; its absence prevents native automation-based preview verification. Source configuration and `.env` files are not included in the package; packaged settings require their own configuration.

Runtime data belongs in Electron userData, not the packaged archive. Test profiles created for verification are under `artifacts/desktop-verification/profile` and `artifacts/packaged-verification/profile`.

Dependency families: Electron/electron-builder for the desktop/build; axios for HTTP; dotenv for source environment configuration; electron-store for settings; JSZip for Office containers; pptxgenjs for presentations; mammoth for Word extraction; pdf-parse for PDF extraction; xlsx for workbook generation/parsing; node-edge-tts for speech; optional Hugging Face/local speech components. Exact declared versions are in package.json and installed resolution in package-lock.json. The audit includes xlsx with no npm remediation offered and Electron/provider-library migrations; those require deliberate compatibility testing.

## Security and permissions

High-impact OS/file actions retain their native confirmation path. Do not treat successful research or model output as action approval. Role/merge handlers now derive the actor in main. These changes are targeted repairs, not a full authentication redesign: access to every other account/data/action channel still needs systematic review.

The packaged-runtime verifier enables a temporary loopback debugging endpoint only for its launched test process. Do not ship or routinely launch a user instance with debugging enabled. It uses an isolated profile and closes its own instance.

File size limits reduce ordinary parser memory usage but are not a complete defense against malicious compressed archives. Do not mark arbitrary untrusted document parsing fully hardened until decompression bounds/worker isolation and dependency remediation are done.

## Rollback

There is no Git repository in this checkout. Existing historical backups were left intact. Files modified during this checkpoint were copied before editing into `artifacts/repair-20261011-baseline`; its `manifest.json` records original file mappings and hashes. New files are identified in `changes.json` beside the manifest.

To roll back these code changes: close JARVIS, preserve any later edits, verify backup hashes, and copy each baseline file to its recorded original project path. New files can remain unused, or be removed after reviewing `changes.json`. Do not replace the database, `.env`, personal settings, or historical backups. Package changes were written to a separate directory; existing `dist` packages were not replaced. This is a manual source rollback, **not** the requested automatic self-upgrade rollback system.

## Exact continuation

1. Read this checkpoint and the master request attachment. Preserve these source changes and existing user data. Run `npm test` as the regression baseline.
2. Finish the IPC map review: derive account identity in main; verify locked sessions, role authority, cross-user reads/edits/deletion and PIN mutation; cover each path with behavioral tests. Avoid treating renderer parameters as authority.
3. Remediate dependency findings using trusted upstream documentation and isolated compatibility tests; preserve lockfile rollback points. Re-run npm audit and source/package smoke tests.
4. Complete hardware voice acceptance using English and Hindi recordings (`WHISPER_TEST_WAV`, `WHISPER_TEST_WAV_HI`) and real microphone/TTS tests. Investigate cancellation fallback log errors; preserve raw/normalized transcripts.
5. Implement a persistent general scheduler and its UI with missed-run/restart tests and execution-time approval for consequential actions.
6. Implement the separate recovery supervisor with verified manifests, isolated candidate testing, explicit activation approval, startup failure recovery, and simulated rollback tests before any live upgrade path.
7. Implement/verify the remaining device, plugin, coding, bulk-file and browser permission workflows rather than labelling unavailable integrations complete.
8. Complete visual document and target-hardware performance checks, then build an installer and test clean installation/uninstallation. Only change the release decision after remaining acceptance criteria pass.

Repeatable checks: `npm test`; `node_modules/.bin/electron scripts/verify-desktop-runtime.js` (append `--documents` only when live provider usage is intended); `node scripts/verify-packaged-runtime.js` after building the directory package. Each probe writes evidence under artifacts.
