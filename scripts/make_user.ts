// Create a test user directly in the DB (bypasses signup rate limit).
// Usage: bun run scripts/make_user.ts <email> <password> <fullName> <dialect>
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const RUN = Date.now()
const email = process.argv[2] || `live-${RUN}@teacher.test`
const password = process.argv[3] || 'Passw0rd123'
const fullName = process.argv[4] || 'مدرّب الجلسة الحية'
const dialect = process.argv[5] || 'saudi'

async function main() {
  // Inline scrypt hash (same format as src/lib/auth/password.ts).
  const hash = await (async () => {
    const { randomBytes, scrypt: _scrypt } = await import('node:crypto')
    const { promisify } = await import('node:util')
    const scrypt = promisify(_scrypt) as any
    const salt = randomBytes(16)
    const derived = await scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`
  })()

  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, passwordHash: hash },
  })
  await db.profile.upsert({
    where: { userId: user.id },
    update: { dialect, fullName, userType: 'teacher' },
    create: { userId: user.id, dialect, fullName, userType: 'teacher' },
  })
  console.log(JSON.stringify({ ok: true, email, dialect, userId: user.id }))
}

main()
  .catch((e) => { console.error('ERR:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
