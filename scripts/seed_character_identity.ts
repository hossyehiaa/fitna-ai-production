// Seed character identity fields for all 8 personas (deterministic, stable).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// Voice identity per character: Fish Audio reference IDs (gender-matched,
// dialect-native) + Edge neural voices per nationality.
const CHARACTERS = [
  // ---- Egyptian classroom (original four) ----
  {
    characterKey: 'omar_001', name: 'عمر', dialect: 'egyptian_arabic', gender: 'male', nationality: 'EG',
    avatarKey: 'omar', ageRange: '9-11', personality: 'فضولي وحيوي', speakingStyle: 'جمل قصيرة سريعة بنبرة متحمسة',
    fishVoiceId: '467b35bab13841858d89523da3e6102c', edgeVoice: 'ar-EG-ShakirNeural',
    strengths: ['سرعة البديهة', 'التفاعل السريع'], weaknesses: ['التشتت السريع'],
  },
  {
    characterKey: 'sara_001', name: 'سارة', dialect: 'egyptian_arabic', gender: 'female', nationality: 'EG',
    avatarKey: 'sara', ageRange: '10-12', personality: 'متفوقة ودقيقة ومنظمة', speakingStyle: 'إجابات واضحة ومؤدبة بصيغة المؤنث',
    fishVoiceId: 'c75d63900b55446aaa2d07593cc6bb2d', edgeVoice: 'ar-EG-SalmaNeural',
    strengths: ['الدقة', 'الالتزام'], weaknesses: ['التردد في المجازفة'],
  },
  {
    characterKey: 'yassin_001', name: 'ياسين', dialect: 'egyptian_arabic', gender: 'male', nationality: 'EG',
    avatarKey: 'yassin', ageRange: '8-10', personality: 'مرح وعفوي', speakingStyle: 'ردود تلقائية قصيرة بنبرة لاهية',
    fishVoiceId: 'cbe855302eaa45dda57867e1188b0228', edgeVoice: 'ar-EG-ShakirNeural',
    strengths: ['العفوية'], weaknesses: ['انخفاض الانتباه'],
  },
  {
    characterKey: 'nour_001', name: 'نور', dialect: 'egyptian_arabic', gender: 'female', nationality: 'EG',
    avatarKey: 'nour', ageRange: '9-11', personality: 'هادئة وخجولة ومدروسة', speakingStyle: 'صوت خفيض وردود متأنية بصيغة المؤنث',
    fishVoiceId: 'fb77d7877e404c0fb2427e7aec55b247', edgeVoice: 'ar-EG-SalmaNeural',
    strengths: ['التفكير العميق'], weaknesses: ['قلة المشاركة التلقائية'],
  },
  // ---- Saudi classroom ----
  {
    characterKey: 'sultan_001', name: 'سلطان', dialect: 'saudi_arabic', gender: 'male', nationality: 'SA',
    avatarKey: 'sultan', ageRange: '9-11', personality: 'واثق ومتعاون ومحب للمنافسة الشريفة', speakingStyle: 'جمل واثقة بنبرة سعودية فتية',
    fishVoiceId: '1d51fdd65ff14342aec4dffa0ef58386', edgeVoice: 'ar-SA-HamedNeural',
    strengths: ['الثقة', 'المشاركة الفعالة'], weaknesses: ['حب الظهور'],
  },
  {
    characterKey: 'fahad_001', name: 'فهد', dialect: 'saudi_arabic', gender: 'male', nationality: 'SA',
    avatarKey: 'fahad', ageRange: '9-11', personality: 'نشيط ومقاطع أحياناً بحماس', speakingStyle: 'جمل سريعة متحمسة بنبرة سعودية',
    fishVoiceId: '7b301c14ee0b447cb8705b7e247067e1', edgeVoice: 'ar-SA-HamedNeural',
    strengths: ['الحماس'], weaknesses: ['المقاطعة'],
  },
  {
    characterKey: 'reem_001', name: 'ريم', dialect: 'saudi_arabic', gender: 'female', nationality: 'SA',
    avatarKey: 'reem', ageRange: '10-12', personality: 'متفوقة ورزينة ومحببة لدى زميلاتها', speakingStyle: 'إجابات مرتبة بصوت أنثوي سعودي واضح',
    fishVoiceId: '14f1000b77d547eeb5f03b474dd29e0f', edgeVoice: 'ar-SA-ZariyahNeural',
    strengths: ['التفوق', 'التنظيم'], weaknesses: ['الحساسية من الخطأ أمام الزملاء'],
  },
  {
    characterKey: 'jouri_001', name: 'جوري', dialect: 'saudi_arabic', gender: 'female', nationality: 'SA',
    avatarKey: 'jouri', ageRange: '8-10', personality: 'خجولة وهادئة وتحتاج تشجيعاً', speakingStyle: 'ردود قصيرة مترددة بصوت أنثوي سعودي خافت',
    fishVoiceId: '7eee0787bf1a476fb0864270853e344a', edgeVoice: 'ar-SA-ZariyahNeural',
    strengths: ['الدقة عند المشاركة'], weaknesses: ['الخجل', 'قلة المبادرة'],
  },
]

async function main() {
  for (const c of CHARACTERS) {
    const updated = await db.studentPersona.updateMany({
      where: { name: c.name, dialect: c.dialect },
      data: {
        characterKey: c.characterKey,
        gender: c.gender,
        nationality: c.nationality,
        avatarKey: c.avatarKey,
        voiceProvider: 'fish',
        voiceId: c.fishVoiceId,
        edgeVoice: c.edgeVoice,
        personality: c.personality,
        speakingStyle: c.speakingStyle,
        ageRange: c.ageRange,
      },
    })
    console.log(`${c.characterKey} (${c.name}/${c.nationality}/${c.gender}): ${updated.count} row(s) updated`)
  }
  const total = await db.studentPersona.count()
  const withIdentity = await db.studentPersona.count({ where: { characterKey: { not: null } } })
  console.log(`\npersonas: ${total} total, ${withIdentity} with identity`)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
