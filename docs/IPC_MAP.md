# JARVIS PRO MAX — IPC Map

## Purpose

This document defines the contract between renderer, preload, and main process.

## Security Boundary

```text
Renderer
   |
   v
preload.js / contextBridge
   |
   v
validated IPC
   |
   v
main.js / privileged services
```

The renderer must not bypass preload for privileged operations.

## IPC Contract Template

For every channel, document:

```text
Name:
Direction:
Purpose:
Input:
Output:
Validation:
Error behavior:
Owner:
```

## Current Known IPC Areas

The exact channel names must be discovered from the current repository before changing them.

Expected logical areas include:
- chat
- voice status
- TTS
- system/application actions
- browser actions
- memory
- diagnostics
- settings
- health status

## Rules

1. Do not create a new channel if an existing channel already performs the same function.
2. Search the entire repository before renaming a channel.
3. Validate incoming data.
4. Return predictable success/error structures where appropriate.
5. Do not expose raw `ipcRenderer` to the renderer.
6. Do not expose unrestricted Node APIs.
7. Keep privileged execution in the main process.
8. Document new/changed channels here.
9. Remove obsolete channels only after all callers are migrated and tested.
10. Never solve an IPC problem by disabling Electron security controls.

## Recommended Result Shape

Where practical:

```js
{
  ok: true,
  data: ...
}
```

or

```js
{
  ok: false,
  error: {
    code: "...",
    message: "..."
  }
}
```

Do not impose this shape on an existing stable API without checking its callers first.

## Diagnostics API

Historical issue:
`DiagnosticsAPI is not defined`

Before changing it:
- locate the definition
- locate every reference
- determine whether it belongs in preload, main, or renderer
- verify initialization order
- verify export/exposure
- test the complete call path
