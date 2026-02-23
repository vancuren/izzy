import { db } from './db'

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('short_term', 'long_term')),
      tags TEXT NOT NULL DEFAULT '[]',
      priority REAL NOT NULL DEFAULT 0.5,
      embedding BLOB,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      decay_rate REAL NOT NULL DEFAULT 0.01
    );

    CREATE TABLE IF NOT EXISTS memory_edges (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY (source_id, target_id, relation),
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
    CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
  `)
}

// Auto-init on import
initSchema()
