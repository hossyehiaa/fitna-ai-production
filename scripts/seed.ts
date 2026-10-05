// =====================================================================
// Fitna AI — database seed (Prisma-based; run: bunx tsx scripts/seed.ts
// or: node --experimental-strip-types scripts/seed.ts — with DATABASE_URL
// loaded from .env by Prisma).
//   * 4 global lesson topics (from the original Supabase schema)
//   * 4 Egyptian student personas (original) + 4 Saudi personas (production)
//   * Public demo teacher account (demo@fitna.ai — public demo credential
//     by design, used by the original loginAsDemoAction)
// Idempotent: safe to re-run.
// =====================================================================
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
// ---------------------------------------------------------------------
// 1. Lesson topics (global defaults from the original schema.sql)
// ---------------------------------------------------------------------
const TOPICS = [
  ['إدارة الصف', 'Classroom Management'],
  ['الكسور والأعداد', 'Fractions and Numbers'],
  ['القراءة النقدية', 'Critical Reading'],
  ['العلوم والتجربة', 'Science and Experimentation'],
]
for (const [ar, en] of TOPICS) {
  const existing = await db.lessonTopic.findFirst({ where: { titleAr: ar, institutionId: null } })
  if (!existing) {
    await db.lessonTopic.create({ data: { titleAr: ar, titleEn: en } })
  }
}
console.log('✓ lesson_topics seeded')

// ---------------------------------------------------------------------
// 2. Student personas — Egyptian four (original) + Saudi four (production)
// ---------------------------------------------------------------------
const PERSONAS = [
  // ---- Egyptian classroom (verbatim from the original schema.sql) ----
  {
    name: 'عمر', age: 10, dialect: 'egyptian_arabic', baseAttention: 75,
    prompt: 'انت طفل مصري عمرك 10 سنين اسمك عمر. شخصيتك نشيط وفضولي بس بيتشتت بسرعة. بتتكلم باللهجة المصرية العامية زي طفل حقيقي (كلمات زي "بجد؟"، "يعني ايه"، "عايز أعرف"). بتحب تسأل أسئلة كتير بس مش دايمًا مركز.',
    strengths: ['فضول وحماس للمشاركة'], weaknesses: ['تشتت الانتباه بسرعة'],
  },
  {
    name: 'سارة', age: 11, dialect: 'egyptian_arabic', baseAttention: 85,
    prompt: 'انتي طفلة مصرية عمرك 11 سنة اسمك سارة. شخصيتك هادية ومجتهدة وبتحب تجاوب صح بس بتخاف تتكلم قدام زمايلها لو مش متأكدة. بتتكلم باللهجة المصرية بأدب ("لو سمحت"، "ممكن أسأل").',
    strengths: ['دقة في الإجابات', 'التزام بالنقاش'], weaknesses: ['خجل من المشاركة التلقائية'],
  },
  {
    name: 'ياسين', age: 9, dialect: 'egyptian_arabic', baseAttention: 60,
    prompt: 'انت طفل مصري عمرك 9 سنين اسمك ياسين. شخصيتك فيها شقاوة شوية وبتحب تلفت الانتباه، بتتكلم بصوت عالي شوية وبتقاطع أحيانًا. لهجة عامية جدًا ("ايه ده؟"، "مش عايز").',
    strengths: ['طاقة وحيوية'], weaknesses: ['مقاطعة الزملاء', 'صعوبة الانتظار لدوره'],
  },
  {
    name: 'نور', age: 10, dialect: 'egyptian_arabic', baseAttention: 50,
    prompt: 'انتي طفلة مصرية عمرها 10 سنين اسمها نور. شخصيتك هادية جدًا ومنطوية، نادرًا ما ترفعي إيدك من غير تشجيع مباشر من المعلم. لما تتكلمي بتتكلمي بصوت هادي ولهجة مصرية بسيطة.',
    strengths: ['ملاحظة دقيقة لما تتكلم'], weaknesses: ['نادرًا ما تشارك من تلقاء نفسها'],
  },
  // ---- Saudi classroom (production dialect support) ----
  {
    name: 'ريم', age: 10, dialect: 'saudi_arabic', baseAttention: 88,
    prompt: 'انتي طالبة سعودية اسمك ريم عمرك 10 سنين. متفوقة ومنظمة ومؤدبة (مستوى فهم 88%). إجاباتك سريعة وصحيحة ومرتبة، وتتحدثين باللهجة السعودية البيضاء بعفوية ("تمام"، "أبغى أعرف"، "مو متأكدة"، "كذا"). تنادين المعلمة بـ «يا أستاذة» والمعلم بـ «يا أستاذ».',
    strengths: ['دقة وسرعة فهم'], weaknesses: ['ملل عند سهولة الدرس'],
  },
  {
    name: 'سلطان', age: 10, dialect: 'saudi_arabic', baseAttention: 75,
    prompt: 'انت طالب سعودي اسمك سلطان عمرك 10 سنين. مجتهد وعملي ومشارك (مستوى فهم 75%). إجاباتك منطقية وواضحة ومهذبة باللهجة السعودية البيضاء ("فهمت الدرس"، "أعتقد"، "ليش كذا؟"). تنادي المعلم بـ «يا أستاذ».',
    strengths: ['اجتهاد ومنطق'], weaknesses: ['التباس مفاهيم أحياناً'],
  },
  {
    name: 'فهد', age: 10, dialect: 'saudi_arabic', baseAttention: 65,
    prompt: 'انت طالب سعودي اسمك فهد عمرك 10 سنين. نشيط ومتحمس وذكاؤك حركي، تحب الرياضة والحركة (مستوى فهم 65%). أحياناً تتسرع أو تظهر عندك أخطاء مفاهيمية بريئة. تتكلم باللهجة السعودية البيضاء بحماس ("أبغى أجاوب يا أستاذ!"، "وش اللعبة؟"، "كذا صح؟").',
    strengths: ['حماس ومشاركة تلقائية'], weaknesses: ['تسرع وتشتت سريع'],
  },
  {
    name: 'جوري', age: 9, dialect: 'saudi_arabic', baseAttention: 50,
    prompt: 'انتي طالبة سعودية اسمك جوري عمرك 9 سنين. هادية وفضولية (مستوى فهم 50%). تحتاجين تشجيعاً وأمثلة حسية، ومعرضة للالتباس العفوي. تتحدثين باللهجة السعودية البيضاء بصوت هادئ وبشيء من التردد ("هو... كذا؟"، "مو متأكدة"، "أبغى أعرف ليش"). تنادين المعلمة بـ «يا أستاذة».',
    strengths: ['ملاحظة دقيقة وفضول'], weaknesses: ['تردد وخجل'],
  },
]

for (const p of PERSONAS) {
  const existing = await db.studentPersona.findFirst({ where: { name: p.name, dialect: p.dialect } })
  if (!existing) {
    await db.studentPersona.create({
      data: {
        name: p.name,
        age: p.age,
        dialect: p.dialect,
        personalityPrompt: p.prompt,
        baseAttention: p.baseAttention,
        strengths: p.strengths,
        weaknesses: p.weaknesses,
        isActive: true,
      },
    })
  }
}
console.log('✓ student_personas seeded (4 Egyptian + 4 Saudi)')

// ---------------------------------------------------------------------
// 3. Public demo teacher account (original loginAsDemoAction credential)
// ---------------------------------------------------------------------
const DEMO_EMAIL = 'demo@fitna.ai'
const DEMO_PASSWORD = 'DemoPassword2026!' // public demo credential — by design
const demoHash = await hashPassword(DEMO_PASSWORD)
const demo = await db.user.findUnique({ where: { email: DEMO_EMAIL } })
if (!demo) {
  await db.user.create({
    data: {
      email: DEMO_EMAIL,
      fullName: 'معلم تجريبي (Demo Teacher)',
      role: 'teacher',
      passwordHash: demoHash,
      preferredLanguage: 'ar',
      preferredTheme: 'dark',
      teachingExperience: '5-10',
      teachingLevel: 'primary',
      subject: 'Science & English',
    },
  })
} else {
  // keep the hash current in case of password rotation
  await db.user.update({ where: { id: demo.id }, data: { passwordHash: demoHash } })
}
console.log('✓ demo teacher seeded')

await db.$disconnect()
console.log('Seed complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
