// =====================================================================
// Character Identity + Speaker Routing + MSA — acceptance unit tests.
// Runs against the DB (Neon) + pure functions. No server required.
// =====================================================================
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const db = new PrismaClient()
const results: { name: string; pass: boolean; detail: string }[] = []
function report(name: string, pass: boolean, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail.slice(0, 120)}` : ''}`)
}

// Import routing + registry via tsx-compatible path
import { resolveTargetCharacter, explicitTargetFromUtterance } from '../src/lib/ai/speakerRouting'
import { CHARACTERS, resolveCharacter, characterKeyByName } from '../src/lib/characters/registry'

async function main() {
  // -------------------------------------------------------------------
  // A. SPEAKER ROUTING — explicit vocative targeting
  // -------------------------------------------------------------------
  const saudiParticipants = ['سلطان', 'ريم', 'فهد', 'جوري'].map((name) => {
    const c = Object.values(CHARACTERS).find((ch) => ch.name === name)!
    return { personaId: `pid-${c.key}`, name, characterKey: c.characterId, gender: c.gender }
  })
  const egyptianParticipants = ['عمر', 'سارة', 'ياسين', 'نور'].map((name) => {
    const c = Object.values(CHARACTERS).find((ch) => ch.name === name)!
    return { personaId: `pid-${c.key}`, name, characterKey: c.characterId, gender: c.gender }
  })

  // TEST: "يا سلطان" → ONLY سلطان (TEST 4)
  {
    const t = explicitTargetFromUtterance('يا سلطان، هل يمكنك شرح هذا السؤال؟', saudiParticipants)
    report('routing: "يا سلطان" resolves to سلطان', t?.name === 'سلطان', JSON.stringify(t?.name))
  }
  // TEST: "يا ريم" → ONLY ريم (TEST 5)
  {
    const t = explicitTargetFromUtterance('يا ريم، ما الإجابة؟', saudiParticipants)
    report('routing: "يا ريم" resolves to ريم', t?.name === 'ريم', JSON.stringify(t?.name))
  }
  // TEST: bare name + comma
  {
    const t = explicitTargetFromUtterance('سلطان، هل فهمت السؤال؟', saudiParticipants)
    report('routing: "سلطان، هل فهمت السؤال؟" resolves to سلطان', t?.name === 'سلطان', JSON.stringify(t?.name))
  }
  // TEST: Egyptian vocative
  {
    const t = explicitTargetFromUtterance('يا عمر، إيه رأيك؟', egyptianParticipants)
    report('routing: "يا عمر" resolves to عمر (Egyptian class)', t?.name === 'عمر', JSON.stringify(t?.name))
  }
  // TEST: "السلام عليكم" → NO explicit target (TEST 3: greeting flows to natural responder)
  {
    const t = explicitTargetFromUtterance('السلام عليكم ورحمة الله', saudiParticipants)
    report('routing: greeting has no explicit target', t === null, JSON.stringify(t?.name ?? null))
  }
  // TEST: unknown name → no explicit target
  {
    const t = explicitTargetFromUtterance('يا طارق، هل فهمت؟', saudiParticipants)
    report('routing: unknown name → no explicit target', t === null)
  }
  // TEST: context continuation — last speaker continues
  {
    const r = resolveTargetCharacter('ما رأيك في هذا؟', saudiParticipants, { lastSpeakingPersonaId: 'pid-reem' })
    report('routing: no-name utterance continues with current speaker (ريم)', r.targetPersonaId === 'pid-reem' && r.reason === 'current_speaker', `${r.targetName}/${r.reason}`)
  }
  // TEST: no context → hand-raised wins
  {
    const parts = saudiParticipants.map((p, i) => ({ ...p, hasHandRaised: i === 2 }))
    const r = resolveTargetCharacter('هل يمكن لأحد أن يساعدني؟', parts, {})
    report('routing: open question → hand-raised student (فهد)', r.targetName === 'فهد' && r.reason === 'hand_raised', `${r.targetName}/${r.reason}`)
  }
  // TEST: no context, no hands → least-heard (inclusive)
  {
    const parts = saudiParticipants.map((p, i) => ({ ...p, timesSpoken: [3, 1, 2, 0][i] }))
    const r = resolveTargetCharacter('أريد أن أسمع رأيكم', parts, {})
    report('routing: inclusive fallback → least-heard (جوري)', r.targetName === 'جوري' && r.reason === 'least_heard', `${r.targetName}/${r.reason}`)
  }
  // TEST: routing is deterministic (same input → same output, 50 runs)
  {
    let stable = true
    for (let i = 0; i < 50; i++) {
      const t = explicitTargetFromUtterance('يا سلطان، وضّح لي من فضلك', saudiParticipants)
      if (t?.name !== 'سلطان') { stable = false; break }
    }
    report('routing: deterministic across 50 runs', stable)
  }

  // -------------------------------------------------------------------
  // B. CHARACTER REGISTRY — gender + nationality correctness (TEST 8/9)
  // -------------------------------------------------------------------
  {
    const expectations = [
      ['سلطان', 'male', 'SA'], ['فهد', 'male', 'SA'], ['ريم', 'female', 'SA'], ['جوري', 'female', 'SA'],
      ['عمر', 'male', 'EG'], ['ياسين', 'male', 'EG'], ['سارة', 'female', 'EG'], ['نور', 'female', 'EG'],
    ] as const
    let allOk = true
    for (const [name, gender, nat] of expectations) {
      const c = Object.values(CHARACTERS).find((ch) => ch.name === name)
      if (!c || c.gender !== gender || c.nationality !== nat) { allOk = false }
    }
    report('registry: all 8 characters have correct gender + nationality', allOk)
  }
  {
    const sultan = resolveCharacter('sultan', null)
    report('registry: سلطان resolves to MALE Saudi identity', sultan?.gender === 'male' && sultan?.nationality === 'SA')
    const wrong = resolveCharacter(null, 'سلطان')
    report('registry: name-based سلطان also resolves male (no female avatar)', wrong?.gender === 'male')
    const reem = resolveCharacter(null, 'ريم')
    report('registry: ريم resolves FEMALE Saudi identity', reem?.gender === 'female' && reem?.nationality === 'SA')
  }

  // -------------------------------------------------------------------
  // C. DB — persisted character identity (TEST 11/12 persistence basis)
  // -------------------------------------------------------------------
  const personas = await db.studentPersona.findMany()
  {
    const withIdentity = personas.filter((p) => p.characterKey && p.avatarKey && p.voiceId && p.gender && p.nationality)
    report('db: all 8 personas carry full persisted identity', withIdentity.length === 8, `${withIdentity.length}/8`)
  }
  {
    const keys = personas.map((p) => p.characterKey)
    report('db: character keys are unique + stable', new Set(keys).size === 8, keys.join(','))
  }
  {
    const sultan = personas.find((p) => p.name === 'سلطان')
    report('db: سلطان = SA/male/saudi dialect + own voice', sultan?.nationality === 'SA' && sultan?.gender === 'male' && sultan?.dialect === 'saudi_arabic' && Boolean(sultan?.voiceId))
    const reem = personas.find((p) => p.name === 'ريم')
    report('db: ريم = SA/female + own voice', reem?.nationality === 'SA' && reem?.gender === 'female' && Boolean(reem?.voiceId))
    const sara = personas.find((p) => p.name === 'سارة')
    report('db: سارة = EG/female + own voice', sara?.nationality === 'EG' && sara?.gender === 'female' && Boolean(sara?.voiceId))
  }
  {
    // voice uniqueness: 8 distinct Fish voice ids
    const voiceIds = new Set(personas.map((p) => p.voiceId))
    report('db: each character has its OWN Fish voice id', voiceIds.size === 8, `${voiceIds.size} unique`)
  }

  // -------------------------------------------------------------------
  // D. AVATAR ASSETS — every character has its own sprite set
  // -------------------------------------------------------------------
  {
    let allPresent = true
    const missing: string[] = []
    for (const p of personas) {
      for (const posture of ['neutral', 'speaking', 'hand_raised', 'distracted']) {
        const path = `public/students/${p.avatarKey}/${posture}.jpg`
        if (!existsSync(path)) { allPresent = false; missing.push(path) }
      }
    }
    report('assets: all 8 characters × 4 postures exist (32 sprites)', allPresent, missing.slice(0, 3).join(' '))
  }
  {
    // avatar_key ↔ gender mapping guard (سلطان never uses a female sprite)
    const sultanAvatar = personas.find((p) => p.name === 'سلطان')?.avatarKey
    report('assets: سلطان avatar key is the male Saudi sprite (sultan)', sultanAvatar === 'sultan', String(sultanAvatar))
  }

  // -------------------------------------------------------------------
  // E. MSA UI AUDIT — colloquial markers must be gone from UI files
  // (AI character-speech files keep their dialect banks by design)
  // -------------------------------------------------------------------
  {
    const colloquialMarkers = [
      'دلوقتي', 'معندكش', 'اعمل واحد', 'مفيش', 'حصل خطأ', 'جرب تاني', 'لسه ',
      'الجلسة دي', 'مش بتاعتك', 'سرحان', 'بيتكلم...', 'مش فاكر', 'خلّيك فِطِن', 'خليك فِطِن',
    ]
    const uiFiles = execSync(
      `git ls-files 'src/app/**/*.tsx' 'src/app/**/route.ts' 'src/components/**/*.tsx' 'src/lib/i18n/**'`,
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean)
    const offenders: string[] = []
    for (const f of uiFiles) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const content = require('node:fs').readFileSync(f, 'utf8')
        for (const marker of colloquialMarkers) {
          if (content.includes(marker)) { offenders.push(`${f}: ${marker}`) }
        }
      } catch { /* skip */ }
    }
    report(`msa: no colloquial markers in ${uiFiles.length} UI files`, offenders.length === 0, offenders.slice(0, 5).join(' | '))
  }

  await db.$disconnect()

  const passed = results.filter((r) => r.pass).length
  console.log(`\n====================`)
  console.log(`UNIT/DB ACCEPTANCE RESULTS: ${passed}/${results.length} passed`)
  if (passed < results.length) {
    for (const r of results.filter((x) => !x.pass)) console.log(`  ❌ ${r.name} — ${r.detail}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
