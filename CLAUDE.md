# JARVIS — Claude Code Project Instructions

## Mission

You are working on the existing JARVIS desktop assistant. Treat this as an existing production-style codebase, not a greenfield project.

The primary rule is: **preserve existing functionality while making targeted, tested improvements.**

## Before changing code

1. Inspect the relevant files and trace the existing flow.
2. Identify the current architecture and dependencies.
3. Search for existing implementations before creating new ones.
4. Reuse existing APIs, IPC channels, services, components, utilities, and styles where possible.
5. Do not assume a file or API exists—verify it.
6. Check package.json and existing scripts before adding dependencies or scripts.

## Non-negotiable preservation rules

- Do NOT delete working features.
- Do NOT replace the whole project with a simplified demo.
- Do NOT rewrite unrelated modules.
- Do NOT silently remove existing APIs or IPC channels.
- Do NOT break STT, TTS, chat, brain/routing, browser, memory, health, multilingual support, commands, or existing UI behavior while working on another feature.
- Preserve existing Electron main/preload/renderer boundaries.
- Preserve existing user data and configuration formats unless a migration is explicitly required.
- Avoid duplicate implementations of the same feature.
- Keep backward compatibility when practical.

## UI rules

- Preserve the current JARVIS Flat UI and multilingual theme unless the task explicitly requests a UI redesign.
- Keep responsive behavior and existing interactions working.
- Do not remove existing panels, controls, voice controls, chat functionality, health functionality, or language controls without explicit instruction.
- Reuse existing CSS variables, components, and design tokens.
- Do not introduce a new UI framework just for a small change.

## Voice / STT / TTS rules

When modifying voice features, trace the complete pipeline:

Microphone → capture → STT → text → routing/brain → response → TTS → audio output

Check both success and failure paths.

Do not hide STT/TTS errors with fake successful responses. Preserve useful diagnostics in logs.

If a provider has a fallback, make the fallback explicit and non-destructive.

## Electron / IPC rules

For IPC changes, inspect both sides:

Renderer → Preload → Main process → service/handler

and the reverse path where applicable.

Whenever adding an IPC channel:
- verify the main-process handler is registered;
- expose only the required preload bridge;
- update the renderer caller;
- handle missing-handler and rejection cases;
- avoid arbitrary unrestricted IPC exposure.

## Multilingual rules

JARVIS supports multilingual interaction. Do not hard-code English-only behavior into shared chat, voice, UI, or response pipelines.

Preserve Unicode correctly. Avoid lossy conversions and encoding assumptions.

When changing language detection or responses, test at least:
- English
- Hindi
- Hindi written in Roman/Latin script
- mixed Hindi + English where relevant

## Memory / context rules

If memory or conversation context is modified:
- distinguish current-turn context from persistent memory;
- do not store every message as long-term memory;
- retrieve only relevant context;
- preserve existing memory data;
- avoid exposing private/internal memory data unnecessarily.

## Browser / external services

Reuse existing browser and service integrations before adding alternatives.

Never hard-code API keys, passwords, tokens, or private credentials.

Use environment/configuration placeholders and document required configuration.

## Dependencies

Do not add a dependency unless it is necessary.

Before adding one:
1. Check whether an existing dependency already provides the capability.
2. Check Node/Electron compatibility.
3. Update package.json and lockfile consistently.
4. Explain why the dependency is needed.

## Error handling

Prefer root-cause fixes over workarounds.

Do not catch an error and ignore it.

Errors should provide enough diagnostic information to identify:
- module
- operation
- request/flow
- underlying error

Avoid logging secrets or sensitive user data.

## Testing requirement

After every meaningful change:
1. Run the smallest relevant test/check first.
2. Run existing project tests where practical.
3. Run lint/type/syntax checks when available.
4. Verify package scripts.
5. For UI changes, verify the affected renderer path.
6. For STT/TTS/IPC changes, test the end-to-end path where possible.

If a test cannot run because of the environment, report the exact reason instead of claiming success.

## Change discipline

For each task:
- State what you inspected.
- Make the smallest safe change.
- Verify the change.
- Check for regressions.
- Summarize modified files and why.

Do not create unnecessary documentation or duplicate code.

## Project-specific workflow

When the user gives a multi-phase task:
- Work only on the current phase.
- Complete and verify that phase before moving to the next.
- Keep the project runnable after each phase.
- Do not pretend a phase is complete if required verification failed.
- Preserve all previous phases.

## Security

Never commit:
- API keys
- access tokens
- passwords
- private certificates
- personal secrets

Review new file paths and external commands before adding them.

## Final response format

At the end of a task, report:

### Changed
- files changed
- what changed

### Verified
- commands/tests run
- result

### Notes
- known limitations
- anything the user must configure or test manually

Be concise and factual.