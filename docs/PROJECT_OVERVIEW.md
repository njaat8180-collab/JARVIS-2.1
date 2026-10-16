# JARVIS PRO MAX — Project Overview

## 1. Purpose

JARVIS PRO MAX is a modular desktop AI assistant built with Electron, Node.js, and JavaScript.

The project aims to provide a reliable assistant that can:
- understand text and voice commands
- execute safe desktop/system actions
- control supported applications
- perform browser tasks
- maintain useful persistent memory
- speak responses
- operate offline for supported capabilities
- use online AI only where configured/needed
- recover gracefully from individual subsystem failures

## 2. Primary Goals

### Reliability
JARVIS must remain usable even when an optional subsystem fails.

### Modularity
Each capability should have a clear responsibility and API.

### Security
Privileged operations stay in the Electron main process and are exposed through a controlled preload bridge.

### Offline Capability
Core commands, supported STT, and supported TTS should work without internet when the required local components are available.

### Natural Interaction
Users should be able to express commands naturally rather than memorizing one exact phrase.

### Observability
Startup, health, errors, and module state should be diagnosable.

## 3. Technology

- Electron
- Node.js
- JavaScript
- HTML
- CSS
- sherpa-onnx STT where implemented
- Piper TTS where implemented
- Windows SAPI fallback where implemented
- Existing online AI provider/fallback

## 4. Major Capabilities

1. Chat
2. Voice/STT
3. TTS
4. Intent recognition
5. Brain/context
6. Reasoning
7. Decision
8. Planning
9. Memory
10. System actions
11. Browser automation
12. Diagnostics
13. Chat history
14. Settings/configuration

## 5. Reliability Model

Subsystems should fail independently where practical.

Example:
- Voice unavailable → text chat still works.
- Browser unavailable → memory/chat/system commands still work.
- Online AI unavailable → local commands still work.
- TTS unavailable → response remains visible in UI.

## 6. Development Philosophy

The existing repository is treated as a living system.

Do not rewrite stable modules merely for style.

Prioritize:
1. root-cause diagnosis
2. integration correctness
3. regression safety
4. security
5. maintainability
6. performance optimization

## 7. Current Repair Objective

The immediate objective is to stabilize the existing implementation before adding major new features.

Known historical issues include:
- preload/DiagnosticsAPI initialization
- SystemController loading/path
- ChatEngine undefined `.bind()` dependency
- AgentManager missing module references
- unreliable voice/transcript routing

These must be verified against the current repository before being changed.
