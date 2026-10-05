// =====================================================================
// Password hashing — node:crypto scrypt (memory-hard, OWASP-approved).
// Format: scrypt$N$r$p$saltB64$hashB64 — self-describing for future upgrades.
// Replaces Supabase Auth's bcrypt-backed credential store.
// =====================================================================

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const [, n, r, p, saltB64, hashB64] = parts
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: parseInt(n, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
      maxmem: 64 * 1024 * 1024,
    })
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
