import { v4 as uuid } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { db } from '@/lib/memory/db'
import './schema'
import type { Capability, CreateCapabilityInput, CapabilityStatus, AnthropicTool } from './types'

const DATA_DIR = path.resolve(process.cwd(), 'data', 'capabilities')

const stmts = {
  insert: db.prepare(`
    INSERT INTO capabilities (id, name, description, version, status, input_schema, output_schema, tags, path, created_at, updated_at)
    VALUES (?, ?, ?, 1, 'building', ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM capabilities WHERE id = ?'),
  getByName: db.prepare('SELECT * FROM capabilities WHERE name = ?'),
  listByStatus: db.prepare('SELECT * FROM capabilities WHERE status = ? ORDER BY name'),
  listAll: db.prepare('SELECT * FROM capabilities ORDER BY created_at DESC'),
  updateStatus: db.prepare('UPDATE capabilities SET status = ?, updated_at = ? WHERE id = ?'),
  updateFull: db.prepare(`
    UPDATE capabilities SET description = ?, input_schema = ?, output_schema = ?, tags = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM capabilities WHERE id = ?'),
  search: db.prepare(`
    SELECT * FROM capabilities
    WHERE status = 'active' AND (name LIKE ? OR description LIKE ?)
    ORDER BY name
    LIMIT ?
  `),
}

function parseRow(row: Record<string, unknown>): Capability {
  return {
    ...(row as unknown as Capability),
    input_schema: JSON.parse(row.input_schema as string),
    output_schema: JSON.parse(row.output_schema as string),
    tags: JSON.parse(row.tags as string),
  }
}

export function createCapability(input: CreateCapabilityInput): Capability {
  const id = uuid()
  const now = Date.now()
  const capPath = path.join(DATA_DIR, id)

  fs.mkdirSync(capPath, { recursive: true })

  const cap: Capability = {
    id,
    name: input.name,
    description: input.description,
    version: 1,
    status: 'building',
    input_schema: input.input_schema ?? {},
    output_schema: input.output_schema ?? {},
    tags: input.tags ?? [],
    path: capPath,
    created_at: now,
    updated_at: now,
  }

  stmts.insert.run(
    id, input.name, input.description,
    JSON.stringify(cap.input_schema),
    JSON.stringify(cap.output_schema),
    JSON.stringify(cap.tags),
    capPath, now, now,
  )

  return cap
}

export function getCapability(id: string): Capability | null {
  const row = stmts.getById.get(id) as Record<string, unknown> | undefined
  return row ? parseRow(row) : null
}

export function getCapabilityByName(name: string): Capability | null {
  const row = stmts.getByName.get(name) as Record<string, unknown> | undefined
  return row ? parseRow(row) : null
}

export function listCapabilities(filter?: { status?: CapabilityStatus }): Capability[] {
  const rows = filter?.status
    ? (stmts.listByStatus.all(filter.status) as Record<string, unknown>[])
    : (stmts.listAll.all() as Record<string, unknown>[])
  return rows.map(parseRow)
}

export function searchCapabilities(query: string, limit = 10): Capability[] {
  const pattern = `%${query}%`
  const rows = stmts.search.all(pattern, pattern, limit) as Record<string, unknown>[]
  return rows.map(parseRow)
}

export function setCapabilityStatus(id: string, status: CapabilityStatus): void {
  stmts.updateStatus.run(status, Date.now(), id)
}

export function updateCapability(
  id: string,
  updates: { description?: string; input_schema?: Record<string, unknown>; output_schema?: Record<string, unknown>; tags?: string[] },
): void {
  const cap = getCapability(id)
  if (!cap) throw new Error(`Capability ${id} not found`)

  stmts.updateFull.run(
    updates.description ?? cap.description,
    JSON.stringify(updates.input_schema ?? cap.input_schema),
    JSON.stringify(updates.output_schema ?? cap.output_schema),
    JSON.stringify(updates.tags ?? cap.tags),
    Date.now(),
    id,
  )
}

export function deleteCapability(id: string): void {
  stmts.delete.run(id)
}

export function saveCapabilityFiles(
  id: string,
  files: { mainPy: string; requirementsTxt: string; manifestJson: string; runMd: string },
): void {
  const cap = getCapability(id)
  if (!cap) throw new Error(`Capability ${id} not found`)

  fs.writeFileSync(path.join(cap.path, 'main.py'), files.mainPy, 'utf-8')
  fs.writeFileSync(path.join(cap.path, 'requirements.txt'), files.requirementsTxt, 'utf-8')
  fs.writeFileSync(path.join(cap.path, 'manifest.json'), files.manifestJson, 'utf-8')
  fs.writeFileSync(path.join(cap.path, 'RUN.md'), files.runMd, 'utf-8')
}

export function loadCapabilityFiles(id: string): { mainPy: string; requirementsTxt: string } {
  const cap = getCapability(id)
  if (!cap) throw new Error(`Capability ${id} not found`)

  return {
    mainPy: fs.readFileSync(path.join(cap.path, 'main.py'), 'utf-8'),
    requirementsTxt: fs.readFileSync(path.join(cap.path, 'requirements.txt'), 'utf-8'),
  }
}

export function capabilityToAnthropicTool(cap: Capability): AnthropicTool {
  return {
    name: `cap_${cap.name}`,
    description: `[Capability] ${cap.description}`,
    input_schema: {
      type: 'object' as const,
      properties: (cap.input_schema.properties as Record<string, unknown>) ?? {},
      required: (cap.input_schema.required as string[]) ?? [],
    },
  }
}
