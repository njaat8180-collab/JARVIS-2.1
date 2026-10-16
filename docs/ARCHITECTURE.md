# JARVIS PRO MAX — Architecture

## 1. Logical Architecture

```text
                    JARVIS PRO MAX
                          |
             +------------+------------+
             |                         |
           Voice                      UI
             |                         |
            STT                      Renderer
             |                         |
             +----------> ChatEngine <+
                           |
                         Intent
                           |
                         Brain
                           |
                       Reasoning
                           |
                        Decision
                           |
                        Planning
                           |
              +------------+------------+
              |            |            |
            Memory       Action       Browser
              |            |            |
              +------------+------------+
                           |
                        Response
                           |
                    +------+------+
                    |             |
                   UI            TTS
```

## 2. Electron Architecture

```text
Renderer
   |
   | window.jarvis / controlled API
   v
preload.js
   |
   | validated IPC
   v
main.js
   |
   +--> system services
   +--> filesystem operations
   +--> process/application operations
   +--> other privileged capabilities
```

## 3. Responsibility Boundaries

### Renderer/UI
Owns:
- display
- user interaction
- visual state
- chat presentation

Does not own:
- secrets
- unrestricted filesystem access
- privileged process execution

### Preload
Owns:
- secure API exposure
- IPC wrapper functions
- minimal bridge logic

Does not own:
- business logic
- full application orchestration

### Main Process
Owns:
- Electron lifecycle
- privileged operations
- IPC handlers
- secure access to OS resources

### ChatEngine
Owns:
- conversation orchestration
- coordinating user input and response pipeline
- presenting normalized responses to UI

### Intelligence Pipeline
Intent → Brain → Reasoning → Decision → Planning.

### Action
Executes approved, validated actions.

### Browser
Owns browser-specific behavior.

### Memory
Owns persistence and retrieval.

### Voice
Owns audio capture and STT lifecycle.

### TTS
Owns speech generation and playback.

### SystemController
Owns module registration, boot order, lifecycle, and health coordination.

## 4. Dependency Direction

Prefer dependencies flowing toward stable interfaces.

Avoid:
- circular dependencies
- UI importing privileged internals
- Action importing UI
- Browser directly manipulating chat UI
- Voice directly executing arbitrary actions

## 5. Initialization

Target:

```text
Electron start
  ↓
Main process ready
  ↓
Preload loaded
  ↓
Renderer loaded
  ↓
SystemController
  ↓
Register modules
  ↓
Initialize modules
  ↓
Health check
  ↓
JARVIS ONLINE
```

## 6. Failure Isolation

Every module should expose failure state where practical.

A single module failure should not unnecessarily terminate the application.

## 7. Architecture Change Rule

Any structural change must be:
- documented
- tested
- reflected in FILE_MAP/IPC_MAP where applicable
- compatible with security boundaries
