# JARVIS PRO MAX — Repair Roadmap

## Phase 0 — Backup and Freeze
Status: COMPLETE

- preserve current project
- establish repair copy
- freeze baseline
- record known errors

## Phase 1 — Preload + IPC
Status: NEXT

- preload loading
- contextBridge
- DiagnosticsAPI
- IPC channels
- duplicate APIs
- renderer/main communication
- security boundary

Exit criteria:
- preload loads without critical error
- bridge is available
- IPC smoke tests pass

## Phase 2 — SystemController + Load Order

- correct file paths
- script order
- module registration
- initialization lifecycle
- health checks

Exit criteria:
- complete startup without critical load errors

## Phase 3 — ChatEngine

- reproduce undefined `.bind()`
- fix root cause
- verify constructor dependencies
- verify message flow
- verify history integration

Exit criteria:
- text chat works without critical console errors

## Phase 4 — AgentManager

- registration
- dependency resolution
- ChatEngine
- SelfLearningAgent
- startup ordering

Exit criteria:
- no unexpected missing-agent warnings

## Phase 5 — Voice/STT

- microphone
- sherpa-onnx (sherpaSTT.js, replaced Vosk)
- transcript
- wake word
- duplicate listeners
- error recovery

Exit criteria:
- spoken command reaches intended command pipeline exactly once

## Phase 6 — TTS

- Piper
- SAPI fallback
- queue
- stop/recovery

Exit criteria:
- responses speak reliably or fail gracefully

## Phase 7 — Intelligence Pipeline

- Intent
- Brain
- Reasoning
- Decision
- Planning
- Action

Exit criteria:
- representative commands route correctly

## Phase 8 — Memory

- save
- retrieve
- forget
- persistence
- context

Exit criteria:
- memory tests pass

## Phase 9 — Browser

- browser intent
- parser
- planner
- execution
- session
- recovery

Exit criteria:
- representative browser tasks pass

## Phase 10 — UI + Chat History

- user messages
- assistant messages
- timestamps
- voice transcripts
- persistence
- reload

Exit criteria:
- UI reflects actual application state

## Phase 11 — Diagnostics

- module health
- errors
- degraded states
- safe recovery

Exit criteria:
- module failure is visible and isolated where practical

## Phase 12 — Full Regression

Test:
- boot
- text
- voice
- TTS
- memory
- browser
- actions
- IPC
- UI
- error recovery

Exit criteria:
- no known P0 errors
- no unexplained startup errors
- critical workflows pass

## Phase 13 — Optimization

Only after correctness:
- cleanup
- duplicate removal
- performance
- memory leaks
- startup time
- packaging
- security review

## Phase Rule

Do not declare a phase complete without its exit criteria.
