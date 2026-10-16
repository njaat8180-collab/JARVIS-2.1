# JARVIS PRO MAX — Test Plan

## 1. Static Checks

- JavaScript syntax check
- dependency check
- missing file check
- duplicate script reference check
- duplicate global/API check

## 2. Boot Test

Run the project using its configured start command.

Verify:
- Electron launches
- preload loads
- renderer loads
- SystemController loads
- modules register
- health check completes
- no P0 errors

## 3. IPC Smoke Test

Test:

```text
Renderer
→ preload
→ IPC
→ main
→ handler
→ response
→ renderer
```

Verify invalid input is rejected safely.

## 4. Chat Test

Inputs:
- Hello
- normal question
- command
- invalid command

Verify:
- message appears
- response appears
- no duplicate messages
- no uncaught exception

## 5. Voice Test

Test:
- start listening
- stop listening
- speech
- silence
- partial transcript
- final transcript
- repeated start/stop

Verify each final command is delivered once.

## 6. TTS Test

Test:
- short response
- long response
- repeated response
- stop
- fallback
- TTS failure

## 7. Intent/Brain Test

Representative commands:
- open supported application
- calculate
- tell time/date
- memory command
- browser search
- general chat

Verify correct routing.

## 8. Memory Test

- save
- retrieve
- alternate wording
- forget
- restart persistence
- storage failure

## 9. Browser Test

- open URL
- search
- navigate
- multi-step operation
- invalid target
- timeout
- recovery

## 10. UI Test

- send message
- render response
- voice state
- loading state
- error state
- history
- reload

## 11. Failure Isolation Test

Simulate:
- voice unavailable
- TTS unavailable
- browser unavailable
- memory unavailable
- online AI unavailable

Expected:
- JARVIS continues operating with remaining capabilities.

## 12. Regression Rule

Every bug fix must rerun:
1. focused test
2. affected module test
3. relevant end-to-end workflow

## 13. Release Gate

Release only if:
- no unresolved P0 errors
- no startup crash
- IPC security boundary intact
- representative voice/text workflows pass
- memory and browser tests pass
- no new critical regression
