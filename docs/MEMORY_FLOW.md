# JARVIS PRO MAX — Memory Flow

## Save

```text
User
 ↓
Memory Intent Detection
 ↓
Memory Manager
 ↓
Validation
 ↓
Persistent Storage
```

## Retrieve

```text
User Query
 ↓
Memory Intent / Context Need
 ↓
Memory Search
 ↓
Relevant Records
 ↓
Context Injection
 ↓
Brain / ChatEngine
```

## Forget

```text
User Request
 ↓
Memory Manager
 ↓
Exact/validated target selection
 ↓
Delete/disable record
 ↓
Confirmation
```

## Memory Requirements

- Do not fabricate memories.
- Do not retrieve unrelated records just to fill context.
- Avoid duplicate memory entries where practical.
- Support explicit forget/delete operations.
- Handle storage errors gracefully.
- Do not block normal chat if memory is temporarily unavailable.
- Keep memory APIs documented.

## Privacy

Do not automatically store:
- passwords
- API keys
- authentication tokens
- highly sensitive secrets

unless the project owner explicitly defines a secure mechanism and policy.

## Test Cases

1. Save a simple preference/fact.
2. Retrieve it in a later message.
3. Retrieve with different natural wording.
4. Forget it.
5. Confirm it is no longer returned.
6. Restart application and verify persistence if persistence is enabled.
7. Simulate storage failure and confirm chat remains usable.
