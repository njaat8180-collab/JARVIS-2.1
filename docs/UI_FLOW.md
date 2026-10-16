# JARVIS PRO MAX — UI Flow

## User Input

```text
User
 ↓
UI
 ↓
Renderer
 ↓
Chat/Voice API
 ↓
Application Pipeline
```

## Response

```text
Application Pipeline
 ↓
Normalized Response
 ↓
Renderer
 ↓
Chat UI
 ↓
Optional TTS
```

## UI Responsibilities

- render chat messages
- render status
- render loading/busy states
- show errors safely
- display voice state
- display module health
- maintain chat history presentation

## UI Must Not

- execute arbitrary Node.js code
- hold API secrets
- directly access filesystem
- directly execute shell commands
- contain core business logic
- duplicate Brain/Intent logic

## Chat History

Each message should have a consistent internal representation where practical:

```js
{
  role: "user | assistant | system",
  content: "...",
  timestamp: "..."
}
```

Do not force this exact shape onto existing APIs without checking compatibility.

## UI Reliability

- renderer exceptions should be visible in diagnostics
- failed optional services should show meaningful status
- chat should remain usable when unrelated modules fail
- avoid duplicate event handlers
- avoid repeated DOM subscriptions on re-render
