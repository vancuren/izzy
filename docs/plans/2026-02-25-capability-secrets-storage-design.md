# Capability Secrets & Storage Design

**Date:** 2026-02-25
**Approach:** Minimal — two new SQLite tables, reuse existing builder queue + overlay infrastructure.

## Requirements

1. **Secrets:** Per-capability encrypted secret storage. User provides secrets via secure paste input during capability build (not voice). AES-256-GCM encryption at rest.
2. **Storage:** Per-capability key-value persistent storage. Injected as dict before execution, updates returned alongside response. Host manages persistence in SQLite.

## 1. Database Schema

Two new tables in existing SQLite DB:

```sql
CREATE TABLE IF NOT EXISTS capability_secrets (
  id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  key TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(capability_id, key),
  FOREIGN KEY (capability_id) REFERENCES capabilities(id)
);

CREATE TABLE IF NOT EXISTS capability_storage (
  id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(capability_id, key),
  FOREIGN KEY (capability_id) REFERENCES capabilities(id)
);
```

**Encryption:**
- Env var `IZZY_SECRET_KEY` — auto-generate and persist to `.env.local` if not set
- AES-256-GCM via Node `crypto` module (no new deps)
- Format: `iv:ciphertext:authTag` (base64)
- Decryption only at execution time

## 2. Builder Queue — `secret_request` Message Type

New builder tool: `request_secret(name, description)`
- Pushes `{ msg_type: 'secret_request', payload: { name, description } }` to builder_queue
- Client shows secure paste input in BuilderOverlay
- User pastes, submits to `POST /api/capabilities/secrets`
- Server encrypts, stores, pushes `answer` back to builder_queue
- Builder continues

Schema change: add `'secret_request'` and `'secret_response'` to builder_queue msg_type CHECK.

## 3. Capability Execution — Injecting Secrets & Storage

**Signature change:** `def run(args: dict) -> str` → `def run(args: dict, context: dict) -> dict`

```python
context = {
    'secrets': { 'API_KEY': 'decrypted_value' },
    'storage': { 'key': 'value' },
}

# Return format:
return {
    'response': 'Conversational string',
    'storage': { 'key': 'updated_value' },
}
```

**Backward compat:** Plain string return still works. Executor checks type.

**Execution flow:**
1. Load + decrypt secrets for capability
2. Load storage KV pairs for capability
3. Pass as `context` dict (second arg)
4. After execution: upsert returned `storage` updates
5. Return `response` string

## 4. UI — Secret Input in BuilderOverlay

When `secret_request` SSE message arrives:
- BuilderOverlay renders masked password input + label + description
- "Save" button submits to `POST /api/capabilities/secrets`
- Input clears on success, builder resumes
- Sequential (one secret at a time)
- Styled with existing CSS variable system

## 5. Builder System Prompt & Convention Updates

Builder prompt additions:
- Use `request_secret` for API keys (never `ask_user` for secrets)
- Access secrets via `context['secrets']['NAME']`
- Use `context['storage']` for persistence between runs
- Return `{'response': '...', 'storage': {...}}` to save state

`register_capability` gets `required_secrets` field:
```json
{ "required_secrets": [{ "name": "API_KEY", "description": "..." }] }
```

Stored on capability record + manifest.json for validation at execution time.
