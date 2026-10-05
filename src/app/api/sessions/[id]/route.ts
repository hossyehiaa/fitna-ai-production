import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'

export const runtime = 'nodejs'

/**
 * GET /api/sessions/[id] — fetch one session WITH IDOR protection:
 * the row must belong to the authenticated user, otherwise 404 (not 403,
 * to avoid confirming the existence of other users' resources).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول للوصول إلى هذه الخدمة' }, { status: 401 })
  }

  const { id } = await params
  if (!id || id.length > 60) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const session = await db.simSession.findFirst({
    where: { id, userId: user.id }, // ownership enforced in the query itself
    include: {
      topic: { select: { titleAr: true } },
      events: { orderBy: { occurredMs: 'asc' } },
      report: true,
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'الجلسة غير موجودة' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, session })
}
