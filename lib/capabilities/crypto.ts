import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getSecretKey(): Buffer {
  let key = process.env.IZZY_SECRET_KEY
  if (!key) {
    // Auto-generate and persist
    key = crypto.randomBytes(32).toString('hex')
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

export function encrypt(plaintext: string): string {
  const key = getSecretKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:ciphertext:authTag (all base64)
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`
}

export function decrypt(encryptedStr: string): string {
  const key = getSecretKey()
  const [ivB64, ciphertextB64, authTagB64] = encryptedStr.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf-8')
}
