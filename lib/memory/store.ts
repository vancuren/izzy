import { v4 as uuid } from 'uuid'
import { db } from './db'
import './schema'

export interface Memory {
  id: string
  content: string
  tier: 'short_term' | 'long_term'
  tags: string[]
  priority: number
  created_at: number
  last_accessed: number
  decay_rate: number
}

export interface CreateMemoryInput {
  content: string
  tier: 'short_term' | 'long_term'
  tags?: string[]
  priority?: number
  decay_rate?: number
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO memories (id, content, tier, tags, priority, created_at, last_accessed, decay_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM memories WHERE id = ?'),
  search: db.prepare(`
    SELECT * FROM memories
    WHERE tier = ? AND priority > 0.05
    ORDER BY priority DESC, last_accessed DESC
    LIMIT ?
  `),
  searchByTags: db.prepare(`
    SELECT * FROM memories
    WHERE priority > 0.05
    ORDER BY priority DESC, last_accessed DESC
    LIMIT ?
  `),
  updateAccess: db.prepare('UPDATE memories SET last_accessed = ? WHERE id = ?'),
  decay: db.prepare('UPDATE memories SET priority = MAX(0, priority - decay_rate) WHERE priority > 0'),
  promote: db.prepare("UPDATE memories SET tier = 'long_term' WHERE id = ?"),
  insertEdge: db.prepare(`
    INSERT OR REPLACE INTO memory_edges (source_id, target_id, relation, weight)
    VALUES (?, ?, ?, ?)
  `),
  getEdges: db.prepare('SELECT * FROM memory_edges WHERE source_id = ?'),
  getAll: db.prepare('SELECT * FROM memories WHERE priority > 0.05 ORDER BY priority DESC'),
}

export function createMemory(input: CreateMemoryInput): Memory {
  const now = Date.now()
  const id = uuid()
  const memory: Memory = {
    id,
    content: input.content,
    tier: input.tier,
    tags: input.tags ?? [],
    priority: input.priority ?? 0.5,
    created_at: now,
    last_accessed: now,
    decay_rate: input.decay_rate ?? (input.tier === 'short_term' ? 0.02 : 0.005),
  }

  stmts.insert.run(
    memory.id,
    memory.content,
    memory.tier,
    JSON.stringify(memory.tags),
    memory.priority,
    memory.created_at,
    memory.last_accessed,
    memory.decay_rate,
  )

  return memory
}

export function getMemory(id: string): Memory | null {
  const row = stmts.getById.get(id) as any
  if (!row) return null
  stmts.updateAccess.run(Date.now(), id)
  return { ...row, tags: JSON.parse(row.tags) }
}

export function searchMemories(opts: { tier?: string; tags?: string[]; limit?: number }): Memory[] {
  const limit = opts.limit ?? 10
  let rows: any[]

  if (opts.tier) {
    rows = stmts.search.all(opts.tier, limit) as any[]
  } else {
    rows = stmts.searchByTags.all(limit) as any[]
  }

  // Tag-based filtering in JS (simple for now, replace with FTS later)
  if (opts.tags && opts.tags.length > 0) {
    rows = rows.filter((row) => {
      const memTags: string[] = JSON.parse(row.tags)
      return opts.tags!.some((t) => memTags.includes(t))
    })
  }

  return rows.map((row) => ({ ...row, tags: JSON.parse(row.tags) }))
}

export function getRelevantMemories(keywords: string[], limit = 5): Memory[] {
  const all = stmts.getAll.all() as any[]
  const scored = all.map((row) => {
    const tags: string[] = JSON.parse(row.tags)
    const contentLower = row.content.toLowerCase()
    let score = row.priority

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      if (tags.some((t) => t.toLowerCase().includes(kwLower))) score += 0.3
      if (contentLower.includes(kwLower)) score += 0.2
    }

    // Recency boost
    const ageHours = (Date.now() - row.last_accessed) / (1000 * 60 * 60)
    score += Math.max(0, 1 - ageHours / 24) * 0.2

    return { ...row, tags, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export function addEdge(sourceId: string, targetId: string, relation: string, weight = 1.0) {
  stmts.insertEdge.run(sourceId, targetId, relation, weight)
}

export function decayMemories() {
  stmts.decay.run()
}

export function promoteMemory(id: string) {
  stmts.promote.run(id)
}
