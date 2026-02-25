import { v4 as uuid } from 'uuid'
import { db } from '@/lib/memory/db'
import '@/lib/capabilities/schema'
import type { QueueMessage, QueueDirection, QueueMessageType } from './types'

const stmts = {
  push: db.prepare(`
    INSERT INTO builder_queue (id, build_id, direction, msg_type, payload, read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `),
  poll: db.prepare(`
    SELECT * FROM builder_queue
    WHERE build_id = ? AND direction = ? AND read = 0
    ORDER BY created_at ASC
  `),
  markRead: db.prepare(`
    UPDATE builder_queue SET read = 1 WHERE id = ?
  `),
}

export function pushMessage(
  buildId: string,
  direction: QueueDirection,
  msgType: QueueMessageType,
  payload: Record<string, unknown>,
): QueueMessage {
  const id = uuid()
  const now = Date.now()
  stmts.push.run(id, buildId, direction, msgType, JSON.stringify(payload), now)
  return { id, build_id: buildId, direction, msg_type: msgType, payload, read: false, created_at: now }
}

export function pollMessages(buildId: string, direction: QueueDirection): QueueMessage[] {
  const rows = stmts.poll.all(buildId, direction) as Record<string, unknown>[]
  return rows.map((r) => {
    stmts.markRead.run(r.id)
    return {
      id: r.id as string,
      build_id: r.build_id as string,
      direction: r.direction as QueueDirection,
      msg_type: r.msg_type as QueueMessageType,
      payload: JSON.parse(r.payload as string),
      read: true,
      created_at: r.created_at as number,
    }
  })
}

export function peekMessages(buildId: string, direction: QueueDirection): QueueMessage[] {
  const rows = stmts.poll.all(buildId, direction) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as string,
    build_id: r.build_id as string,
    direction: r.direction as QueueDirection,
    msg_type: r.msg_type as QueueMessageType,
    payload: JSON.parse(r.payload as string),
    read: false,
    created_at: r.created_at as number,
  }))
}
