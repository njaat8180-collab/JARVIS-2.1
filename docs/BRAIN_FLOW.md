# JARVIS PRO MAX — Brain Flow

## Target Pipeline

```text
User Input
   ↓
Normalization
   ↓
Intent Detection
   ↓
Context / Memory
   ↓
Brain
   ↓
Reasoning
   ↓
Decision
   ↓
Planning
   ↓
Action / Browser / Memory / Response
   ↓
Response
```

## Intent

Classifies what the user wants.

Examples:
- open application
- search web
- remember information
- retrieve memory
- calculate
- ask general question
- browser task

Intent should not directly perform privileged actions.

## Brain

Coordinates:
- intent
- context
- available capabilities
- response strategy

Brain should not contain every implementation detail.

## Reasoning

Evaluates:
- context
- alternatives
- prerequisites
- constraints

## Decision

Selects the intended safe operation.

## Planning

Creates ordered steps for multi-step tasks.

## Action

Executes validated actions.

## Response

Normalizes outcome for:
- UI
- TTS
- logs where appropriate

## Rules

- Keep classification separate from execution.
- Do not let natural-language text become an arbitrary shell command.
- Prefer structured internal representations.
- Preserve user intent while validating unsafe/invalid operations.
- Return useful errors rather than throwing uncontrolled exceptions.
