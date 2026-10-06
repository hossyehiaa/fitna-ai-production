/**
 * Measure the actual LLM prompt sizes (chars + approx tokens) for both
 * dialects to quantify TTFT headroom from prompt slimming.
 */
import { buildClassroomSwarmSystemPrompt, buildCandidateStudentPrompt } from "../src/lib/ai/personas";

function approxTokens(s: string): number {
  // Arabic ≈ 1 token per ~2.5 chars with modern BPE (gpt tokenizer);
  // Latin/digits ≈ 1 per 4 chars. Blend conservatively.
  const arabic = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const other = s.length - arabic;
  return Math.round(arabic / 2.2 + other / 4);
}

const lesson = "درس عن الكسور وحالات المادة ودورة الماء";
const classmatesEG = ["سارة", "عمر", "ياسين", "نور"];
const classmatesSA = ["ريم", "سلطان", "فهد", "جوري"];

for (const [label, dialect, classmates] of [
  ["egyptian", "egyptian", classmatesEG],
  ["saudi", "saudi", classmatesSA],
] as [string, string, string[]][]) {
  const sys = buildClassroomSwarmSystemPrompt(lesson, dialect, classmates);
  const student = buildCandidateStudentPrompt({
    studentName: dialect === "saudi" ? "سلطان" : "عمر",
    age: 10,
    understanding: 75,
    confidence: 70,
    emotion: "confident",
    reasonToSpeak: "التعلم التشاركي",
    lessonContext: lesson,
    teacherUtterance: "يا سلطان، إيه أكبر كسر، اثنين على ستة ولا أربعة على ستة؟",
    recentHistory: "المعلم: درس النهاردة عن الكسور\nعمر: البسط فوق والمقام تحت يا مستر\nالمعلم: برافو يا عمر",
    teacherTitle: "يا مستر",
    isTargetStudent: true,
    activeMisconception: null,
    teacherExplanations: ["البسط هو الجزء اللي بناخده", "المقام هو عدد القطع كلها"],
    studentContributions: { عمر: ["البسط فوق"] },
    fullLessonHistory: "",
    dialect,
    classmates,
  } as Parameters<typeof buildCandidateStudentPrompt>[0]);
  const user = `${student}\n\nرد بصيغة JSON فقط بهذا الشكل تماماً:\n{\n  "text": "كلام الطالب المنطوق هنا فقط"\n}`;
  console.log(`${label}:`);
  console.log(`  system: ${sys.length} chars ≈ ${approxTokens(sys)} tokens`);
  console.log(`  student: ${student.length} chars ≈ ${approxTokens(student)} tokens`);
  console.log(`  total ≈ ${approxTokens(sys) + approxTokens(user)} tokens`);
}
