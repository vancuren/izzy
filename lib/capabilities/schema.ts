import { db } from '@/lib/memory/db'

export function initCapabilitySchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS capabilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('building', 'active', 'failed', 'disabled')),
      input_schema TEXT NOT NULL DEFAULT '{}',
      output_schema TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS builder_queue (
      id TEXT PRIMARY KEY,
      build_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('to_user', 'to_builder')),
      msg_type TEXT NOT NULL CHECK(msg_type IN ('question', 'answer', 'progress', 'complete', 'error')),
      payload TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_capabilities_status ON capabilities(status);
    CREATE INDEX IF NOT EXISTS idx_capabilities_name ON capabilities(name);
    CREATE INDEX IF NOT EXISTS idx_builder_queue_build ON builder_queue(build_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_builder_queue_unread ON builder_queue(build_id, direction, read);
  `)
}

// Auto-init on import
initCapabilitySchema()
