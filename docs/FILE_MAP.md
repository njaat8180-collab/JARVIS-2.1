# JARVIS PRO MAX — File Map

> This document is a living map. Verify actual filenames and paths against the repository before editing.

## Core

| File/Area | Responsibility |
|---|---|
| `main.js` | Electron main process, lifecycle, privileged orchestration |
| `preload.js` | Secure contextBridge/IPC renderer bridge |
| `index.html` | Renderer entry point/UI shell |
| `package.json` | Dependencies, scripts, project metadata |

## Renderer/UI

Typical responsibilities:
- chat UI
- message rendering
- UI state
- settings
- status/diagnostics presentation

Do not assume exact filenames without inspecting the repository.

## Chat

Typical responsibility:
- ChatEngine
- conversation state
- user/assistant message flow
- response normalization
- chat history integration

Known historical file:
- `chat.js`

## Intelligence

Possible/known logical modules:
- Brain Controller
- Intent Engine
- Reasoning Agent
- Decision Agent
- Planning Agent

Inspect actual filenames before modification.

## Agents

Possible modules:
- AgentManager
- SelfLearningAgent
- Memory Manager Agent
- Action Agent
- other specialized agents

## Voice

Possible modules:
- `voice.js`
- sherpa-onnx integration (sherpaSTT.js, replaces Vosk)
- audio capture
- wake-word handling
- transcript routing

## TTS

Possible:
- Piper
- SAPI fallback
- TTS engine/queue

## Memory

Responsibilities:
- save
- retrieve
- forget
- persistence
- context injection

Implementation note:
- `src/utils/atomicJson.js` provides the shared JSON persistence primitive
  used by assistant tasks, user data, evolution state, Ollama settings,
  XTTS settings, and consciousness state. `src/ai/memory.js` keeps an
  equivalent local writer to preserve its dependency-free contract.

## Browser

Known logical areas from the project history:
- BrowserParser
- browserSession
- BrowserAgent
- browserMultiSearch
- browserMemory
- browserKnowledge
- browserPlanner
- browserExecution
- BrowserBrain

## System

- SystemController
- diagnostics
- health monitoring
- module registry

## Rules for Updating This File

When a file's primary responsibility changes:
1. update this document
2. search all references
3. test dependent modules
4. record the change in CHANGELOG.md

Never use this file as proof that a file exists. The repository is authoritative.
