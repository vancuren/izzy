import Database from 'better-sqlite3'

declare global {
  var __db: ReturnType<typeof Database> | undefined
}

function createDb() {
  const db = new Database(process.env.DB_PATH ?? 'data/izzy.db')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export const db = globalThis.__db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db = db
}
