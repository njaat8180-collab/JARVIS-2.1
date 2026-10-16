# JARVIS PRO MAX — Browser Flow

## Target Pipeline

```text
User
 ↓
Intent
 ↓
BrowserBrain
 ↓
BrowserParser
 ↓
BrowserPlanner
 ↓
BrowserExecution
 ↓
Browser
 ↓
Result
 ↓
Response
```

## Existing Logical Components

Project history includes:
- BrowserParser
- browserSession
- BrowserAgent
- BrowserMultiSearch
- browserMemory
- browserKnowledge
- browserPlanner
- browserExecution
- BrowserBrain

Verify actual current filenames and APIs before editing.

## Responsibilities

### BrowserBrain
Understands browser-oriented intent and context.

### BrowserParser
Normalizes browser instructions.

### BrowserPlanner
Creates safe ordered steps.

### BrowserExecution
Performs browser operations.

### BrowserSession
Maintains browser state where required.

### BrowserMemory/Knowledge
Provides browser-specific context where implemented.

## Rules

- Browser code should not directly manipulate the chat UI.
- Browser actions must be validated.
- Browser failures should return structured results.
- Avoid uncontrolled loops.
- Respect navigation and timeout limits.
- Do not execute arbitrary downloaded code.
- Do not expose browser internals to untrusted renderer code.

## Test Cases

- open a URL
- search
- navigate
- multi-step task
- failed navigation
- timeout
- invalid target
- session recovery
