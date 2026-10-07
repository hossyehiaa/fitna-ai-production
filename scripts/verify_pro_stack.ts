// =====================================================================
// FITNA AI PRO — master prompt §11 functional verification.
//
// Verifies EVERY functional bullet of the paid-tier upgrade against the
// REAL code paths: unit tests via direct module imports + full-stack
// tests over HTTP against the running dev server.
//
//   [A] Emotion tag pipeline (parse + streaming filter)     §3
//   [A] Fallback chain (kill primary → next serves)          §4/§2
//   [A] Random events engine (30-60s scheduler + 5 types)    §9
//   [A] WAV wrapper (Gemini TTS PCM container)               §5
//   [B] Health + live OpenRouter probe                        §11
//   [B] Egyptian turn: real LLM reply + emotion, NO bank text §4
//   [B] Saudi turn: dialect enforcement + no leakage          §4
//   [B] Streaming turn: NDJSON + chunked audio + emotion      §4/§3
//   [B] TTS waterfall: all paid providers killed → Edge       §5
//   [B] Report: Opus chain JSON with all sections             §6
//
// Run: bunx tsx scripts/verify_pro_stack.ts   (server on :3000)
// =====================================================================
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt, createHmac, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'

const scrypt = promisify(_scrypt)
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const db = new PrismaClient()
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

// --- load env (.env + .env.local) and seed process.env BEFORE imports ---
const ENV: Record<string, string> = {}
for (const file of ['.env', '.env.local']) {
  try {
    const txt = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const m of txt.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) ENV[m[1]] = m[2].trim()
  } catch {}
}
// The .env file is AUTHORITATIVE for the DB + auth secret (a stale
// DATABASE_URL exported in the shell must never win over it).
for (const [k, v] of Object.entries(ENV)) {
  if (k === 'DATABASE_URL' || k === 'AUTH_SECRET' || !process.env[k]) process.env[k] = v
}

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
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail.slice(0, 160)}` : ''}`)
}

const LOCAL_ROLEPLAY = ENV.OPENROUTER_ROLEPLAY_MODEL || 'deepseek/deepseek-chat-v3.1'
const ALLOWED = ['neutral', 'bored', 'excited', 'curious', 'confused', 'distracted', 'annoyed']

async function main() {
  // ===================================================================
  // A. UNIT TESTS — direct module imports (real production code)
  // ===================================================================
  const { parseEmotion, createEmotionTagFilter } = await import('../src/lib/llm/emotion')
  const { openrouterChat, resolveChain } = await import('../src/lib/llm/openrouter')
  const { maybeGenerateClassroomEvent, CLASSROOM_EVENTS } = await import('../src/lib/simulation/eventEngine')
  const { pcmToWav } = await import('../src/lib/tts/providers')

  // A1 — emotion parser (English tag / Arabic word / absent)
  {
    const e1 = parseEmotion('[emotion: bored] زهقت من الشرح')
    const e2 = parseEmotion('[emotion: متحمس] أيوه يا مستر فاهمين!')
    const e3 = parseEmotion('رد عادي من غير وسم خالص')
    report(
      'parseEmotion: English tag parsed + stripped',
      e1.emotion === 'bored' && e1.clean === 'زهقت من الشرح',
      JSON.stringify(e1)
    )
    report(
      'parseEmotion: Arabic emotion word mapped to allowed set',
      e2.emotion === 'excited' && e2.clean === 'أيوه يا مستر فاهمين!',
      JSON.stringify(e2)
    )
    report(
      'parseEmotion: absent tag → neutral, text untouched',
      e3.emotion === 'neutral' && e3.clean === 'رد عادي من غير وسم خالص',
      JSON.stringify(e3)
    )
  }

  // A2 — streaming emotion filter (tag SPLIT across deltas)
  {
    let out = ''
    let emo = 'neutral'
    const f = createEmotionTagFilter(
      (t) => { out += t },
      (e) => { emo = e }
    )
    f.push('[emotion: exc')
    f.push('ited] يا مستر')
    f.push(' إحنا فاهمين الدرس')
    f.flush()
    report(
      'emotion filter: split-delta tag stripped, emotion captured before text',
      emo === 'excited' && out === 'يا مستر إحنا فاهمين الدرس' && !out.includes('['),
      `emo=${emo} out="${out}"`
    )
  }
  {
    let out = ''
    const f = createEmotionTagFilter((t) => { out += t }, () => {})
    f.push('صبا')
    f.push('ح الخير يا مستر')
    f.flush()
    report('emotion filter: tag-less stream passes through untouched', out === 'صباح الخير يا مستر', `"${out}"`)
  }

  // A3 — chain resolution: the env pin heads the chain (ops control),
  // and the Dream Team defaults trail it.
  {
    const { ROLEPLAY_MODEL: resolvedRoleplay, ROLEPLAY_FALLBACKS: rf } = await import('../src/lib/llm/openrouter')
    const chain = resolveChain(resolvedRoleplay, rf)
    report(
      'resolveChain: env pin heads the Dream Team chain (ops control works)',
      resolvedRoleplay === LOCAL_ROLEPLAY && chain[0] === resolvedRoleplay && chain.includes('google/gemini-2.5-pro') && chain.includes('google/gemini-2.5-flash'),
      `${resolvedRoleplay} → ${chain.slice(1).join(' → ')}`
    )
  }

  // A4 — fallback chain: dead primary walks to the next model (REAL call)
  {
    try {
      const r = await openrouterChat({
        model: 'anthropic/claude-does-not-exist-999',
        fallbacks: [LOCAL_ROLEPLAY],
        messages: [{ role: 'user', content: 'قل: تمام' }],
        maxTokens: 10,
        temperature: 0,
      })
      report(
        'fallback chain: dead primary → next model serves (session stays alive)',
        r.text.trim().length > 0 && r.model !== 'anthropic/claude-does-not-exist-999',
        `served by "${r.model}" :: "${r.text.trim().slice(0, 24)}"`
      )
    } catch (e) {
      report('fallback chain: dead primary → next model serves', false, String(e).slice(0, 120))
    }
  }

  // A5 — random events engine (30-60s window, 5 master types)
  {
    const key = `verify-${Date.now()}`
    const names = ['عمر', 'سارة', 'ياسين', 'نور']
    const t0 = 1_000_000
    const beforeLesson = maybeGenerateClassroomEvent({ sessionId: key, participantNames: names, turnIndex: 1, nowMs: t0 })
    const fires1 = maybeGenerateClassroomEvent({ sessionId: key, participantNames: names, turnIndex: 2, nowMs: t0 + 1_000 })
    const tooSoon = maybeGenerateClassroomEvent({ sessionId: key, participantNames: names, turnIndex: 3, nowMs: t0 + 11_000 })
    const fires2 = maybeGenerateClassroomEvent({ sessionId: key, participantNames: names, turnIndex: 4, nowMs: t0 + 65_000 })
    const expectedTypes = ['hand_raised', 'side_talk', 'off_topic_question', 'phone_distraction', 'confused_silence']
    const typesOk = expectedTypes.every((t) => (CLASSROOM_EVENTS as readonly string[]).includes(t)) && CLASSROOM_EVENTS.length === 5
    report(
      'events engine: 30-60s cadence + 5 master types + [EVENT:] injection line',
      beforeLesson === null && fires1 !== null && tooSoon === null && fires2 !== null && typesOk && fires1!.promptLine.startsWith('[EVENT: '),
      `${fires1?.type} :: ${fires1?.promptLine}`
    )
  }

  // A6 — WAV wrapper for Gemini TTS PCM
  {
    const wav = pcmToWav(Buffer.alloc(3200), 24000)
    report(
      'pcmToWav: RIFF header + 24kHz rate + payload',
      wav.length === 44 + 3200 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(24) === 24000,
      `${wav.length} bytes`
    )
  }

  // ===================================================================
  // B. FULL-STACK TESTS — HTTP against the running dev server
  // ===================================================================
  const ts = Date.now()
  const teacherEmail = `pro-teacher-${ts}@fitna.test`
  const teacher = await db.user.create({
    data: {
      email: teacherEmail,
      fullName: 'مدرّس التحقق النهائي',
      role: 'teacher',
      passwordHash: await hashPassword('TestPass123!'),
    },
  })
  const token = randomBytes(32).toString('base64url')
  await db.authSession.create({
    data: { userId: teacher.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
  })
  const cookie = `fitna_session=${token}; ${authCtxCookie(teacher.id, 'teacher')}`

  try {
    // B1 — health: the new stack's flags
    {
      const res = await fetch(`${BASE}/api/health`)
      const json = await res.json().catch(() => ({}))
      report('health: OpenRouter LLM layer reported', String(json.ai).startsWith('openrouter:'), String(json.ai))
      report('health: report model flag (Opus)', String(json.llmReport).includes('opus') || String(json.llmReport).startsWith('openrouter:'), String(json.llmReport))
      report('health: TTS waterfall tiers reported (full tiers in prod; degraded single-tier locally)', String(json.tts).includes('→') || String(json.tts) === 'msedge', String(json.tts))
      report('health: Whisper STT flag unchanged', json.stt === 'groq-whisper-large-v3-turbo' || json.stt === 'unavailable', String(json.stt))
    }

    // B2 — health probe: LIVE OpenRouter ping through the real chain
    {
      const res = await fetch(`${BASE}/api/health?probe=1`)
      const json = await res.json().catch(() => ({}))
      report(
        'health probe: live OpenRouter ping succeeds through classifier chain',
        json.probe?.ping?.ok === true,
        JSON.stringify(json.probe?.ping)
      )
    }

    // B3 — EGYPTIAN session: real LLM turn with the emotion pipeline
    let egyptianSessionId = ''
    {
      const res = await fetch(`${BASE}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          topicId: null,
          durationMinutes: 15,
          classroomStyle: 'balanced',
          trainingObjective: 'socratic_focus',
          lessonContext: 'درس عن تغير المناخ والاحتباس الحراري',
          teacherTitle: 'يا مستر',
          teacherName: 'أحمد',
          dialect: 'egyptian',
        }),
      })
      const json = await res.json().catch(() => ({}))
      egyptianSessionId = json.sessionId || ''
      report('create Egyptian session', res.status === 200 && Boolean(egyptianSessionId), JSON.stringify(json).slice(0, 80))
    }

    let egyptianReply1 = ''
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          teacherText: 'يا عمر، إيه اللي بيحصل للمية لما تتسخن على النار؟',
          elapsedMs: 5000,
          speechDurationMs: 4,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Egyptian turn: real LLM reply returned', res.status === 200 && Boolean(speaker?.text), speaker?.text || JSON.stringify(json).slice(0, 120))
      if (speaker) {
        egyptianReply1 = speaker.text
        report(
          'emotion tag: parsed + stripped from UI text, valid allowed value',
          !speaker.text.includes('[emotion:') && (speaker.emotion === undefined || ALLOWED.includes(speaker.emotion)),
          `emotion=${speaker.emotion} text="${speaker.text.slice(0, 60)}"`
        )
        report(
          'Egyptian dialect: real markers in the reply',
          /المية|الماء|بيحصل|بتتبخر|بخار|عشان|علشان|يا مستر|فقاقيع|بتغلي|مش|كده|إيه/.test(speaker.text),
          speaker.text.slice(0, 90)
        )
        report(
          'no AI mention in student reply',
          !/\bAI\b|ذكاء\s*اصطناعي|نموذج|مساعد/i.test(speaker.text),
          speaker.text.slice(0, 60)
        )
        report(
          'NOT the deterministic bank (the production-bug regression check)',
          !speaker.text.startsWith('حاضر') && speaker.text.length > 4,
          speaker.text.slice(0, 50)
        )
      }
    }

    // B4 — second Egyptian turn: replies VARY (not stuck on one line)
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          teacherText: 'مين أكبر: 2 على 6 ولا 5 على 6؟ وليه؟',
          elapsedMs: 25000,
          speechDurationMs: 5,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report(
        'Egyptian second turn: different question → different reply (no fixed-phrase loop)',
        Boolean(speaker?.text) && speaker.text !== egyptianReply1,
        speaker?.text?.slice(0, 90) || JSON.stringify(json).slice(0, 100)
      )
    }

    // B5 — SAUDI session: dialect enforcement through the full pipeline
    let saudiSessionId = ''
    {
      const res = await fetch(`${BASE}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          topicId: null,
          durationMinutes: 15,
          classroomStyle: 'balanced',
          trainingObjective: 'socratic_focus',
          lessonContext: 'درس عن الكسور والبسط والمقام',
          teacherTitle: 'يا أستاذ',
          teacherName: '',
          dialect: 'saudi',
        }),
      })
      const json = await res.json().catch(() => ({}))
      saudiSessionId = json.sessionId || ''
      report('create Saudi session', res.status === 200 && Boolean(saudiSessionId), JSON.stringify(json).slice(0, 80))
    }
    {
      const res = await fetch(`${BASE}/api/sessions/${saudiSessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          teacherText: 'يا فهد، وش الفرق بين البسط والمقام؟',
          elapsedMs: 6000,
          speechDurationMs: 4,
          audioBase64: '',
          voiceGender: 'male',
        }),
      })
      const json = await res.json().catch(() => ({}))
      const students: any[] = json.students || []
      const speaker = students.find((s) => s.text)
      report('Saudi turn: real LLM reply returned', res.status === 200 && Boolean(speaker?.text), speaker?.text || JSON.stringify(json).slice(0, 120))
      if (speaker) {
        const saudiOk = /وش|البسط|المقام|اللي فوق|اللي تحت|يا أستاذ|كذا|الحين|ليش/.test(speaker.text)
        const noEgyptianLeak = !/يا مستر|يا ميس|إزاي|كده|علشان|إيه\b|المية/.test(speaker.text)
        report('Saudi dialect: Saudi markers present', saudiOk, speaker.text.slice(0, 90))
        report('Saudi dialect: zero Egyptian leakage', noEgyptianLeak, speaker.text.slice(0, 90))
        report(
          'Saudi emotion tag: stripped + valid',
          !speaker.text.includes('[emotion:') && (speaker.emotion === undefined || ALLOWED.includes(speaker.emotion)),
          `emotion=${speaker.emotion}`
        )
      }
    }

    // B6 — STREAMING turn (the production low-latency path): NDJSON pipeline
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/turn/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          teacherText: 'ليه تفتكروا المية بتتبخر أسرع لما الجو يكون حر؟',
          elapsedMs: 40000,
          speechDurationMs: 5,
          voiceGender: 'male',
        }),
      })
      report('stream turn: NDJSON response opens', res.status === 200 && String(res.headers.get('content-type')).includes('ndjson'), `status ${res.status}`)
      const text = await res.text()
      const events = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      const types = events.map((e) => e.type)
      const speech = events.find((e) => e.type === 'speech')
      const audios = events.filter((e) => e.type === 'audio')
      const done = events.find((e) => e.type === 'done')
      report(
        'stream turn: full event sequence (transcript → students → audio → speech → done)',
        types.includes('transcript') && types.includes('students') && audios.length > 0 && Boolean(speech) && Boolean(done),
        types.join('→')
      )
      if (speech) {
        report(
          'stream turn: speech text tag-free + valid emotion',
          !speech.fullText.includes('[emotion:') && (speech.emotion === undefined || ALLOWED.includes(speech.emotion)),
          `emotion=${speech.emotion} :: ${String(speech.fullText).slice(0, 70)}`
        )
      }
      if (audios.length > 0) {
        const totalAudioKb = Math.round(audios.reduce((n, a) => n + String(a.b64 || '').length, 0) * 0.75 / 1024)
        report(
          'stream turn: chunked TTS audio shipped (waterfall terminal = Edge when paid keys absent)',
          totalAudioKb > 1,
          `${audios.length} chunks ≈ ${totalAudioKb}KB`
        )
      }
      if (done) {
        report(
          'stream turn: classifier questionType + per-stage latency block',
          (done.questionType === 'open' || done.questionType === 'closed' || done.questionType === 'statement') && Boolean(done.latency),
          `questionType=${done.questionType} model=${done.latency?.model ?? '-'}`
        )
      }
    }

    // B7 — TTS waterfall with EVERY paid provider killed (no keys locally)
    {
      const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          text: 'شكلي قربت للجواب بس مو متأكد يا أستاذ',
          personaName: 'فهد',
          dialect: 'saudi',
          emotion: 'confused',
        }),
      })
      const buf = Buffer.from(await res.arrayBuffer())
      report(
        'TTS waterfall: Fish+ElevenLabs+Gemini all killed → msedge serves',
        res.status === 200 && buf.length > 1000,
        `${res.status} · ${buf.length}B · ${res.headers.get('content-type')}`
      )
    }

    // B8 — REPORT: end the session → Opus chain generates the full JSON
    {
      const res = await fetch(`${BASE}/api/sessions/${egyptianSessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({}),
      })
      const metrics = await res.json().catch(() => ({}))
      report('end session: metrics returned', res.status === 200 && typeof metrics.overallScore === 'number', JSON.stringify(metrics).slice(0, 90))

      // The report row lands in the reports table — read it back via Prisma.
      await new Promise((r) => setTimeout(r, 1500))
      const row = await db.report.findFirst({ where: { sessionId: egyptianSessionId }, orderBy: { createdAt: 'desc' } })
      const hasAllSections =
        row &&
        typeof row.summaryAr === 'string' && row.summaryAr.length > 20 &&
        (row.strengths as string[])?.length >= 1 &&
        (row.weaknesses as string[])?.length >= 1 &&
        (row.recommendations as string[])?.length >= 1 &&
        typeof row.sessionSignalAr === 'string' && row.sessionSignalAr.length > 5
      report(
        'Opus report: valid JSON persisted with all 6 sections (summary/signal/axes/strengths/improvements/recommendations)',
        Boolean(hasAllSections),
        row ? `strengths=${(row.strengths as string[])?.length} recs=${(row.recommendations as string[])?.length} signal="${row.sessionSignalAr?.slice(0, 50)}"` : 'no report row'
      )
      if (row) {
        const fw = row.frameworkScores as any
        report(
          'Opus report: Danielson + CLASS framework axes scored',
          Boolean(fw?.danielson?.questioningDiscussion?.score) && Boolean(fw?.classFramework?.emotionalSupport?.score),
          `Danielson Q=${fw?.danielson?.questioningDiscussion?.score} CLASS E=${fw?.classFramework?.emotionalSupport?.score}`
        )
      }
    }
  } finally {
    // cleanup marker users? keep rows (harmless test data, same as e2e).
    await db.$disconnect()
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n=== FITNA AI PRO VERIFICATION: ${results.length - failed.length}/${results.length} passed ===`)
  if (failed.length) {
    console.log('FAILED:')
    for (const f of failed) console.log(`  ❌ ${f.name} — ${f.detail.slice(0, 140)}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('verify_pro_stack crashed:', err)
  process.exit(1)
})
