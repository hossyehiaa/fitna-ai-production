import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'

export const runtime = 'nodejs'

// =====================================================================
// Hardened gateway for the browser shim (src/lib/supabase/client.ts).
//
// The original app's ONLY client-side supabase-js write is
// `from("sessions").update({ status: "abandoned" }).eq("id", sessionId)`
// when a teacher leaves a live room without ending it properly.
// This route supports exactly that and nothing more: one table, one
// field, ownership re-verified server-side on every call.
// =====================================================================

const ALLOWED_STATUS = new Set(['abandoned', 'in_progress'])

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: { message: 'unauthorized' } }, { status: 401 })
  }

  let body: { table?: string; op?: string; values?: Record<string, unknown>; filters?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { message: 'bad request' } }, { status: 400 })
  }

  if (body.table !== 'sessions' || body.op !== 'update') {
    return NextResponse.json({ error: { message: 'unsupported operation' } }, { status: 400 })
  }

  const values = body.values ?? {}
  const valueKeys = Object.keys(values)
  if (valueKeys.length !== 1 || valueKeys[0] !== 'status') {
    return NextResponse.json({ error: { message: 'unsupported field' } }, { status: 400 })
  }
  if (typeof values.status !== 'string' || !ALLOWED_STATUS.has(values.status)) {
    return NextResponse.json({ error: { message: 'unsupported value' } }, { status: 400 })
  }

  const filters = body.filters ?? {}
  const filterKeys = Object.keys(filters)
  if (filterKeys.length !== 1 || filterKeys[0] !== 'id' || typeof filters.id !== 'string') {
    return NextResponse.json({ error: { message: 'unsupported filter' } }, { status: 400 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(filters.id)) {
    return NextResponse.json({ error: { message: 'invalid id' } }, { status: 400 })
  }

  // Ownership re-check server-side (never trust the client's session id).
  const rows = (await db.$queryRawUnsafe(
    `UPDATE "sessions" SET "status" = $1::text
     WHERE "id" = $2::uuid AND "teacher_id" = $3::uuid
     RETURNING "id", "status"`,
    values.status,
    filters.id,
    user.id
  )) as Record<string, unknown>[]

  return NextResponse.json({ data: rows[0] ?? null, error: null })
}
