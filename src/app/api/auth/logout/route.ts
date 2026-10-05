import { NextResponse } from 'next/server'
import { destroySession, getCurrentUser } from '@/lib/auth/session'
import { verifyOrigin } from '@/lib/security/csrf'
import { audit } from '@/lib/security/audit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const csrf = verifyOrigin(req)
  if (csrf) return csrf

  const user = await getCurrentUser()
  await destroySession()
  if (user) await audit('logout', { userId: user.id })

  return NextResponse.json({ ok: true, redirectTo: '/login' })
}
