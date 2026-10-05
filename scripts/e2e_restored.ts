// =====================================================================
// Fitna AI — local E2E test matrix for the RESTORED original frontend
// + production backend (custom auth shim, Groq chain, Fish Audio TTS).
//
// Creates a test teacher + auth session directly in the DB, then
// exercises every critical route over HTTP against the running server.
// Run: bunx tsx scripts/e2e_restored.ts   (server must be running)
// =====================================================================
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(_scrypt)
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const db = new PrismaClient()

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

// --- load env ---
import { readFileSync } from 'node:fs'
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const ENV: Record<string, string> = {}
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim()

function hashToken(raw: string): string {
  const mac = createHmac('sha256', ENV.AUTH_SECRET || 'dev').update(raw).digest()
  return createHash('sha256').update(mac).digest('hex')
}

/** Build the signed proxy context cookie (same scheme as createSession). */
function authCtxCookie(uid: string, role: string): string {
  const ctx = Buffer.from(JSON.stringify({ uid, role })).toString('base64url')
  const sig = createHmac('sha256', ENV.AUTH_SECRET || 'dev').update(ctx).digest('base64url')
  return `fitna_auth_ctx=${ctx}.${sig}`
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, 64, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

// ---------------------------------------------------------------------
// Results tracking
// ---------------------------------------------------------------------
const results: { name: string; pass: boolean; detail: string }[] = []
function report(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail.slice(0, 140)}` : ''}`)
}

async function main() {
  // -------------------------------------------------------------------
  // Setup: test users + sessions in DB
  // -------------------------------------------------------------------
  const ts = Date.now()
  const teacherEmail = `e2e-teacher-${ts}@fitna.test`
  const intruderEmail = `e2e-intruder-${ts}@fitna.test`
  const password = 'TestPass123!'

  const teacher = await db.user.create({
    data: {
      email: teacherEmail,
      fullName: 'مدرّس اختبار E2E',
      role: 'teacher',
      passwordHash: await hashPassword(password),
    },
  })
  const intruder = await db.user.create({
    data: {
      email: intruderEmail,
      fullName: 'متسلل اختبار',
      role: 'teacher',
      passwordHash: await hashPassword(password),
    },
  })

  const teacherToken = randomBytes(32).toString('base64url')
  const intruderToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 3600_000)
  await db.authSession.createMany({
    data: [
      { userId: teacher.id, tokenHash: hashToken(teacherToken), expiresAt },
      { userId: intruder.id, tokenHash: hashToken(intruderToken), expiresAt },
    ],
  })
  const teacherCookie = `fitna_session=${teacherToken}; ${authCtxCookie(teacher.id, 'teacher')}`
  const intruderCookie = `fitna_session=${intruderToken}; ${authCtxCookie(intruder.id, 'teacher')}`

  try {
    // ---------------------------------------------------------------
    // 1. Health check
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/health`)
      const json = await res.json().catch(() => ({}))
      report('health endpoint returns ok', res.status === 200 && json.status === 'ok', JSON.stringify(json))
      report('health reports fish-audio provider', String(json.tts).startsWith('fish-audio'), String(json.tts))
      report('health reports groq provider flag', String(json.ai).startsWith('groq'), String(json.ai))
    }

    // ---------------------------------------------------------------
    // 2. Landing page (ORIGINAL frontend restored)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/`, { redirect: 'manual' })
      const html = await res.text()
      report('landing page renders', res.status === 200, `status ${res.status}`)
      report(
        'landing page is the ORIGINAL Fitna AI UI',
        /فِطنة|Fitna/i.test(html) && html.includes('fitna-site'),
        'original branding + fitna-site container present'
      )
      report('landing page has no supabase keys', !html.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
    }

    // ---------------------------------------------------------------
    // 3. Auth gating (proxy)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/dashboard/teacher`, { redirect: 'manual' })
      report('unauthenticated dashboard redirects to /login', res.status >= 300 && res.status < 400 && String(res.headers.get('location')).includes('/login'), `status ${res.status}`)

      const res2 = await fetch(`${BASE}/dashboard/teacher`, {
        headers: { cookie: teacherCookie },
        redirect: 'manual',
      })
      const html = await res2.text()
      report('authenticated teacher dashboard renders', res2.status === 200, `status ${res2.status}`)
      report('dashboard shows original Nile design', html.includes('#071B3A') || html.includes('071b3a') || html.includes('font-readex') || html.includes('Readex'))
    }

    // ---------------------------------------------------------------
    // 4. Session setup page (with dialect data)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/session/setup`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      const html = await res.text()
      report('session setup page renders', res.status === 200, `status ${res.status}`)
      report('setup page offers dialect picker', html.includes('لهجة طلاب الفصل') || html.includes('Virtual Classroom Dialect'), 'dialect card present')
    }

    // ---------------------------------------------------------------
    // 5. Create EGYPTIAN session
    // ---------------------------------------------------------------
    let egyptianSessionId = ''
    {
      const res = await fetch(`${BASE}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          topicId: null,
          durationMinutes: 15,
          classroomStyle: 'balanced',
          trainingObjective: 'socratic_focus',
          lessonContext: 'درس عن الكسور ومقارنة الكسور ذات المقامات المتشابهة',
          teacherTitle: 'يا مستر',
          teacherName: 'أحمد',
          dialect: 'egyptian',
        }),
      })
      const json = await res.json().catch(() => ({}))
      egyptianSessionId = json.sessionId || ''
      report('create Egyptian session', res.status === 200 && Boolean(egyptianSessionId), JSON.stringify(json).slice(0, 80))

      const students = await db.sessionStudent.findMany({
        where: { sessionId: egyptianSessionId },
        include: { persona: true },
      })
      const names = students.map((s) => s.persona.name).sort().join(',')
      report('Egyptian session attaches exactly the Egyptian four', students.length === 4 && names === 'سارة,عمر,نور,ياسين', names)

      const session = await db.session.findUnique({ where: { id: egyptianSessionId } })
      report('Egyptian session stores dialect=egyptian_arabic', session?.dialect === 'egyptian_arabic', String(session?.dialect))
    }

    // ---------------------------------------------------------------
    // 6. Create SAUDI session
    // ---------------------------------------------------------------
    let saudiSessionId = ''
    {
      const res = await fetch(`${BASE}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          topicId: null,
          durationMinutes: 15,
          classroomStyle: 'balanced',
          trainingObjective: 'socratic_focus',
          lessonContext: 'درس عن الكسور ومقارنتها',
          teacherTitle: 'يا أستاذة',
          teacherName: '',
          dialect: 'saudi',
        }),
      })
      const json = await res.json().catch(() => ({}))
      saudiSessionId = json.sessionId || ''
      report('create Saudi session', res.status === 200 && Boolean(saudiSessionId), JSON.stringify(json).slice(0, 80))

      const students = await db.sessionStudent.findMany({
        where: { sessionId: saudiSessionId },
        include: { persona: true },
      })
      const names = students.map((s) => s.persona.name).sort().join(',')
      report('Saudi session attaches exactly the Saudi four', students.length === 4 && names === 'جوري,ريم,سلطان,فهد', names)
    }

    // ---------------------------------------------------------------
    // 7. Egyptian turn — real pipeline (Groq OR deterministic fallback)
    // ---------------------------------------------------------------
    let egyptianFirstAudio = false
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          teacherText: 'صباح الخير يا شطار، عاملين إيه النهاردة؟',
          elapsedMs: 4000,
          speechDurationMs: 3,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Egyptian turn returns student reactions', res.status === 200 && Boolean(speaker), JSON.stringify(json).slice(0, 120))

      if (speaker) {
        report('Egyptian student replies in Egyptian dialect', /يا مستر|كويسين|الحمد لله/.test(speaker.text), speaker.text)
        egyptianFirstAudio = typeof speaker.audioBase64 === 'string' && speaker.audioBase64.startsWith('data:audio/mpeg')
        report('Egyptian turn embeds pre-synthesized TTS audio', egyptianFirstAudio, egyptianFirstAudio ? `${Math.round((speaker.audioBase64.length * 3) / 4 / 1024)}KB mp3` : 'none (provider down — fallback expected)')
      }
    }

    // Second Egyptian turn — a real question (exercises LLM/fallback + TTS)
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          teacherText: 'مين يقول لي يعني إيه الكسر؟',
          elapsedMs: 20000,
          speechDurationMs: 4,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Egyptian question turn produces an answer', res.status === 200 && Boolean(speaker?.text), speaker?.text || JSON.stringify(json).slice(0, 100))
    }

    // ---------------------------------------------------------------
    // 8. Saudi turn — dialect enforcement
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          teacherText: 'السلام عليكم يا شباب، كيف حالكم اليوم؟',
          elapsedMs: 4000,
          speechDurationMs: 3,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Saudi turn returns student reactions', res.status === 200 && Boolean(speaker), JSON.stringify(json).slice(0, 120))

      if (speaker) {
        const saudiOk = /تمام|الحمد لله|وعليكم السلام/.test(speaker.text)
        const noEgyptian = !/كويسين|يا مستر|يا ميس|إزاي/.test(speaker.text)
        report('Saudi student replies in Saudi dialect', saudiOk && noEgyptian, speaker.text)
        const hasAudio = typeof speaker.audioBase64 === 'string' && speaker.audioBase64.startsWith('data:audio/mpeg')
        report('Saudi turn embeds pre-synthesized TTS audio', hasAudio, hasAudio ? `${Math.round((speaker.audioBase64.length * 3) / 4 / 1024)}KB mp3` : 'none')
      }
    }
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({
          teacherText: 'ليش الماء يتغير شكله في الكوب؟',
          elapsedMs: 20000,
          speechDurationMs: 4,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Saudi question turn produces an answer', res.status === 200 && Boolean(speaker?.text), speaker?.text || JSON.stringify(json).slice(0, 100))
    }

    // ---------------------------------------------------------------
    // 9. TTS route — Fish Audio s2.1-pro-free (direct verification)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({ text: 'شكلي قربت للجواب بس مو متأكد يا أستاذ', personaName: 'فهد', dialect: 'saudi' }),
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const isMp3 = buf.length > 1000 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
      report('TTS route returns audio', res.status === 200 && isMp3, `HTTP ${res.status} ${buf.length}B`)
    }
    {
      const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({ text: 'أنا مش متأكد يا مستر بس هحاول', personaName: 'عمر', dialect: 'egyptian' }),
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const isMp3 = buf.length > 1000 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
      report('TTS Egyptian voice returns audio', res.status === 200 && isMp3, `HTTP ${res.status} ${buf.length}B`)
    }

    // ---------------------------------------------------------------
    // 10. TTS auth gate
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'اختبار', personaName: 'عمر' }),
      })
      report('TTS rejects unauthenticated callers', res.status === 401, `status ${res.status}`)
    }

    // ---------------------------------------------------------------
    // 11. IDOR protection
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: intruderCookie },
        body: JSON.stringify({ teacherText: 'أنا متسلل', elapsedMs: 1000, speechDurationMs: 2 }),
      })
      report('IDOR: intruder cannot turn on another teacher session', res.status === 403, `status ${res.status}`)

      const res2 = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: intruderCookie },
        body: '{}',
      })
      report('IDOR: intruder cannot end another teacher session', res2.status === 403, `status ${res2.status}`)
    }

    // ---------------------------------------------------------------
    // 12. End Egyptian session + report
    // ---------------------------------------------------------------
    let egyptianReportId = ''
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: teacherCookie },
        body: JSON.stringify({ liveTeacherTalkRatio: 38 }),
      })
      const json = await res.json().catch(() => ({}))
      report('end session computes metrics', res.status === 200 && typeof json.overallScore === 'number', JSON.stringify(json))

      const session = await db.session.findUnique({ where: { id: egyptianSessionId } })
      report('session marked completed with metrics', session?.status === 'completed' && typeof session?.overallScore === 'object', `score=${session?.overallScore?.toString()}`)

      const reportRow = await db.report.findUnique({ where: { sessionId: egyptianSessionId } })
      egyptianReportId = reportRow?.id || ''
      report('LLM report generated and stored', Boolean(reportRow) && (reportRow!.summaryAr.length > 20), (reportRow?.summaryAr || '').slice(0, 60))

      const badges = await db.badge.findMany({ where: { userId: teacher.id } })
      report('badges awarded on completion', badges.length > 0, badges.map((b) => b.badgeKey).join(','))
    }

    // ---------------------------------------------------------------
    // 13. Report + history pages render (original UI)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/report/${egyptianSessionId}`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('report page renders', res.status === 200, `status ${res.status}`)

      const res2 = await fetch(`${BASE}/history`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('history page renders', res2.status === 200, `status ${res2.status}`)

      const res3 = await fetch(`${BASE}/growth`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('growth page renders', res3.status === 200, `status ${res3.status}`)

      const res4 = await fetch(`${BASE}/settings`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('settings page renders', res4.status === 200, `status ${res4.status}`)
    }

    // ---------------------------------------------------------------
    // 14. Live room page renders (original UI)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/session/live/${saudiSessionId}`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('live room page renders for in-progress session', res.status === 200, `status ${res.status}`)
    }

    // ---------------------------------------------------------------
    // 15. Role gating: teacher cannot access institution dashboard
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/dashboard/institution`, { headers: { cookie: teacherCookie }, redirect: 'manual' })
      report('teacher blocked from institution dashboard', res.status >= 300 && res.status < 400, `status ${res.status} -> ${res.headers.get('location')}`)
    }

    // ---------------------------------------------------------------
    // 16. Client-db gateway (browser shim endpoint)
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/client-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: intruderCookie },
        body: JSON.stringify({ table: 'sessions', op: 'update', values: { status: 'abandoned' }, filters: { id: egyptianSessionId } }),
      })
      report('client-db gateway enforces ownership', res.status === 200 && (await res.json()).data === null, 'no row updated for intruder')

      const res2 = await fetch(`${BASE}/api/client-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'sessions', op: 'update', values: { status: 'abandoned' }, filters: { id: egyptianSessionId } }),
      })
      report('client-db gateway requires auth', res2.status === 401, `status ${res2.status}`)
    }

    // ---------------------------------------------------------------
    // 17. Security headers
    // ---------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/`)
      const csp = res.headers.get('content-security-policy') || ''
      report('CSP header present', csp.includes('default-src'), csp.slice(0, 60))
      report('HSTS header present', (res.headers.get('strict-transport-security') || '').includes('max-age'))
    }
  } finally {
    // cleanup test data (keep reports/badges? remove all test artifacts)
    await db.authSession.deleteMany({ where: { userId: { in: [teacher.id, intruder.id] } } })
    await db.user.deleteMany({ where: { id: { in: [teacher.id, intruder.id] } } }).catch(() => {})
    await db.$disconnect()
  }

  // -------------------------------------------------------------------
  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  console.log('\n====================')
  console.log(`E2E RESULTS: ${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`)
  if (failed) {
    console.log('Failed tests:')
    for (const r of results.filter((x) => !x.pass)) console.log(`  ❌ ${r.name} — ${r.detail}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('E2E crashed:', err)
  process.exit(1)
})
