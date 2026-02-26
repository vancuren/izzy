import { v4 as uuid } from 'uuid'
import { db } from '@/lib/memory/db'
import './schema'

const stmts = {
  upsert: db.prepare(`
    INSERT INTO capability_storage (id, capability_id, key, value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(capability_id, key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `),
  getByCapability: db.prepare(
    'SELECT key, value FROM capability_storage WHERE capability_id = ?'
  ),
  delete: db.prepare(
    'DELETE FROM capability_storage WHERE capability_id = ? AND key = ?'
  ),
  deleteAll: db.prepare(
    'DELETE FROM capability_storage WHERE capability_id = ?'
  ),
}

export function getStorage(capabilityId: string): Record<string, unknown> {
  const rows = stmts.getByCapability.all(capabilityId) as Array<{
    key: string
    value: string
  }>
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value)
    } catch {
      result[row.key] = row.value
    }
  }
  return result
}

export function setStorage(capabilityId: string, updates: Record<string, unknown>): void {
  const now = Date.now()
  for (const [key, value] of Object.entries(updates)) {
    stmts.upsert.run(uuid(), capabilityId, key, JSON.stringify(value), now, now)
  }
}

export function deleteStorageKey(capabilityId: string, key: string): void {
  stmts.delete.run(capabilityId, key)
}

export function deleteAllStorage(capabilityId: string): void {
  stmts.deleteAll.run(capabilityId)
}
