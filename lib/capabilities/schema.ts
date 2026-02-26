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

    CREATE TABLE IF NOT EXISTS capability_secrets (
      id TEXT PRIMARY KEY,
      capability_id TEXT NOT NULL,
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(capability_id, key),
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS capability_storage (
      id TEXT PRIMARY KEY,
      capability_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(capability_id, key),
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_capability_secrets_cap ON capability_secrets(capability_id);
    CREATE INDEX IF NOT EXISTS idx_capability_storage_cap ON capability_storage(capability_id);
  `)

  // Migrate builder_queue to support secret_request/secret_response msg types
  // SQLite can't ALTER CHECK constraints, so we recreate if needed
  try {
    // Probe: if INSERT succeeds the CHECK constraint already allows the new
    // msg_type values, so we DELETE the probe row and skip migration.
    // If INSERT throws (CHECK fails), no row is committed and the catch
    // block performs the full table recreation inside a transaction.
    db.exec(`
      INSERT INTO builder_queue (id, build_id, direction, msg_type, payload, read, created_at)
      VALUES ('__migration_test__', '__test__', 'to_user', 'secret_request', '{}', 1, 0)
    `)
    db.exec(`DELETE FROM builder_queue WHERE id = '__migration_test__'`)
  } catch {
    // CHECK constraint failed — need to migrate
    db.exec(`
      BEGIN;
      ALTER TABLE builder_queue RENAME TO builder_queue_old;
      CREATE TABLE builder_queue (
        id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('to_user', 'to_builder')),
        msg_type TEXT NOT NULL CHECK(msg_type IN ('question', 'answer', 'progress', 'complete', 'error', 'secret_request', 'secret_response')),
        payload TEXT NOT NULL DEFAULT '{}',
        read INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      INSERT INTO builder_queue SELECT * FROM builder_queue_old;
      DROP TABLE builder_queue_old;
      CREATE INDEX IF NOT EXISTS idx_builder_queue_build ON builder_queue(build_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_builder_queue_unread ON builder_queue(build_id, direction, read);
      COMMIT;
    `)
  }
}

// Auto-init on import
initCapabilitySchema()
