import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function resolveSecretKey(): Buffer {
  let key = process.env.IZZY_SECRET_KEY
  if (!key) {
    // Auto-generate and persist
    key = crypto.randomBytes(32).toString('hex')
    console.warn('[crypto] IZZY_SECRET_KEY not set. Auto-generating a new key. If you have existing encrypted secrets, they will NOT be decryptable with this new key.')
    const envPath = path.resolve(process.cwd(), '.env.local')
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
    if (!envContent.includes('IZZY_SECRET_KEY')) {
      fs.appendFileSync(envPath, `\nIZZY_SECRET_KEY=${key}\n`)
    }
    process.env.IZZY_SECRET_KEY = key
  }
  // Key must be 32 bytes. If hex-encoded (64 chars), decode it. Otherwise hash it.
  if (key.length === 64 && /^[0-9a-f]+$/i.test(key)) {
    return Buffer.from(key, 'hex')
  }
  return crypto.createHash('sha256').update(key).digest()
}

// Resolve once at module load to prevent race conditions
const SECRET_KEY: Buffer = resolveSecretKey()

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:ciphertext:authTag (all base64)
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`
}

export function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(':')
  if (parts.length !== 3) throw new Error(`Invalid encrypted format: expected 3 parts, got ${parts.length}`)
  const [ivB64, ciphertextB64, authTagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf-8')
}
