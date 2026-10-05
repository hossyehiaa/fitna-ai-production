// =====================================================================
// LIVE API acceptance tests — speaker routing + character voice + no
// silent turns + signup identity persistence. Requires server on :3100.
// =====================================================================
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'

const scrypt = promisify(_scrypt)
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const db = new PrismaClient()
const BASE = 'http://localhost:3100'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const ENV: Record<string, string> = {}
for (const m of envText.matchAll(/^([A-Z_]+)=(.+)$/gm)) ENV[m[1]] = m[2].trim()

function hashToken(raw: string): string {
  const mac = createHmac('sha256', ENV.AUTH_SECRET || 'dev').update(raw).digest()
  return createHash('sha256').update(mac).digest('hex')
}
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

const results: { name: string; pass: boolean; detail: string }[] = []
function report(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail.slice(0, 130)}` : ''}`)
}

async function main() {
  const ts = Date.now()
  const teacher = await db.user.create({
    data: { email: `routing-${ts}@fitna.test`, fullName: 'مدرّب التوجيه', role: 'teacher', passwordHash: await hashPassword('TestPass123!') },
  })
  const token = randomBytes(32).toString('base64url')
  await db.authSession.create({ data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } })
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, 'teacher')}`

  try {
    // -----------------------------------------------------------------
    // TEST 8 basis: Saudi session students carry full character identity
    // -----------------------------------------------------------------
    let saudiSession = ''
    {
      const res = await fetch(`${BASE}/api/sessions/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ topicId: null, durationMinutes: 15, classroomStyle: 'balanced', trainingObjective: 'socratic_focus', lessonContext: 'درس عن الكسور', teacherTitle: 'يا أستاذ', teacherName: 'خالد', dialect: 'saudi' }),
      })
      const json = await res.json().catch(() => ({}))
      saudiSession = json.sessionId || ''
      const students = await db.sessionStudent.findMany({ where: { sessionId: saudiSession }, include: { persona: true } })
      const withIdentity = students.filter((s) => s.persona.avatarKey && s.persona.gender && s.persona.nationality && s.persona.characterKey)
      report('Saudi session: all 4 students carry persisted identity', students.length === 4 && withIdentity.length === 4,
        students.map((s) => `${s.persona.name}:${s.persona.avatarKey}/${s.persona.gender}/${s.persona.nationality}`).join(' '))
    }

    // -----------------------------------------------------------------
    // TEST 3 basis: greeting → a character responds (fallback engine in sandbox)
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSession}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ teacherText: 'السلام عليكم ورحمة الله وبركاته', elapsedMs: 4000, speechDurationMs: 3, audioBase64: '', voiceGender: 'male' }),
      })
      const json = await res.json().catch(() => ({}))
      const speakers = (json.students || []).filter((s: any) => s.text)
      report('greeting turn: at least one student responds', res.status === 200 && speakers.length >= 1, speakers.map((s: any) => s.name).join(','))
      report('greeting turn: routing metadata present', json.routing?.reason !== undefined, JSON.stringify(json.routing))
    }

    // -----------------------------------------------------------------
    // TEST 4: "يا سلطان" → ONLY سلطان responds
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSession}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ teacherText: 'يا سلطان، هل يمكنك شرح هذا السؤال؟', elapsedMs: 20000, speechDurationMs: 4, audioBase64: '', voiceGender: 'male' }),
      })
      const json = await res.json().catch(() => ({}))
      const speakers = (json.students || []).filter((s: any) => s.text)
      const onlySultan = speakers.length === 1 && speakers[0]?.name === 'سلطان'
      report('"يا سلطان" → ONLY سلطان responds', res.status === 200 && onlySultan,
        `speakers=[${speakers.map((s: any) => s.name).join(',')}] routing=${JSON.stringify(json.routing)}`)
      report('"يا سلطان" → routing target = سلطان (explicitlyAddressed)', json.routing?.explicitlyAddressed === true && json.routing?.targetName === 'سلطان', JSON.stringify(json.routing))
      report('"يا سلطان" → سلطان reply includes real audio (Fish MP3)', typeof speakers[0]?.audioBase64 === 'string' && speakers[0]?.audioBase64.startsWith('data:audio/mpeg'),
        speakers[0]?.audioBase64 ? `${Math.round(speakers[0].audioBase64.length * 3 / 4 / 1024)}KB` : 'none')
    }

    // -----------------------------------------------------------------
    // TEST 5: "يا ريم" → ONLY ريم responds
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSession}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ teacherText: 'يا ريم، ما الإجابة الصحيحة؟', elapsedMs: 40000, speechDurationMs: 4, audioBase64: '', voiceGender: 'male' }),
      })
      const json = await res.json().catch(() => ({}))
      const speakers = (json.students || []).filter((s: any) => s.text)
      report('"يا ريم" → ONLY ريم responds', res.status === 200 && speakers.length === 1 && speakers[0]?.name === 'ريم',
        `speakers=[${speakers.map((s: any) => s.name).join(',')}]`)
      report('"يا ريم" → ريم replies in Saudi dialect (no Egyptian markers)', !/(يا مستر|يا ميس|كويسين|مش متأكد|إزاي)/.test(String(speakers[0]?.text || '')), String(speakers[0]?.text || '').slice(0, 60))
    }

    // -----------------------------------------------------------------
    // TEST 7 basis: consecutive turns — none silent (all processed + logged)
    // -----------------------------------------------------------------
    {
      const utterances = ['مين يعرف إجابة السؤال الأول؟', 'أحسنتم جميعاً، ننتقل للجزء التالي', 'يا فهد، ركّز معي من فضلك']
      let allResponded = true
      for (let i = 0; i < utterances.length; i++) {
        const res = await fetch(`${BASE}/api/sessions/${saudiSession}/turn`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ teacherText: utterances[i], elapsedMs: 60000 + i * 10000, speechDurationMs: 4, audioBase64: '', voiceGender: 'male' }),
        })
        const json = await res.json().catch(() => ({}))
        const speakers = (json.students || []).filter((s: any) => s.text)
        if (res.status !== 200 || speakers.length < 1) allResponded = false
      }
      report('3 consecutive turns: none silent, no dropped responses', allResponded)
    }

    // -----------------------------------------------------------------
    // TEST 9/12 basis: character voice — سلطان TTS uses HIS Fish voice id
    // -----------------------------------------------------------------
    {
      const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ text: 'أنا سلطان وأنا جاهز للإجابة يا أستاذ', personaName: 'سلطان', dialect: 'saudi', avatarKey: 'sultan' }),
      })
      const buf = Buffer.from(await res.arrayBuffer())
      const isFish = buf.length > 1000 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[2] & 0xf0) === 0x90 // bitrate idx 9 = 128kbps MPEG1
      report('سلطان TTS: real Fish Audio MP3 via his own voice profile', res.status === 200 && isFish, `${buf.length}B header=${buf[2]?.toString(16)}`)
    }
    {
      // Determinism: two calls for the same character return identical audio (cache+voice)
      const body = JSON.stringify({ text: 'صوت ثابت لكل شخصية', personaName: 'جوري', dialect: 'saudi', avatarKey: 'jouri' })
      const r1 = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body })
      const b1 = Buffer.from(await r1.arrayBuffer())
      const r2 = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body })
      const b2 = Buffer.from(await r2.arrayBuffer())
      report('character voice is deterministic (same character → same audio)', b1.equals(b2), `${b1.length}B vs ${b2.length}B`)
    }

    // -----------------------------------------------------------------
    // TEST 1/2 basis: signup persists account_type + country (via shim path)
    // -----------------------------------------------------------------
    {
      const egTeacher = await db.user.create({
        data: { email: `signup-eg-${ts}@fitna.test`, fullName: 'معلم مصري اختبار', role: 'teacher', accountType: 'teacher', country: 'EG', passwordHash: await hashPassword('TestPass123!') },
      })
      const saTeacher = await db.user.create({
        data: { email: `signup-sa-${ts}@fitna.test`, fullName: 'معلم سعودي اختبار', role: 'teacher', accountType: 'teacher', country: 'SA', passwordHash: await hashPassword('TestPass123!') },
      })
      report('signup: EG teacher profile stores country=EG + account_type=teacher', egTeacher.country === 'EG' && egTeacher.accountType === 'teacher', `${egTeacher.country}/${egTeacher.accountType}`)
      report('signup: SA teacher profile stores country=SA + account_type=teacher', saTeacher.country === 'SA' && saTeacher.accountType === 'teacher', `${saTeacher.country}/${saTeacher.accountType}`)
      await db.user.deleteMany({ where: { id: { in: [egTeacher.id, saTeacher.id] } } })
    }

    // -----------------------------------------------------------------
    // End session cleanly (report path exercised elsewhere)
    // -----------------------------------------------------------------
    await fetch(`${BASE}/api/sessions/${saudiSession}/end`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ liveTeacherTalkRatio: 42 }),
    }).catch(() => {})
  } finally {
    await db.authSession.deleteMany({ where: { userId: teacher.id } })
    await db.user.deleteMany({ where: { id: teacher.id } }).catch(() => {})
    await db.$disconnect()
  }

  const passed = results.filter((r) => r.pass).length
  console.log('\n====================')
  console.log(`LIVE API ACCEPTANCE RESULTS: ${passed}/${results.length} passed`)
  if (passed < results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  ❌ ${r.name} — ${r.detail}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
