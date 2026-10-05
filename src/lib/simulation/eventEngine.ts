import { StudentBrainState, StudentPhysicalAction, getActionDescription } from "./classroomState";

export interface AutonomousClassroomEvent {
  id: string;
  type: "student_whisper" | "dropped_item" | "side_talk" | "spontaneous_question" | "lost_attention" | "none";
  primaryPersonaId: string | null;
  primaryStudentName: string | null;
  secondaryStudentName?: string | null;
  descriptionAr: string;
  spokenPrompt?: string | null;
  requiresTeacherIntervention: boolean;
}

/**
 * Evaluates whether a background spontaneous classroom event occurs.
 * This simulates real classroom dynamics:
 * - If teacher speaks for too long without asking questions (high consecutiveStatements).
 * - If a playful student's attention drops below 40%.
 * - If two students start whispering or someone drops a pencil.
 */
export function checkSpontaneousClassroomEvent(params: {
  students: StudentBrainState[];
  consecutiveTeacherStatements: number;
  secondsSinceLastInteraction: number;
  turnIndex: number;
}): AutonomousClassroomEvent {
  const { students, consecutiveTeacherStatements, secondsSinceLastInteraction } = params;

  // 1. Long monologue by teacher (> 4 consecutive explanation statements without questions)
  if (consecutiveTeacherStatements >= 4) {
    const yassin = students.find((s) => s.name === "ياسين");
    const omar = students.find((s) => s.name === "عمر");

    if (yassin && yassin.attention < 60) {
      yassin.physicalAction = "whispering";
      yassin.actionDescriptionAr = getActionDescription("whispering", yassin.name);

      return {
        id: `evt_${Date.now()}`,
        type: "student_whisper",
        primaryPersonaId: yassin.personaId,
        primaryStudentName: "ياسين",
        secondaryStudentName: omar ? "عمر" : undefined,
        descriptionAr: "ياسين بدأ يهمس لعمر ويسأله عن ماتش الكورة عشان الشرح طول",
        spokenPrompt: null,
        requiresTeacherIntervention: true,
      };
    }
  }

  // 2. High distraction probability for Yassin if attention drops
  const distractedYassin = students.find((s) => s.name === "ياسين" && s.attention < 35);
  if (distractedYassin && Math.random() < 0.45) {
    distractedYassin.physicalAction = "fidgeting";
    distractedYassin.actionDescriptionAr = getActionDescription("fidgeting", "ياسين");

    return {
      id: `evt_${Date.now()}`,
      type: "dropped_item",
      primaryPersonaId: distractedYassin.personaId,
      primaryStudentName: "ياسين",
      descriptionAr: "ياسين وقع المقلمة بتاعته على الأرض بالغلط وهو بيلعب بيها",
      spokenPrompt: null,
      requiresTeacherIntervention: true,
    };
  }

  // 3. Curiosity question from Sara if teacher pauses for a long time
  if (secondsSinceLastInteraction > 15) {
    const sara = students.find((s) => s.name === "سارة");
    if (sara && sara.attention > 70 && sara.understanding > 65) {
      sara.physicalAction = "hand_raised";
      sara.actionDescriptionAr = getActionDescription("hand_raised", "سارة");

      return {
        id: `evt_${Date.now()}`,
        type: "spontaneous_question",
        primaryPersonaId: sara.personaId,
        primaryStudentName: "سارة",
        descriptionAr: "سارة رفعت إيدها بدافع الفضول تسأل سؤال في سياق الدرس",
        spokenPrompt: "يا ميس، هو إحنا ممكن نطبق المثال ده في حاجة تانية؟",
        requiresTeacherIntervention: true,
      };
    }
  }

  return {
    id: `evt_${Date.now()}`,
    type: "none",
    primaryPersonaId: null,
    primaryStudentName: null,
    descriptionAr: "الفصل هادئ ومستقر",
    spokenPrompt: null,
    requiresTeacherIntervention: false,
  };
}
