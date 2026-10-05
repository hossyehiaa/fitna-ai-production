// Create a browser-E2E test teacher with a known password (same scrypt scheme as the app)
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(_scrypt)
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const db = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, 64, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

async function main() {
  const email = `browser-${Date.now()}@fitna.test`
  const password = 'BrowserTest123!'

  const user = await db.user.create({
    data: {
      email,
      fullName: 'مدرّس اختبار المتصفح',
      role: 'teacher',
      passwordHash: await hashPassword(password),
    },
  })
  await db.$disconnect()
  console.log(JSON.stringify({ email, password, userId: user.id }))
}
main().catch((e) => { console.error(e.message); process.exit(1) })
