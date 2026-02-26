import { v4 as uuid } from 'uuid'
import { db } from '@/lib/memory/db'
import { encrypt, decrypt } from './crypto'
import './schema'

const stmts = {
  upsert: db.prepare(`
    INSERT INTO capability_secrets (id, capability_id, key, encrypted_value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(capability_id, key) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      updated_at = excluded.updated_at
  `),
  getByCapability: db.prepare(
    'SELECT key, encrypted_value FROM capability_secrets WHERE capability_id = ?'
  ),
  delete: db.prepare(
    'DELETE FROM capability_secrets WHERE capability_id = ? AND key = ?'
  ),
  deleteAll: db.prepare(
    'DELETE FROM capability_secrets WHERE capability_id = ?'
  ),
}

export function setSecret(capabilityId: string, key: string, value: string): void {
  const now = Date.now()
  stmts.upsert.run(uuid(), capabilityId, key, encrypt(value), now, now)
}

export function getSecrets(capabilityId: string): Record<string, string> {
  const rows = stmts.getByCapability.all(capabilityId) as Array<{
    key: string
    encrypted_value: string
  }>
  const result: Record<string, string> = {}
  for (const row of rows) {
    try {
      result[row.key] = decrypt(row.encrypted_value)
    } catch (err) {
      console.error(`[secrets] Failed to decrypt key "${row.key}" for capability ${capabilityId}:`, err)
    }
  }
  return result
}

export function deleteSecret(capabilityId: string, key: string): void {
  stmts.delete.run(capabilityId, key)
}

export function deleteAllSecrets(capabilityId: string): void {
  stmts.deleteAll.run(capabilityId)
}
