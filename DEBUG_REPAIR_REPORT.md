# JARVIS PRO MAX — Debug/Repair Report

## Repairs
- Wikipedia IPC is registered at the earliest Electron-ready stage and remains idempotent.
- Wikipedia IPC channels are included in critical startup verification.
- Wikipedia HTTP response decoding is explicitly UTF-8.
- Wikipedia language is constrained to Hindi/English.
- Wikipedia extract length is bounded.
- Wikipedia routing selects Hindi/English based on the command.
- Added `npm run test:wikipedia`.
- JavaScript syntax validation passes.

## Console note
`αñ...` in a Windows terminal is typical UTF-8 text displayed through a non-UTF-8/OEM code page. If the UI text itself is correct, this is only terminal rendering. Run `chcp 65001` before launching JARVIS for a UTF-8 terminal.

`ScriptProcessorNode is deprecated` is a browser deprecation warning, not a microphone failure. `[object Object]` is an object logging format issue, not a health failure. `Duplicate message prevented` is the duplicate-input guard.
