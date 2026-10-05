"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/context";
import { detectVoiceGenderFromBlob } from "@/lib/audio/pitchDetector";
import { normalizeSpeechTranscription } from "@/lib/audio/speechNormalizer";
import { StudentVideoCard } from "@/components/classroom/StudentVideoCard";
import {
  GraduationCap,
  BarChart2,
  MessageSquare,
  Mic,
  Headphones,
  AlertTriangle,
  Clock,
  Plus,
  Globe
} from "lucide-react";


type StudentState = "attentive" | "hand_raised" | "distracted";

type StudentUI = {
  personaId: string;
  name: string;
  age: number;
  attention: number;
  state: StudentState;
  physicalAction?: string;
  actionDescriptionAr?: string;
  // Character identity (persisted, deterministic):
  avatarKey?: string | null;
  gender?: string;
  nationality?: string;
  characterKey?: string | null;
};

type EventLogItem = {
  id: string;
  label: string;
  kind: "teacher" | "student" | "system";
  speakerName?: string;
  timeStr?: string;
};

type ClassroomStyle = "balanced" | "disruptive" | "disengaged";
type TrainingObjective = "socratic_focus" | "talk_time_reduction" | "inclusive_engagement" | "behavior_redirection";

export const SUBJECT_LANGUAGES = [
  { id: "auto", nameAr: "تلقائي (عربي ولغات العالم)", nameEn: "Auto (Multilingual)", flag: "AUTO", bcp47: "ar-EG" },
  { id: "de", nameAr: "ألماني (Deutsch)", nameEn: "German (Deutsch)", flag: "DE", bcp47: "de-DE" },
  { id: "en", nameAr: "إنجليزي (English)", nameEn: "English", flag: "EN", bcp47: "en-US" },
  { id: "fr", nameAr: "فرنسي (Français)", nameEn: "French (Français)", flag: "FR", bcp47: "fr-FR" },
  { id: "es", nameAr: "إسباني (Español)", nameEn: "Spanish (Español)", flag: "ES", bcp47: "es-ES" },
  { id: "it", nameAr: "إيطالي (Italiano)", nameEn: "Italian (Italiano)", flag: "IT", bcp47: "it-IT" },
  { id: "zh", nameAr: "صيني (中文)", nameEn: "Chinese (中文)", flag: "ZH", bcp47: "zh-CN" },
  { id: "ar", nameAr: "عربي (العامية المصرية)", nameEn: "Arabic (Egyptian)", flag: "AR", bcp47: "ar-EG" },
] as const;

export function LiveRoom({
  sessionId,
  durationMinutes,
  classroomStyle,
  trainingObjective,
  lessonContext,
  startedAt,
  initialStudents,
  teacherName,
  dialect = "egyptian",
}: {
  sessionId: string;
  durationMinutes: number;
  classroomStyle?: ClassroomStyle;
  trainingObjective?: TrainingObjective;
  lessonContext?: string | null;
  startedAt: string;
  initialStudents: { personaId: string; name: string; age: number; attention: number; avatarKey?: string | null; gender?: string; nationality?: string; characterKey?: string | null }[];
  teacherName?: string;
  dialect?: string;
}) {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const isRtl = lang === "ar";

  const [students, setStudents] = useState<StudentUI[]>(
    initialStudents.map((s) => ({ ...s, state: "attentive" as StudentState }))
  );
  const studentsRef = useRef<StudentUI[]>(students);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [speakingPersonaId, setSpeakingPersonaId] = useState<string | null>(null);
  const [activeSpeakingAudio, setActiveSpeakingAudio] = useState<HTMLAudioElement | null>(null);
  // ---- Live conversational state machine (production fix) ----
  // IDLE → LISTENING → PROCESSING → RESPONDING → SPEAKING → LISTENING …
  const [meetingState, setMeetingState] = useState<"idle" | "listening" | "processing" | "responding" | "speaking">("idle");
  // Finish callback of the CURRENTLY playing student audio (barge-in target)
  const activeAudioFinishRef = useRef<(() => void) | null>(null);
  // Sustained-voice tracker for barge-in while a student is speaking
  const bargeInVoiceSinceRef = useRef<number | null>(null);
  // Playback grace window (ms from playback start) before barge-in arms
  const playbackStartedAtRef = useRef<number>(0);
  // Latest utterance that arrived while a turn was processing — replayed
  // right after, so consecutive turns are never silently dropped.
  const pendingUtteranceRef = useRef<string | null>(null);
  // Per-stage latency (debug mode only — never shown to normal users)
  const latencyDebugRef = useRef<{ speechEndAt?: number; transcriptAt?: number; turnAt?: number; firstAudioAt?: number }>({});

  // Live HUD metrics
  const [teacherTalkMs, setTeacherTalkMs] = useState(0);
  const [studentTalkMs, setStudentTalkMs] = useState(0);
  const [questionCounts, setQuestionCounts] = useState({ open: 0, closed: 0 });
  const [respondedPersonaIds, setRespondedPersonaIds] = useState<Set<string>>(new Set());
  const [studentTurnCounts, setStudentTurnCounts] = useState<Record<string, number>>({});

  // Open Mic (Zoom Style) & Privacy states
  const [micMode, setMicMode] = useState<"open" | "push">("open");
  const [isLiveOpenMic, setIsLiveOpenMic] = useState(false);
  const [isTeacherMuted, setIsTeacherMuted] = useState(false);
  const [isTeacherSpeaking, setIsTeacherSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState("");
  const [isTranscriptProcessing, setIsTranscriptProcessing] = useState(false);

  const detectedSubjectLang = useMemo(() => {
    if (!lessonContext) return "auto";
    const ctx = lessonContext.toLowerCase();
    if (/ألماني|الماني|deutsch|german|allemand/.test(ctx)) return "de";
    if (/فرنساوي|فرنسي|français|francais|french/.test(ctx)) return "fr";
    if (/انجليزي|إنجليزي|انجلش|english|grammar|past\s*simple/.test(ctx)) return "en";
    if (/إسباني|اسباني|español|espanol|spanish/.test(ctx)) return "es";
    if (/إيطالي|ايطالي|italiano|italian/.test(ctx)) return "it";
    if (/صيني|chinese|mandarin|中文/.test(ctx)) return "zh";
    return "auto";
  }, [lessonContext]);

  const [selectedSubjectLang, setSelectedSubjectLang] = useState<string>(detectedSubjectLang);
  const selectedSubjectLangRef = useRef<string>(detectedSubjectLang);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);

  const initialBcp47 = useMemo(() => {
    const found = SUBJECT_LANGUAGES.find((l) => l.id === detectedSubjectLang);
    return found?.bcp47 ?? "ar-EG";
  }, [detectedSubjectLang]);

  const [micLanguage, setMicLanguage] = useState<string>(initialBcp47);
  const micLanguageRef = useRef<string>(initialBcp47);

  const [startedAtMs] = useState(() => new Date(startedAt).getTime());
  const [totalDurationMs, setTotalDurationMs] = useState(() => durationMinutes * 60 * 1000);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showTimeUpModal, setShowTimeUpModal] = useState(false);
  const [hasTriggeredTimeUp, setHasTriggeredTimeUp] = useState(false);
  const [isCardsCompact, setIsCardsCompact] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState<"stage" | "telemetry" | "discourse">("stage");
  const [hasUnseenDiscourse, setHasUnseenDiscourse] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const isHoldingSpaceRef = useRef<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const activeAudioMimeTypeRef = useRef<string>("audio/webm");

  // Open Mic & Speech Recognition Refs
  const isLiveOpenMicRef = useRef(false);
  const isTeacherMutedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const speakingPersonaIdRef = useRef<string | null>(null);
  const openMicStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const openMicRecorderRef = useRef<MediaRecorder | null>(null);
  const openMicChunksRef = useRef<Blob[]>([]);
  const openMicSliceStartRef = useRef<number>(0);
  const speechDetectedRef = useRef(false);
  const speechStartTimeRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);
  const isUtteranceRecordingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);
  const nativeTranscriptAccumulatorRef = useRef<string>("");
  const isSpeechRecognitionActiveRef = useRef<boolean>(false);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const restartSpeechRecognitionRef = useRef<(() => void) | null>(null);
  const isTeacherFemaleName = /(?:مريم|مرام|سارة|نور|فاطمة|منى|هدى|رنا|ياسمين|روان|آية|ندى|سلمى|إيمان|مي|هبة|شهد|جيجي|mariam|mary|sara|nour|fatma)/i.test(teacherName || "");
  const isTeacherMaleName = /(?:أحمد|احمد|محمد|محمود|علي|عمرو|خالد|يوسف|طارق|مصطفى|عمر|ابراهيم|إبراهيم|حسام|ahmed|mohamed|mahmoud|ali|omar|tarek)/i.test(teacherName || "");
  const detectedTeacherGenderRef = useRef<"male" | "female" | null>(isTeacherFemaleName ? "female" : isTeacherMaleName ? "male" : null);
  const lastInterimResultTimeRef = useRef<number>(0);
  const lastSubmittedTeacherTextRef = useRef<string>("");
  const lastSubmittedTimeRef = useRef<number>(0);

  useEffect(() => {
    isLiveOpenMicRef.current = isLiveOpenMic;
  }, [isLiveOpenMic]);

  useEffect(() => {
    isTeacherMutedRef.current = isTeacherMuted;
  }, [isTeacherMuted]);

  useEffect(() => {
    isProcessingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    speakingPersonaIdRef.current = speakingPersonaId;
  }, [speakingPersonaId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAtMs);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAtMs]);

  // Watch for session timer expiration to automatically prompt the teacher
  useEffect(() => {
    if (elapsedMs >= totalDurationMs && !hasTriggeredTimeUp && !ending && !cancelling) {
      setHasTriggeredTimeUp(true);
      setShowTimeUpModal(true);
      // Automatically mute teacher and pause open mic so expired session doesn't record ghost audio
      setIsTeacherMuted(true);
      isTeacherMutedRef.current = true;
    }
  }, [elapsedMs, totalDurationMs, hasTriggeredTimeUp, ending, cancelling]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [events]);

  const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
  const remainingLabel = `${Math.floor(remainingMs / 60000)}:${String(
    Math.floor((remainingMs % 60000) / 1000)
  ).padStart(2, "0")}`;

  // Pedagogical Teacher Talk Time (TTT) = Teacher Speech / Total Active Spoken Discourse
  const totalSpokenMs = teacherTalkMs + studentTalkMs;
  const teacherTalkRatio = totalSpokenMs > 0
    ? Math.min(100, Math.max(0, Math.round((teacherTalkMs / totalSpokenMs) * 100)))
    : 0;
  const totalQuestions = questionCounts.open + questionCounts.closed;
  const socraticRate = totalQuestions > 0 ? Math.round((questionCounts.open / totalQuestions) * 100) : 0;

  // Inclusivity & Equity Index (الشمولية والعدالة)
  const distinctCount = Object.keys(studentTurnCounts).length;
  const totalStudentTurns = Object.values(studentTurnCounts).reduce((a, b) => a + b, 0);
  let balanceFactor = 1.0;
  if (totalStudentTurns > 1 && distinctCount > 1) {
    const ideal = totalStudentTurns / distinctCount;
    const deviation =
      Object.values(studentTurnCounts).reduce((sum, c) => sum + Math.abs(c - ideal), 0) /
      (2 * totalStudentTurns);
    balanceFactor = Math.max(0.4, 1 - deviation);
  }
  const coveragePercent = students.length > 0 ? (distinctCount / students.length) * 100 : 0;
  const inclusivityIndex = Math.round(coveragePercent * (0.5 + 0.5 * balanceFactor));

  // Objective Status
  const objectiveStatus = (() => {
    const isEn = lang === "en";
    switch (trainingObjective) {
      case "socratic_focus": {
        const isSocraticHigh = socraticRate >= 70;
        const isTttTooHigh = teacherTalkRatio > 45;
        return {
          title: isEn ? "Socratic Questioning Focus" : "التركيز على الأسئلة السقراطية",
          target: isEn ? "Target: > 70%" : "المستهدف المستمر: > 70%",
          achieved: isSocraticHigh && !isTttTooHigh,
          current: `${socraticRate}%`,
          tip: isSocraticHigh
            ? isTttTooHigh
              ? (isEn
                  ? `Your questions are thought-provoking, but Teacher Talk Time is high (${teacherTalkRatio}%). Pause after questions and give students more floor time to elaborate.`
                  : `أسئلتك مفتوحة ومحفزة للتفكير، لكن وقت حديثك مرتفع (${teacherTalkRatio}%). توقف بعد السؤال وامنح الطلاب وقتاً أطول للإجابة والمناقشة.`)
              : (isEn ? "Excellent and balanced! Questions are stimulating and students have ample room to discuss." : "ممتاز ومتوازن! أسئلتك تحفيزية ومساحة حوار الطلاب كافية ومثمرة.")
            : (isEn ? 'Direct an inquiry starting with "What if..." or scaffold with a concrete, tangible example (like a balloon or container) to build understanding.' : 'وجّه سؤالاً استنتاجياً يبدأ بـ "ماذا لو..." أو ادعم بمثال حسي ملموس (كالبالونة أو الإناء) لمساعدة الطلاب على استنتاج المفهوم.'),
        };
      }
      case "talk_time_reduction": {
        const isTttBalanced = teacherTalkRatio >= 20 && teacherTalkRatio <= 40;
        return {
          title: isEn ? "Teacher Talk Time (TTT)" : "تقليل وقت حديث المعلم (TTT)",
          target: isEn ? "Target: 20-35%" : "المستهدف المستمر: 20-35%",
          achieved: isTttBalanced,
          current: `${teacherTalkRatio}%`,
          tip: isTttBalanced
            ? socraticRate < 50
              ? (isEn ? "Good talk time, but try elevating questions into open inquiries." : "وقت حديثك متوازن، ولكن حاول رفع مستوى الأسئلة لتكون مفتوحة واستنتاجية.")
              : (isEn ? "Great! Students have ample room to lead discourse and analyze ideas." : "رائع! الطلاب لديهم مساحة كافية للتعبير ونقاش الأفكار.")
            : (isEn ? `Teacher Talk Time is high (${teacherTalkRatio}%). Pause briefly after asking and let students respond.` : `وقت حديثك مرتفع (${teacherTalkRatio}%). توقف قليلاً بعد كل سؤال واسمح للطلاب بالإجابة وبناء الحوار.`),
        };
      }
      case "inclusive_engagement": {
        const isFullyInclusive = inclusivityIndex === 100;
        return {
          title: isEn ? "Inclusive Engagement" : "مؤشر الشمولية والعدالة",
          target: isEn ? "Target: 100%" : "المستهدف: إشراك 100% من الطلاب",
          achieved: isFullyInclusive,
          current: `${inclusivityIndex}%`,
          tip: isFullyInclusive
            ? teacherTalkRatio > 65
              ? (isEn ? "All students contributed, but try letting them speak longer." : "جميع الطلاب شاركوا، ولكن امنحهم وقتاً أطول للشرح وتعميق الأفكار.")
              : (isEn ? "Splendid! All students in class participated equitably." : "ممتاز! جميع طلاب الفصل شاركوا بعدالة وتفاعل إيجابي.")
            : (isEn ? `${distinctCount} of ${students.length} students contributed so far.` : `شارك ${distinctCount} من أصل ${students.length} طلاب حتى الآن. شجع الطلاب الهادئين على إبداء آرائهم.`),
        };
      }
      case "behavior_redirection": {
        const distractedCount = students.filter((s) => s.state === "distracted").length;
        return {
          title: isEn ? "Classroom Management & Redirection" : "إدارة السلوك والتشتت",
          target: isEn ? "Target: 0 Distracted" : "المستهدف: 0 مشتتين",
          achieved: distractedCount === 0,
          current: isEn ? `${distractedCount} distracted` : `${distractedCount} مشتت`,
          tip: distractedCount === 0
            ? (isEn ? "All students are engaged and attentive." : "كل الطلاب في حالة انتباه ممتازة.")
            : (isEn ? "Direct an encouraging question to distracted learners." : "وجه سؤالاً مشجعاً للطالب المتشتت لاستعادة تركيزه بحسم ولباقة."),
        };
      }
      default:
        return {
          title: isEn ? "Training Goal" : "الهدف التدريبي",
          target: isEn ? "Skill Growth" : "تحسين الأداء",
          achieved: true,
          current: "—",
          tip: isEn ? "Maintain supportive, active dialogue with students." : "استمر في الشرح والتفاعل الإيجابي مع الطلاب",
        };
    }
  })();

  const addEvent = useCallback((label: string, kind: EventLogItem["kind"], speakerName?: string) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setEvents((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, label, kind, speakerName, timeStr }]);
    setHasUnseenDiscourse(true);
  }, []);

  const createSafeMediaRecorder = useCallback((stream: MediaStream) => {
    let mimeType = "";
    if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
      ];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) {
          mimeType = c;
          break;
        }
      }
    }

    const isMp4 = mimeType.includes("mp4") || mimeType.includes("aac");
    let recorder: MediaRecorder;
    try {
      if (mimeType && !isMp4) {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      } else if (mimeType && isMp4) {
        // On iOS Safari, audioBitsPerSecond can throw NotSupportedError
        recorder = new MediaRecorder(stream, { mimeType });
      } else {
        recorder = new MediaRecorder(stream);
      }
    } catch {
      recorder = new MediaRecorder(stream);
    }
    activeAudioMimeTypeRef.current = recorder.mimeType || mimeType || (isMp4 ? "audio/mp4" : "audio/webm");
    return recorder;
  }, []);

  const startRecording = useCallback(async () => {
    if (recording || processing) return;
    setMicError(null);

    if (typeof window !== "undefined" && !window.isSecureContext && !navigator?.mediaDevices) {
      setMicError(
        lang === "en"
          ? "Microphone access requires a secure HTTPS connection on mobile devices."
          : "يتطلب تشغيل المايكروفون اتصالاً آمناً (HTTPS) على الهواتف. يرجى فتح الموقع عبر رابط HTTPS."
      );
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      setMicError(
        lang === "en"
          ? "Microphone is not supported in this browser. Please use Chrome or Safari."
          : "المتصفح الحالي لا يدعم التقاط الصوت. يرجى استخدام متصفح Safari أو Chrome مع منح الإذن."
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const recorder = createSafeMediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = activeAudioMimeTypeRef.current || (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4");
        const pushBlob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
        chunksRef.current = [];
        const directTranscript = nativeTranscriptAccumulatorRef.current.trim();
        nativeTranscriptAccumulatorRef.current = "";
        if (directTranscript) {
          const normalized = normalizeSpeechTranscription(directTranscript);
          setLiveTranscriptPreview(normalized);
          setIsTranscriptProcessing(true);
        }
        void handleRecordingComplete(pushBlob || undefined, undefined, directTranscript || undefined);
      };
      recordStartRef.current = Date.now();
      const isMp4 = (recorder.mimeType || activeAudioMimeTypeRef.current).includes("mp4");
      if (isMp4) {
        recorder.start();
      } else {
        recorder.start(100);
      }
      mediaRecorderRef.current = recorder;
      setRecording(true);

      // Also enable real-time speech preview during push-to-talk
      if (typeof window !== "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const pushRec = new SpeechRec();
            pushRec.continuous = true;
            pushRec.interimResults = true;
            pushRec.lang = getBcp47ForSubject(selectedSubjectLangRef.current);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pushRec.onresult = (event: any) => {
              let text = "";
              for (let i = 0; i < event.results.length; ++i) {
                text += event.results[i][0].transcript + " ";
              }
              const combined = text.trim();
              if (combined) {
                const normalized = normalizeSpeechTranscription(combined, { addPunctuation: false });
                nativeTranscriptAccumulatorRef.current = normalized;
                setLiveTranscriptPreview(normalized);
                setIsTranscriptProcessing(false);
              }
            };
            pushRec.start();
            speechRecognitionRef.current = pushRec;
          } catch {}
        }
      }
    } catch {
      setMicError(lang === "en" ? "Microphone access denied. Please grant permission." : "تعذّر الوصول إلى الميكروفون. يُرجى التأكد من منح الإذن في المتصفح.");
    }
  }, [recording, processing, lang]);

  const stopRecording = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  async function handleRecordingComplete(
    customBlob?: Blob,
    customSpeechDurationMs?: number,
    clientFallbackTranscript?: string
  ) {
    // A turn is already in flight: queue the latest utterance and replay it
    // the moment the current turn finishes — consecutive speech is never lost.
    if (isProcessingRef.current) {
      const queued = (clientFallbackTranscript || "").trim();
      if (queued.length >= 2) {
        pendingUtteranceRef.current = queued;
      }
      return;
    }
    isProcessingRef.current = true;
    setProcessing(true);
    setMeetingState("processing");
    latencyDebugRef.current = { speechEndAt: Date.now() };

    const speechDurationMs = customSpeechDurationMs ?? (Date.now() - recordStartRef.current);
    const blob = customBlob || (chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: "audio/webm" }) : null);

    if (!clientFallbackTranscript && (!blob || blob.size < 500)) {
      // No usable speech captured → explicit MSA retry state (never silent)
      isProcessingRef.current = false;
      setProcessing(false);
      setMeetingState("listening");
      setMicError(isRtl ? "تعذّر فهم الصوت. يُرجى المحاولة مرة أخرى." : "Could not understand the audio. Please try again.");
      return;
    }

    try {
      let audioBase64 = "";
      if (blob && blob.size > 0) {
        audioBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        });
      }

      let teacherText = "";

      // 1. Primary STT: Use the exact live transcript accumulated by SpeechRecognition in the browser.
      // This guarantees 100% WYSIWYG parity: what the teacher sees live in the banner is EXACTLY what goes to the chat!
      if (clientFallbackTranscript && clientFallbackTranscript.trim().length >= 2) {
        teacherText = normalizeSpeechTranscription(clientFallbackTranscript.trim());
      }

      // Diagnose teacher voice pitch and gender if audio blob is available
      if (blob && blob.size >= 500) {
        if (!detectedTeacherGenderRef.current && !isTeacherFemaleName && !isTeacherMaleName) {
          try {
            const detected = await detectVoiceGenderFromBlob(blob, audioContextRef.current);
            if (detected) {
              detectedTeacherGenderRef.current = detected;
              console.log("[Audio] Teacher voice pitch diagnosed gender:", detected);
            }
          } catch (pitchErr) {
            console.warn("Pitch detection failed:", pitchErr);
          }
        }

        // 2. Server STT Fallback: ONLY call Whisper if client SpeechRecognition did not produce text!
        // This strictly guarantees that Whisper NEVER overrides or alters the live transcript that the teacher saw on screen!
        if (!teacherText) {
          try {
            const sttForm = new FormData();
            const isMp4 = blob.type.includes("mp4") || blob.type.includes("aac");
            const audioFilename = isMp4 ? "utterance.mp4" : "utterance.webm";
            sttForm.append("audio", blob, audioFilename);
            if (lessonContext) {
              sttForm.append("lessonContext", lessonContext);
            }
            if (dialect) {
              sttForm.append("dialect", dialect);
            }
            if (selectedSubjectLangRef.current && selectedSubjectLangRef.current !== "auto") {
              sttForm.append("language", selectedSubjectLangRef.current);
            }
            const sttRes = await fetch("/api/stt", { method: "POST", body: sttForm });
            const sttJson = await safeJson(sttRes);
            if (sttRes.ok && sttJson.text && typeof sttJson.text === "string" && sttJson.text.trim().length >= 1) {
              teacherText = normalizeSpeechTranscription(sttJson.text.trim());
            } else if (sttJson.error && (sttJson.error.includes("صمت") || sttJson.error.includes("ضوضاء"))) {
              isProcessingRef.current = false;
              setProcessing(false);
              setIsTranscriptProcessing(false);
              setLiveTranscriptPreview("");
              return;
            }
          } catch (sttErr) {
            console.warn("Server STT fallback error:", sttErr);
          }
        }
      }

      if (!teacherText || teacherText.length < 2) {
        isProcessingRef.current = false;
        setProcessing(false);
        setIsTranscriptProcessing(false);
        setLiveTranscriptPreview("");
        return;
      }

      // Deduplication check: drop duplicate utterances within 4.5 seconds
      const cleanNorm = teacherText.replace(/[\s\p{P}]+/gu, "").toLowerCase();
      const lastNorm = lastSubmittedTeacherTextRef.current.replace(/[\s\p{P}]+/gu, "").toLowerCase();
      const now = Date.now();
      if (cleanNorm && lastNorm && cleanNorm === lastNorm && now - lastSubmittedTimeRef.current < 4500) {
        console.warn("[Turn] Duplicate teacher turn detected & dropped:", teacherText);
        isProcessingRef.current = false;
        setProcessing(false);
        setIsTranscriptProcessing(false);
        setLiveTranscriptPreview("");
        return;
      }
      lastSubmittedTeacherTextRef.current = teacherText;
      lastSubmittedTimeRef.current = now;
      latencyDebugRef.current.transcriptAt = Date.now();

      // Update live preview banner with confirmed teacher text so it stays displayed and matches chat 100%
      setLiveTranscriptPreview(teacherText);
      setIsTranscriptProcessing(true);

      addEvent(teacherText, "teacher", isRtl ? "أنت (المعلم)" : "You (Teacher)");

      const currentExactElapsedMs = Math.max(0, Date.now() - startedAtMs);

      const turnRes = await fetch(`/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherText,
          elapsedMs: currentExactElapsedMs,
          speechDurationMs,
          audioBase64,
          voiceGender: detectedTeacherGenderRef.current,
        }),
      });
      const turnJson = await safeJson(turnRes);
      latencyDebugRef.current.turnAt = Date.now();
      if (!turnRes.ok) {
        const msg = turnJson.error || (lang === "en" ? "Turn processing error" : "حدث خطأ مؤقت أثناء معالجة الرد");
        setMicError(turnJson.debug ? `${msg} (${turnJson.debug})` : String(msg));
        setMeetingState("listening");
        return;
      }

      setMeetingState("responding");
      setTeacherTalkMs((prev) => prev + speechDurationMs);
      // Speaker routing feedback: when the teacher explicitly addressed one
      // character, the log shows WHO was routed to (persistent identity).
      if (turnJson.routing?.explicitlyAddressed && turnJson.routing?.targetName) {
        addEvent(
          isRtl ? `توجيه السؤال إلى: ${turnJson.routing.targetName}` : `Routed to: ${turnJson.routing.targetName}`,
          "system"
        );
      }
      setQuestionCounts((prev) =>
        turnJson.questionType === "open"
          ? { ...prev, open: prev.open + 1 }
          : turnJson.questionType === "closed"
          ? { ...prev, closed: prev.closed + 1 }
          : prev
      );

      type TurnStudent = {
        personaId: string;
        name: string;
        text: string | null;
        state: StudentState;
        attention: number;
        physicalAction?: string;
        actionDescriptionAr?: string;
        audioBase64?: string;
      };

      let loggedSystemEvent = false;
      for (const s of turnJson.students as TurnStudent[]) {
        const prevStudent = studentsRef.current.find((st) => st.personaId === s.personaId);
        setStudents((prev) => {
          const next = prev.map((st) =>
            st.personaId === s.personaId
              ? {
                  ...st,
                  state: s.state,
                  attention: s.attention,
                  physicalAction: s.physicalAction,
                  actionDescriptionAr: s.actionDescriptionAr,
                }
              : st
          );
          studentsRef.current = next;
          return next;
        });
        if (s.text) {
          addEvent(s.text, "student", s.name);
          setRespondedPersonaIds((prev) => new Set(prev).add(s.personaId));
          setStudentTurnCounts((prev) => ({
            ...prev,
            [s.personaId]: (prev[s.personaId] ?? 0) + 1,
          }));
          // Track student spoken talk time (estimated by words, calibrated by audio)
          const words = s.text.trim().split(/\s+/).length;
          const estimatedStudentMs = Math.max(1500, words * 380);
          setStudentTalkMs((prev) => prev + estimatedStudentMs);

          try {
            let audioUrl = "";
            let shouldRevoke = false;

            // 1. FAST PATH: Server pre-synthesized audio attached directly to turn response!
            if (s.audioBase64) {
              audioUrl = s.audioBase64;
            } else {
              // 2. FALLBACK PATH: Call /api/tts — with the character's
              // avatar key so the backend picks the character's own voice.
              const stIdentity = studentsRef.current.find((st) => st.personaId === s.personaId);
              const ttsRes = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: s.text,
                  personaName: s.name,
                  dialect: dialect || undefined,
                  avatarKey: stIdentity?.avatarKey ?? undefined,
                }),
              });
              if (ttsRes.ok) {
                const audioBlob = await ttsRes.blob();
                audioUrl = URL.createObjectURL(audioBlob);
                shouldRevoke = true;
              } else {
                // TTS failed on BOTH paths → explicit MSA state, never silent
                addEvent(
                  isRtl ? "تعذّر تشغيل الصوت. يُرجى المحاولة مرة أخرى." : "Audio playback failed. Please try again.",
                  "system"
                );
              }
            }

            if (audioUrl) {
              const audio = new Audio(audioUrl);

              audio.onloadedmetadata = () => {
                if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
                  const actualMs = Math.round(audio.duration * 1000);
                  setStudentTalkMs((prev) => prev - estimatedStudentMs + actualMs);
                }
              };

              // Wait until student finishes speaking completely before proceeding.
              // BARGE-IN: the VAD watcher may call activeAudioFinishRef to stop
              // playback instantly when the teacher starts speaking.
              await new Promise<void>((resolve) => {
                let settled = false;
                const finish = (interrupted = false) => {
                  if (settled) return;
                  settled = true;
                  setSpeakingPersonaId(null);
                  speakingPersonaIdRef.current = null;
                  setActiveSpeakingAudio(null);
                  activeAudioFinishRef.current = null;
                  playbackStartedAtRef.current = 0;
                  if (shouldRevoke) {
                    URL.revokeObjectURL(audioUrl);
                  }
                  if (interrupted) {
                    try { audio.pause(); } catch {}
                    addEvent(
                      isRtl ? "تمت مقاطعة الطالب — يستمع الفصل إليك الآن." : "Student interrupted — the class is listening to you.",
                      "system"
                    );
                  }
                  resolve();
                };

                audio.onended = () => finish(false);
                audio.onerror = () => finish(false);

                // CRITICAL: Activate speaking state only when audio playback actually starts!
                audio.onplay = () => {
                  setSpeakingPersonaId(s.personaId);
                  speakingPersonaIdRef.current = s.personaId;
                  setActiveSpeakingAudio(audio);
                  setMeetingState("speaking");
                  playbackStartedAtRef.current = Date.now();
                  bargeInVoiceSinceRef.current = null;
                  // Expose the finish for barge-in interruption
                  activeAudioFinishRef.current = () => finish(true);
                  if (latencyDebugRef.current && !latencyDebugRef.current.firstAudioAt) {
                    latencyDebugRef.current.firstAudioAt = Date.now();
                    const L = latencyDebugRef.current;
                    if (process.env.NEXT_PUBLIC_DEBUG_LATENCY === "1") {
                      console.debug(
                        `[Latency] speechEnd→transcript ${((L.transcriptAt ?? 0) - (L.speechEndAt ?? 0))}ms | ` +
                          `transcript→turn ${((L.turnAt ?? 0) - (L.transcriptAt ?? 0))}ms | ` +
                          `turn→firstAudio ${((L.firstAudioAt ?? 0) - (L.turnAt ?? 0))}ms | ` +
                          `total ${(L.firstAudioAt ?? 0) - (L.speechEndAt ?? 0)}ms`
                      );
                    }
                  }
                };

                audio.play().catch(() => finish(false));
              });

              // Natural conversational breath pause (200ms)
              await new Promise((r) => setTimeout(r, 200));
            } else {
              setSpeakingPersonaId(null);
              speakingPersonaIdRef.current = null;
              setActiveSpeakingAudio(null);
            }
          } catch {
            setSpeakingPersonaId(null);
            speakingPersonaIdRef.current = null;
            setActiveSpeakingAudio(null);
          }
        } else if (!loggedSystemEvent && s.state === "distracted" && prevStudent?.state !== "distracted") {
          loggedSystemEvent = true;
          const isFemale = s.name === "سارة" || s.name === "نور";
          addEvent(
            `${s.name}: ${
              isRtl
                ? isFemale
                  ? "بدأت بالتشتت والانصراف عن الشرح"
                  : "بدأ بالتشتت والانصراف عن الشرح"
                : t.liveRoom.distractedEvent
            }`,
            "system"
          );
        } else if (!loggedSystemEvent && s.state === "hand_raised" && prevStudent?.state !== "hand_raised") {
          loggedSystemEvent = true;
          const isFemale = s.name === "سارة" || s.name === "نور";
          addEvent(
            `${s.name}: ${
              isRtl
                ? isFemale
                  ? "رفعت يدها للمشاركة"
                  : "رفع يده للمشاركة"
                : isFemale
                ? "raised her hand to speak"
                : "raised his hand to speak"
            }`,
            "system"
          );
        }
      }

      // NO SILENT TURNS: when the turn completed but no student spoke (the
      // classroom stayed silent during an explanation), the teacher still
      // gets explicit MSA feedback that the utterance was processed.
      const anyStudentSpoke = (turnJson.students as TurnStudent[]).some((st) => st.text);
      if (!anyStudentSpoke) {
        addEvent(
          isRtl ? "أنصت الطلاب إلى كلامك بهدوء." : "The students listened attentively.",
          "system"
        );
      }
    } catch (err) {
      console.error("Recording turn processing crashed:", err);
      setMicError(
        lang === "en"
          ? "Network connection error. Please try speaking again."
          : "حدث خطأ في الاتصال بالخادم. يُرجى المحاولة مرة أخرى."
      );
    } finally {
      isProcessingRef.current = false;
      setProcessing(false);
      setIsTranscriptProcessing(false);
      setLiveTranscriptPreview("");
      setMeetingState(isLiveOpenMicRef.current && !isTeacherMutedRef.current ? "listening" : "idle");
      if (isLiveOpenMicRef.current && !isTeacherMutedRef.current) {
        setTimeout(() => {
          restartSpeechRecognitionRef.current?.();
          // Replay the utterance that arrived while this turn was processing
          // — consecutive turns are never silently ignored.
          const pending = pendingUtteranceRef.current;
          pendingUtteranceRef.current = null;
          if (pending && pending.trim().length >= 2) {
            void handleRecordingComplete(undefined, 900, pending);
          }
        }, 150);
      }
    }
  }

  const startUtteranceRecording = useCallback(() => {
    const stream = openMicStreamRef.current;
    if (!stream || !stream.active || !isLiveOpenMicRef.current || isTeacherMutedRef.current) return;
    if (isUtteranceRecordingRef.current) return;

    try {
      const recorder = createSafeMediaRecorder(stream);

      openMicChunksRef.current = [];
      openMicSliceStartRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          openMicChunksRef.current.push(e.data);
        }
      };

      const isMp4 = (recorder.mimeType || activeAudioMimeTypeRef.current).includes("mp4");
      if (isMp4) {
        recorder.start();
      } else {
        recorder.start(100);
      }
      openMicRecorderRef.current = recorder;
      isUtteranceRecordingRef.current = true;
    } catch (err) {
      console.error("Failed to start utterance recording:", err);
    }
  }, [createSafeMediaRecorder]);

  const initSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return null;

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = micLanguageRef.current;

      rec.onstart = () => {
        isRecognitionRunningRef.current = true;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        if (
          !isLiveOpenMicRef.current ||
          isTeacherMutedRef.current ||
          isProcessingRef.current ||
          speakingPersonaIdRef.current !== null
        ) {
          return;
        }

        let fullAccumulated = "";
        let interim = "";
        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            fullAccumulated += res[0].transcript + " ";
          } else {
            interim += res[0].transcript;
          }
        }

        const combined = (fullAccumulated + interim).trim();
        if (combined) {
          const normalized = normalizeSpeechTranscription(combined, { addPunctuation: false });
          nativeTranscriptAccumulatorRef.current = normalized;
          setLiveTranscriptPreview(normalized);
          setIsTranscriptProcessing(false);
          speechDetectedRef.current = true;
          const now = Date.now();
          lastSpeechTimeRef.current = now;
          lastInterimResultTimeRef.current = now;
          if (!isUtteranceRecordingRef.current) {
            startUtteranceRecording();
          }
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (err: any) => {
        isRecognitionRunningRef.current = false;
        if (err?.error !== "no-speech") {
          console.warn("SpeechRecognition notice:", err?.error);
        }
        if (err?.error === "aborted" || err?.error === "network" || err?.error === "audio-capture") {
          setTimeout(() => {
            if (isLiveOpenMicRef.current && !isTeacherMutedRef.current && !isProcessingRef.current && speakingPersonaIdRef.current === null) {
              restartSpeechRecognitionRef.current?.();
            }
          }, 350);
        }
      };

      rec.onend = () => {
        isRecognitionRunningRef.current = false;
        if (
          isLiveOpenMicRef.current &&
          !isTeacherMutedRef.current &&
          !isProcessingRef.current &&
          speakingPersonaIdRef.current === null &&
          isSpeechRecognitionActiveRef.current
        ) {
          setTimeout(() => {
            if (!isRecognitionRunningRef.current) {
              restartSpeechRecognitionRef.current?.();
            }
          }, 150);
        }
      };

      return rec;
    } catch (err) {
      console.warn("SpeechRecognition init error:", err);
      return null;
    }
  }, [startUtteranceRecording]);

  const restartSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    if (
      !isLiveOpenMicRef.current ||
      isTeacherMutedRef.current ||
      isProcessingRef.current ||
      speakingPersonaIdRef.current !== null ||
      !isSpeechRecognitionActiveRef.current
    ) {
      return;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.abort();
      } catch {}
      speechRecognitionRef.current = null;
    }

    isRecognitionRunningRef.current = false;
    const rec = initSpeechRecognition();
    if (rec) {
      speechRecognitionRef.current = rec;
      try {
        rec.start();
        isRecognitionRunningRef.current = true;
      } catch (err) {
        console.warn("Error starting speech recognition, retrying shortly:", err);
        setTimeout(() => {
          try {
            if (speechRecognitionRef.current === rec && !isRecognitionRunningRef.current) {
              rec.start();
              isRecognitionRunningRef.current = true;
            }
          } catch {}
        }, 200);
      }
    }
  }, [initSpeechRecognition]);

  const getBcp47ForSubject = useCallback((langId: string) => {
    const found = SUBJECT_LANGUAGES.find((l) => l.id === langId);
    return found?.bcp47 ?? "ar-EG";
  }, []);

  const changeSubjectLanguage = useCallback((newLangId: string) => {
    setSelectedSubjectLang(newLangId);
    selectedSubjectLangRef.current = newLangId;
    const bcp47 = getBcp47ForSubject(newLangId);
    setMicLanguage(bcp47);
    micLanguageRef.current = bcp47;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.lang = bcp47;
      } catch (err) {
        console.warn("Failed to change speech recognition language:", err);
      }
    }
    if (isLiveOpenMicRef.current && !isTeacherMutedRef.current && !isProcessingRef.current) {
      restartSpeechRecognition();
    }
    setIsLangDropdownOpen(false);
  }, [getBcp47ForSubject, restartSpeechRecognition]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    }
    if (isLangDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isLangDropdownOpen]);

  useEffect(() => {
    restartSpeechRecognitionRef.current = restartSpeechRecognition;
  }, [restartSpeechRecognition]);

  const commitOpenMicTurn = useCallback(() => {
    // Abort active speech recognition to flush browser internal result buffers immediately
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {}
    }
    const directTranscript = nativeTranscriptAccumulatorRef.current.trim();
    nativeTranscriptAccumulatorRef.current = "";

    if (directTranscript) {
      const normalized = normalizeSpeechTranscription(directTranscript);
      setLiveTranscriptPreview(normalized);
      setIsTranscriptProcessing(true);
    }

    const recorder = openMicRecorderRef.current;
    isUtteranceRecordingRef.current = false;
    if (!recorder || recorder.state !== "recording") {
      if (directTranscript && directTranscript.length >= 2) {
        void handleRecordingComplete(undefined, 1000, directTranscript);
      } else {
        setLiveTranscriptPreview("");
        setIsTranscriptProcessing(false);
      }
      return;
    }

    const durationMs = Date.now() - openMicSliceStartRef.current;

    recorder.onstop = async () => {
      const mime = activeAudioMimeTypeRef.current || (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4");
      const blob = new Blob(openMicChunksRef.current, { type: mime });
      openMicChunksRef.current = [];

      const hasDirect = Boolean(directTranscript && directTranscript.trim().length >= 2);
      // Voice detection fallback: if browser SpeechRecognition produced text OR real voice audio was captured (> 1500 bytes and > 500ms),
      // we ALWAYS process the turn (falling back to server Whisper STT if needed) so teacher's speech is NEVER lost!
      const canFallbackToAudio = Boolean(blob && blob.size >= 400 && durationMs >= 300);

      if (hasDirect || canFallbackToAudio) {
        const preview = directTranscript
          ? normalizeSpeechTranscription(directTranscript)
          : (isRtl ? "جارِ التعرف على صوتك بدقة..." : "Transcribing audio...");
        setLiveTranscriptPreview(preview);
        setIsTranscriptProcessing(true);
        await handleRecordingComplete(blob, Math.max(durationMs, 600), directTranscript);
      } else {
        setLiveTranscriptPreview("");
        setIsTranscriptProcessing(false);
        if (isLiveOpenMicRef.current && !isTeacherMutedRef.current && speakingPersonaIdRef.current === null) {
          startUtteranceRecording();
        }
      }
    };

    try {
      recorder.stop();
    } catch (err) {
      console.error("Error stopping open mic recorder:", err);
    }
  }, [handleRecordingComplete, isRtl]);

  const forceInstantCommit = useCallback(() => {
    if (
      !isLiveOpenMicRef.current ||
      isTeacherMutedRef.current ||
      isProcessingRef.current ||
      speakingPersonaIdRef.current !== null
    ) {
      return;
    }

    speechDetectedRef.current = false;
    setIsTeacherSpeaking(false);
    commitOpenMicTurn();
  }, [commitOpenMicTurn]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute("contenteditable") === "true";

      if (e.code === "Space" && !isInput) {
        if (
          isLiveOpenMicRef.current &&
          !isTeacherMutedRef.current &&
          !isProcessingRef.current &&
          speakingPersonaIdRef.current === null
        ) {
          e.preventDefault();
          forceInstantCommit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [forceInstantCommit]);

  const setupVad = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;

      // Ensure AudioContext is active and not suspended by browser autoplay policy
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      ctx.onstatechange = () => {
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
      };

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let ambientNoiseFloor = 8;
      const MAX_CONTINUOUS_SPEECH_MS = 25000;

      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);

      vadIntervalRef.current = setInterval(() => {
        // ---- BARGE-IN WATCH ----
        // While a student is speaking the normal turn pipeline is paused,
        // but the microphone KEEPS MONITORING: if the teacher starts speaking
        // (sustained voice well above the ambient floor, past a short grace
        // window so playback echo can't trigger it), the student's audio
        // stops instantly and the room returns to LISTENING.
        if (
          isLiveOpenMicRef.current &&
          !isTeacherMutedRef.current &&
          !isProcessingRef.current &&
          speakingPersonaIdRef.current !== null
        ) {
          analyser.getByteFrequencyData(dataArray);
          let speechSum = 0;
          const speechBinsCount = Math.min(bufferLength, 28);
          for (let i = 1; i < speechBinsCount; i++) {
            speechSum += dataArray[i];
          }
          const speechAverage = speechSum / Math.max(1, speechBinsCount - 1);
          const interruptThreshold = Math.max(30, ambientNoiseFloor + 14);
          const now = Date.now();
          const graceMs = 700; // ignore the first moments of playback (echo)
          const sincePlaybackStart = playbackStartedAtRef.current ? now - playbackStartedAtRef.current : Infinity;

          if (speechAverage > interruptThreshold && sincePlaybackStart > graceMs) {
            if (bargeInVoiceSinceRef.current === null) {
              bargeInVoiceSinceRef.current = now;
            } else if (now - bargeInVoiceSinceRef.current >= 350) {
              // Sustained teacher voice → INTERRUPT the student mid-speech
              bargeInVoiceSinceRef.current = null;
              activeAudioFinishRef.current?.();
            }
          } else {
            bargeInVoiceSinceRef.current = null;
          }
          return;
        }

        // Pause VAD while a turn is processing or the teacher is muted
        if (
          !isLiveOpenMicRef.current ||
          isTeacherMutedRef.current ||
          isProcessingRef.current
        ) {
          setIsTeacherSpeaking(false);
          if (isUtteranceRecordingRef.current) {
            isUtteranceRecordingRef.current = false;
            if (openMicRecorderRef.current && openMicRecorderRef.current.state === "recording") {
              openMicRecorderRef.current.onstop = null;
              try {
                openMicRecorderRef.current.stop();
              } catch {}
            }
            openMicChunksRef.current = [];
          }
          speechDetectedRef.current = false;
          return;
        }

        // Auto-prime recording whenever teacher is free to speak
        if (!isUtteranceRecordingRef.current) {
          startUtteranceRecording();
        }

        // Keep-alive watchdog: ensure SpeechRecognition is freshly restarted if it stopped unexpectedly
        if (
          !isRecognitionRunningRef.current &&
          isSpeechRecognitionActiveRef.current &&
          !isTeacherMutedRef.current &&
          !isProcessingRef.current &&
          speakingPersonaIdRef.current === null
        ) {
          restartSpeechRecognitionRef.current?.();
        }

        analyser.getByteFrequencyData(dataArray);
        // Measure energy specifically in the human speech frequency band (bins 1 to 28, ~150Hz to ~4kHz)
        let speechSum = 0;
        const speechBinsCount = Math.min(bufferLength, 28);
        for (let i = 1; i < speechBinsCount; i++) {
          speechSum += dataArray[i];
        }
        const speechAverage = speechSum / Math.max(1, speechBinsCount - 1);

        // Adapt ambient noise floor dynamically when not actively speaking
        if (!speechDetectedRef.current) {
          ambientNoiseFloor = ambientNoiseFloor * 0.92 + speechAverage * 0.08;
        }

        // Adaptive thresholds with hysteresis (tuned for mobile):
        const startThreshold = Math.max(9, Math.min(30, ambientNoiseFloor + 4));
        const continueThreshold = Math.max(5, Math.min(20, ambientNoiseFloor + 2));

        // Visualizer level 0-100 based on voice activity relative to ambient floor
        const dynamicLevel = Math.max(0, speechAverage - ambientNoiseFloor);
        const level = Math.min(100, Math.round((dynamicLevel / 28) * 100));
        setAudioLevel(level);

        const now = Date.now();
        const isVoiceActive = speechDetectedRef.current
          ? speechAverage > continueThreshold
          : speechAverage > startThreshold;

        if (isVoiceActive) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            speechStartTimeRef.current = now;
            startUtteranceRecording();
          }
          lastSpeechTimeRef.current = now;
          setIsTeacherSpeaking(true);

          // Force commit turn if continuous speech reaches maximum ceiling (e.g., 25s)
          if (now - speechStartTimeRef.current > MAX_CONTINUOUS_SPEECH_MS) {
            speechDetectedRef.current = false;
            setIsTeacherSpeaking(false);
            commitOpenMicTurn();
            return;
          }
        } else {
          if (speechDetectedRef.current) {
            const silenceDuration = now - lastSpeechTimeRef.current;
            const speechDuration = lastSpeechTimeRef.current - speechStartTimeRef.current;

            // Only switch UI indicator off after a brief grace period (300ms)
            if (silenceDuration > 300) {
              setIsTeacherSpeaking(false);
            }

            // Adaptive natural pause:
            const hasAccumulatedText = nativeTranscriptAccumulatorRef.current.trim().length >= 2;
            const currentAccText = nativeTranscriptAccumulatorRef.current.trim();
            // Fast commit when the utterance looks like a question or a
            // direct call to a student — works for BOTH classrooms because
            // the student names come from the live session roster.
            const rosterNames = studentsRef.current
              .map((st) => st.name)
              .filter(Boolean)
              .join("|");
            const isQuestionOrCall =
              new RegExp(
                `(?:[؟?]|ليه|إيه|ايه|إزاي|ازاي|مين|هل|متى|أين|اين|كام|كم|فين|يا\s*(?:${rosterNames || "طلاب|شباب|جماعة"}|ولاد|شباب|جماعة|شطار)|جاوب|قول|شاركونا|شاركينا|تفضلي|اتفضلي|اتفضل|تفضل)\b`,
                "i"
              ).test(currentAccText);
            const effectiveSilenceMs = isQuestionOrCall ? 1200 : hasAccumulatedText ? 2000 : 2200;
            const minSpeechMs = hasAccumulatedText ? 200 : 350;

            const timeSinceInterim = now - (lastInterimResultTimeRef.current || 0);
            const isBrowserSpeechActive = timeSinceInterim < 1500;

            if (silenceDuration > effectiveSilenceMs && !isBrowserSpeechActive) {
              speechDetectedRef.current = false;
              setIsTeacherSpeaking(false);
              if (speechDuration >= minSpeechMs || hasAccumulatedText) {
                commitOpenMicTurn();
              } else {
                openMicChunksRef.current = [];
              }
            }
          } else {
            setIsTeacherSpeaking(false);
          }
        }
      }, 70);
    } catch (err) {
      console.error("VAD setup error:", err);
    }
  }, [commitOpenMicTurn, startUtteranceRecording]);

  const stopOpenMic = useCallback(() => {
    setIsLiveOpenMic(false);
    isLiveOpenMicRef.current = false;
    setIsTeacherMuted(false);
    isTeacherMutedRef.current = false;
    setIsTeacherSpeaking(false);
    isUtteranceRecordingRef.current = false;
    setAudioLevel(0);

    isSpeechRecognitionActiveRef.current = false;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {}
      speechRecognitionRef.current = null;
    }
    nativeTranscriptAccumulatorRef.current = "";
    setLiveTranscriptPreview("");

    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (openMicRecorderRef.current && openMicRecorderRef.current.state === "recording") {
      openMicRecorderRef.current.onstop = null;
      openMicRecorderRef.current.stop();
    }
    if (openMicStreamRef.current) {
      openMicStreamRef.current.getTracks().forEach((t) => t.stop());
      openMicStreamRef.current = null;
    }
  }, []);

  const startOpenMic = useCallback(async () => {
    if (processing) return;
    setMicError(null);

    // CRITICAL: Unlock AudioContext synchronously during user gesture for iOS Safari & Android
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    } catch {}

    if (typeof window !== "undefined" && !window.isSecureContext && !navigator?.mediaDevices) {
      setMicError(
        lang === "en"
          ? "Microphone access requires a secure HTTPS connection on mobile devices."
          : "يتطلب تشغيل المايكروفون اتصالاً آمناً (HTTPS) على الهواتف. يرجى فتح الموقع عبر رابط HTTPS."
      );
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      setMicError(
        lang === "en"
          ? "Microphone is not supported in this browser. Please use Chrome or Safari."
          : "المتصفح الحالي لا يدعم التقاط الصوت. يرجى استخدام متصفح Safari أو Chrome مع منح الإذن."
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      openMicStreamRef.current = stream;
      setIsLiveOpenMic(true);
    setMeetingState("listening");
      isLiveOpenMicRef.current = true;
      setIsTeacherMuted(false);
      isTeacherMutedRef.current = false;

      isSpeechRecognitionActiveRef.current = true;
      restartSpeechRecognitionRef.current?.();

      setupVad(stream);
      startUtteranceRecording();
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      const isPermissionDenied = errorObj?.name === "NotAllowedError" || errorObj?.name === "PermissionDeniedError";
      setMicError(
        isPermissionDenied
          ? (lang === "en" ? "Microphone permission denied. Please allow microphone in site settings." : "تم رفض إذن المايكروفون. يرجى السماح بالوصول للمايكروفون من إعدادات المتصفح.")
          : (lang === "en" ? "Microphone access denied. Please grant permission." : "تعذّر الوصول إلى الميكروفون. يُرجى التأكد من منح الإذن في المتصفح.")
      );
    }
  }, [processing, lang, setupVad, startUtteranceRecording]);

  const toggleTeacherMute = useCallback(() => {
    setIsTeacherMuted((prev) => {
      const next = !prev;
      isTeacherMutedRef.current = next;
      if (openMicStreamRef.current) {
        openMicStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      if (next) {
        // Discard currently recording chunk and pause speech recognition
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.abort();
          } catch {}
        }
        nativeTranscriptAccumulatorRef.current = "";
        setLiveTranscriptPreview("");

        isUtteranceRecordingRef.current = false;
        if (openMicRecorderRef.current && openMicRecorderRef.current.state === "recording") {
          openMicRecorderRef.current.onstop = null;
          try {
            openMicRecorderRef.current.stop();
          } catch {}
        }
        openMicChunksRef.current = [];
        speechDetectedRef.current = false;
        setIsTeacherSpeaking(false);
        setAudioLevel(0);
      } else {
        restartSpeechRecognitionRef.current?.();
      }
      return next;
    });
  }, []);

  // Clean up open mic on unmount
  useEffect(() => {
    return () => {
      stopOpenMic();
    };
  }, [stopOpenMic]);

  // Spacebar hold-to-talk handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isHoldingSpaceRef.current && e.target === document.body) {
        if (isLiveOpenMicRef.current) return;
        e.preventDefault();
        isHoldingSpaceRef.current = true;
        void startRecording();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && isHoldingSpaceRef.current) {
        if (isLiveOpenMicRef.current) return;
        e.preventDefault();
        isHoldingSpaceRef.current = false;
        stopRecording();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startRecording, stopRecording]);

  async function handleEndSimulation() {
    setEnding(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveTeacherTalkRatio: teacherTalkRatio }),
      });
      if (res.ok) {
        router.push(`/report/${sessionId}`);
      } else {
        const json = await safeJson(res);
        setMicError(json.error || t.common.error);
        setEnding(false);
        setShowEndModal(false);
      }
    } catch {
      setMicError(t.common.error);
      setEnding(false);
      setShowEndModal(false);
    }
  }

  async function handleEndWithoutSaving() {
    setCancelling(true);
    try {
      const supabase = createClient();
      await supabase.from("sessions").update({ status: "abandoned" }).eq("id", sessionId);
      router.push("/dashboard/teacher");
    } catch (err) {
      console.error("Failed to cancel session:", err);
      router.push("/dashboard/teacher");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      className="bg-[#030B18] text-[#F6F0E4] font-readex antialiased h-screen flex flex-col overflow-hidden selection:bg-[#12B8C4] selection:text-[#030B18]"
      dir={isRtl ? "rtl" : "ltr"}
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% -10%, rgba(18, 184, 196, 0.14) 0%, transparent 60%),
          radial-gradient(circle at 10% 40%, rgba(255, 181, 46, 0.05) 0%, transparent 45%),
          radial-gradient(circle at 90% 85%, rgba(217, 107, 88, 0.05) 0%, transparent 50%)
        `,
      }}
    >
      {/* Executive Control Bar (HUD Header) */}
      <header className="min-h-16 sm:h-20 bg-[#051329]/95 backdrop-blur-xl border-b border-white/10 px-3 sm:px-8 py-2 sm:py-0 flex items-center justify-between shrink-0 z-30 shadow-2xl gap-2">
        {/* Left Section: Termination & Audio Status */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => setShowEndModal(true)}
            disabled={ending || cancelling}
            className="group px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-[#D96B58]/15 hover:bg-[#D96B58] text-[#D96B58] hover:text-white border border-[#D96B58]/30 hover:border-[#D96B58] font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all duration-200 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-sm bg-[#D96B58] group-hover:bg-white transition" />
            <span>
              {ending ? (
                isRtl ? "جاري الحفظ..." : "Ending..."
              ) : (
                <>
                  <span className="hidden sm:inline">{isRtl ? "إنهاء وحفظ التقرير" : "End & Save Report"}</span>
                  <span className="sm:hidden">{isRtl ? "إنهاء وحفظ" : "End"}</span>
                </>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowDiscardModal(true)}
            disabled={ending || cancelling}
            className="px-2 sm:px-3.5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 text-[#F6F0E4]/70 hover:text-white border border-white/10 hover:border-white/20 font-bold text-xs flex items-center gap-1.5 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
            title={isRtl ? "إنهاء الجلسة دون حفظ" : "Exit without saving"}
          >
            <svg className="w-3.5 h-3.5 text-[#D96B58]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden sm:inline">{isRtl ? "إنهاء دون حفظ" : "Exit Without Saving"}</span>
          </button>

          <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#0B2349]/55 border border-white/10 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#12B8C4] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#12B8C4]" />
            </span>
            <span className="text-[#F6F0E4]/70 font-medium">
              {isRtl ? "اللاقط الصوتي:" : "Audio Receiver:"} <strong className="text-[#12B8C4]">Active HD</strong>
            </span>
          </div>
        </div>

        {/* Center Section: Precision Digital Countdown Clock */}
        <div
          onClick={() => {
            if (remainingMs === 0) setShowTimeUpModal(true);
          }}
          className={`flex items-center gap-2 sm:gap-3.5 bg-[#030B18]/80 px-2.5 sm:px-6 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border ${
            remainingMs === 0 ? "border-red-500/50 bg-red-950/30 cursor-pointer animate-pulse" : "border-white/10"
          } shadow-inner transition-colors`}
        >
          <div className="flex items-center gap-1.5 text-[#FFB52E]">
            <svg className={`w-3.5 sm:w-4 h-3.5 sm:h-4 ${remainingMs === 0 ? "text-red-400 animate-bounce" : "animate-pulse"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`text-[10px] font-mono tracking-wider uppercase hidden sm:inline ${remainingMs === 0 ? "text-red-300 font-bold" : "text-[#FFB52E]/80"}`}>
              {remainingMs === 0 ? (isRtl ? "انتهى الوقت" : "Time's Up") : (isRtl ? "الوقت المتبقي" : "Time Left")}
            </span>
          </div>
          <div className="h-3.5 sm:h-4 w-px bg-white/10" />
          <span className={`font-mono text-base sm:text-2xl font-black tracking-widest ${remainingMs === 0 ? "text-red-400" : "text-[#FFB52E]"}`}>
            {remainingLabel}
          </span>
        </div>

        {/* Right Section: System Identity & Challenge Badge */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden lg:flex flex-col text-start">
            <span className="text-[10px] font-mono text-[#F6F0E4]/40 uppercase tracking-widest">
              {isRtl ? "النمط المفعل" : "Active Style"}
            </span>
            <span className="text-xs font-bold text-[#F6F0E4]/90">
              {classroomStyle === "disruptive"
                ? (isRtl ? "فصل نشط ومقاطعات" : "Active & Disruptive")
                : classroomStyle === "disengaged"
                ? (isRtl ? "فصل خامل وهادئ" : "Passive & Quiet")
                : (isRtl ? "فصل متوازن ومعياري" : "Balanced Standard")}
            </span>
          </div>

          <div className="h-7 w-px bg-white/10 hidden lg:block" />

          {/* Official Fitna Logo Lockup */}
          <Link
            href="/dashboard/teacher"
            className="flex items-center group py-1"
            title={isRtl ? "العودة إلى لوحة التحكم" : "Dashboard"}
          >
            <div className="sm:hidden">
              <Logo variant="light" height={26} />
            </div>
            <div className="hidden sm:block">
              <Logo variant="light" height={38} className="transition-transform duration-200 group-hover:scale-105" />
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Segmented View Switcher (md:hidden) */}
      <div className="md:hidden flex items-center justify-around bg-[#051329] border-b border-white/10 px-2 py-1.5 shrink-0 z-20">
        <button
          type="button"
          onClick={() => setMobileActiveTab("stage")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            mobileActiveTab === "stage"
              ? "bg-[#12B8C4]/20 text-[#12B8C4] border border-[#12B8C4]/40 shadow-sm"
              : "text-[#F6F0E4]/60 hover:text-white"
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>{isRtl ? "الفصل" : "Classroom"}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileActiveTab("telemetry")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            mobileActiveTab === "telemetry"
              ? "bg-[#FFB52E]/20 text-[#FFB52E] border border-[#FFB52E]/40 shadow-sm"
              : "text-[#F6F0E4]/60 hover:text-white"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>{isRtl ? "المؤشرات" : "Telemetry"}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileActiveTab("discourse");
            setHasUnseenDiscourse(false);
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
            mobileActiveTab === "discourse"
              ? "bg-[#0ea5e9]/20 text-cyan-300 border border-cyan-400/40 shadow-sm"
              : "text-[#F6F0E4]/60 hover:text-white"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{isRtl ? "سجل الحوار" : "Discourse"}</span>
          {hasUnseenDiscourse && mobileActiveTab !== "discourse" && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping absolute top-1 right-2" />
          )}
        </button>
      </div>

      {/* 3-Pane Command Cockpit */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Side HUD 1: Target Diagnostics & Instant Telemetry (320px) */}
        <aside
          className={`w-full md:w-80 bg-[#051329]/70 backdrop-blur-lg border-b md:border-b-0 md:border-l rtl:md:border-l ltr:md:border-r border-white/10 p-4 sm:p-6 flex-col justify-between shrink-0 overflow-y-auto order-2 md:order-1 ${
            mobileActiveTab === "telemetry" ? "flex flex-grow h-full" : "hidden md:flex"
          }`}
        >
          <div className="space-y-5">
            {/* Section Title */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FFB52E]" />
                <h2 className="text-xs font-bold text-white tracking-wide uppercase">
                  {isRtl ? "لوحة الأهداف المعيارية" : "Telemetry Diagnostics"}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-[#F6F0E4]/40">HUD-TELEMETRY</span>
            </div>

            {/* Target Mission Card */}
            <div className="relative bg-gradient-to-b from-[#0B2349]/55 to-[#112F5E]/45 p-5 rounded-2xl border border-[#12B8C4]/30 shadow-lg space-y-3 overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#12B8C4]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#FFB52E] bg-[#FFB52E]/10 px-2 py-0.5 rounded border border-[#FFB52E]/20">
                  {isRtl ? "الهدف البيداغوجي الأساسي" : "Core Pedagogical Goal"}
                </span>
                <span className="w-2 h-2 rounded-full bg-[#12B8C4] animate-ping" />
              </div>

              <div>
                <h3 className="font-black text-base text-white">{objectiveStatus.title}</h3>
                <span className="text-xs text-[#F6F0E4]/50 font-mono block mt-0.5">{objectiveStatus.target}</span>
              </div>

              {/* Live Intervention Hint */}
              <div className="bg-[#030B18]/60 border border-white/5 p-3 rounded-xl text-xs text-[#F6F0E4]/80 leading-relaxed space-y-1">
                <span className="font-bold text-[#FFB52E] text-[11px] block">
                  {isRtl ? "توجيه ذكي فوري:" : "Live AI Prompt:"}
                </span>
                <p className="text-[11px] text-[#F6F0E4]/70 leading-relaxed">{objectiveStatus.tip}</p>
              </div>
            </div>

            {/* Live Numeric Matrix Cards */}
            <div className="space-y-3">
              {/* Metric 1 */}
              <div className="p-4 rounded-2xl bg-[#0B2349]/40 border border-white/10 flex items-center justify-between hover:border-[#12B8C4]/40 transition">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#F6F0E4]/80 block">
                    {isRtl ? "نسبة حديث المعلم (TTT)" : "Teacher Talk Time (TTT)"}
                  </span>
                  <span className="text-[10px] text-[#F6F0E4]/40 font-mono">
                    {isRtl ? "النطاق المتوازن: 20-35%" : "Balanced: 20-35%"}
                  </span>
                </div>
                <div className="text-right rtl:text-right ltr:text-left">
                  <span className="font-mono text-2xl font-black text-[#12B8C4]">{teacherTalkRatio}%</span>
                </div>
              </div>

              {/* Metric 2 */}
              <div className="p-4 rounded-2xl bg-[#0B2349]/40 border border-white/10 flex items-center justify-between hover:border-[#12B8C4]/40 transition">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#F6F0E4]/80 block">
                    {isRtl ? "الأسئلة السقراطية" : "Socratic Questions"}
                  </span>
                  <span className="text-[10px] text-[#F6F0E4]/40 font-mono">
                    {isRtl ? "الهدف المحدد: > 70%" : "Goal: > 70%"}
                  </span>
                </div>
                <div className="text-right rtl:text-right ltr:text-left">
                  <span className="font-mono text-2xl font-black text-[#FFB52E]">{socraticRate}%</span>
                </div>
              </div>

              {/* Metric 3 */}
              <div className="p-4 rounded-2xl bg-[#0B2349]/40 border border-white/10 flex items-center justify-between hover:border-[#12B8C4]/40 transition">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#F6F0E4]/80 block">
                    {isRtl ? "مؤشر الشمولية والعدالة" : "Inclusivity Index"}
                  </span>
                  <span className="text-[10px] text-[#F6F0E4]/40 font-mono">
                    {isRtl
                      ? `المشاركون: ${distinctCount} من أصل ${students.length}`
                      : `${distinctCount} of ${students.length} Participated`}
                  </span>
                </div>
                <div className="text-right rtl:text-right ltr:text-left">
                  <span className="font-mono text-2xl font-black text-[#D96B58]">{inclusivityIndex}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Micro Spectrum */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[#F6F0E4]/40">
            <span>LATENCY: 42ms</span>
            <span className="text-[#12B8C4]">AI COGNITION: OK</span>
          </div>
        </aside>

        {/* Center Stage: The Interactive Virtual Classroom Amphitheater */}
        <main
          className={`flex-grow flex-col justify-between p-2.5 sm:p-5 relative overflow-y-auto min-h-0 order-1 md:order-2 custom-scrollbar ${
            mobileActiveTab === "stage" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Top Stage Header & Size Controls */}
          <div className="flex justify-between items-center text-xs text-[#F6F0E4]/70 font-mono pb-2 shrink-0">
            <span className="hidden sm:inline">VIRTUAL CLASSROOM SPACE #{sessionId.slice(0, 4).toUpperCase()}</span>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4] animate-pulse" />
                ACOUSTIC ENGINE ACTIVE
              </span>
            </div>
          </div>

          {micError && (
            <div className="my-2 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-xs text-red-200 text-center font-semibold animate-in fade-in shrink-0">
              {micError}
            </div>
          )}

          {/* 3D Pixar Live Video Classroom Cards Grid (Zoom/Teams Remote Learning Style) */}
          <div className="max-w-md sm:max-w-lg w-full mx-auto my-auto grid grid-cols-2 gap-2 sm:gap-3 py-1">
            {students.slice(0, 4).map((s) => {
              const isSpeaking = speakingPersonaId === s.personaId;
              return (
                <StudentVideoCard
                  key={s.personaId}
                  name={s.name}
                  age={s.age}
                  attention={s.attention}
                  avatarKey={s.avatarKey}
                  state={s.state}
                  isSpeaking={isSpeaking}
                  audioElement={isSpeaking ? activeSpeakingAudio : null}
                  compact={isCardsCompact}
                />
              );
            })}
          </div>

          {/* Bottom Voice Interactive Deck (Sticky & Guaranteed Reachable) */}
          <div className="flex flex-col items-center justify-center pt-2 pb-1 z-20 space-y-2.5 w-full max-w-xl mx-auto shrink-0 sticky bottom-0 bg-[#030B18]/90 backdrop-blur-md rounded-2xl px-2">
            {/* Live Interactive Classroom Indicator & Language Switcher */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-[#12B8C4]/15 to-[#0ea5e9]/15 border border-[#12B8C4]/25 text-[#12B8C4] text-[11px] sm:text-xs font-bold shadow-sm backdrop-blur-md">
                <span className={`w-2 h-2 rounded-full ${isLiveOpenMic && !isTeacherMuted ? "bg-emerald-400 animate-ping" : "bg-emerald-400"}`} />
                <span className="hidden sm:inline">{isRtl ? "حصة تفاعلية مباشرة (الميكروفون مفتوح)" : "Live Open Mic"}</span>
                <span className="sm:hidden">{isRtl ? "ميكروفون مفتوح" : "Open Mic"}</span>
              </div>

              {/* Conversational State Machine Indicator (MSA — production fix) */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-[11px] sm:text-xs font-semibold backdrop-blur-md shadow-sm transition-colors"
                aria-live="polite"
                style={{
                  background:
                    meetingState === "processing" || meetingState === "responding"
                      ? "rgba(245,158,11,0.12)"
                      : meetingState === "speaking"
                      ? "rgba(18,184,196,0.12)"
                      : "rgba(16,185,129,0.10)",
                  borderColor:
                    meetingState === "processing" || meetingState === "responding"
                      ? "rgba(245,158,11,0.35)"
                      : meetingState === "speaking"
                      ? "rgba(18,184,196,0.4)"
                      : "rgba(16,185,129,0.3)",
                  color:
                    meetingState === "processing" || meetingState === "responding"
                      ? "#FBBF24"
                      : meetingState === "speaking"
                      ? "#12B8C4"
                      : "#34D399",
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    meetingState === "processing" || meetingState === "responding" || meetingState === "speaking"
                      ? "animate-pulse"
                      : ""
                  }`}
                  style={{ background: "currentColor" }}
                />
                <span>
                  {isRtl
                    ? meetingState === "idle"
                      ? "جاهز للبدء"
                      : meetingState === "listening"
                      ? "الفصل يستمع إليك"
                      : meetingState === "processing"
                      ? "جارٍ معالجة ردّك..."
                      : meetingState === "responding"
                      ? "يجهّز الطلاب ردودهم..."
                      : "الطالب يتحدث — يمكنك المقاطعة"
                    : meetingState === "idle"
                    ? "Ready"
                    : meetingState === "listening"
                    ? "The class is listening"
                    : meetingState === "processing"
                    ? "Processing your reply..."
                    : meetingState === "responding"
                    ? "Students are preparing replies..."
                    : "Student speaking — you can interrupt"}
                </span>
              </div>

              {/* Subject Language Selector Dropdown */}
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#051329]/90 hover:bg-[#082042] border border-[#12B8C4]/30 hover:border-[#12B8C4]/60 text-[#12B8C4] text-xs font-semibold backdrop-blur-md shadow-md transition-all cursor-pointer select-none"
                  title={isRtl ? "اضغط لتغيير لغة المادة والتعرف على الصوت" : "Click to switch classroom subject language"}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {SUBJECT_LANGUAGES.find((l) => l.id === selectedSubjectLang)?.[isRtl ? "nameAr" : "nameEn"] ?? (isRtl ? "تلقائي" : "Auto")}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-[#12B8C4] transition-transform duration-200 ${isLangDropdownOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isLangDropdownOpen && (
                  <div
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 max-h-72 overflow-y-auto bg-[#030B18]/95 border border-[#12B8C4]/40 rounded-2xl shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="px-2.5 py-1.5 text-[10px] font-bold text-[#F6F0E4]/50 border-b border-white/5 uppercase tracking-wider mb-1">
                      {isRtl ? "لغة الشرح والمادة الدراسية" : "Classroom Subject Language"}
                    </div>
                    {SUBJECT_LANGUAGES.map((langItem) => {
                      const isSelected = selectedSubjectLang === langItem.id;
                      return (
                        <button
                          key={langItem.id}
                          type="button"
                          onClick={() => changeSubjectLanguage(langItem.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-start cursor-pointer ${
                            isSelected
                              ? "bg-gradient-to-r from-[#12B8C4]/25 to-cyan-500/10 text-white border border-[#12B8C4]/40 font-bold"
                              : "text-[#F6F0E4]/80 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-sm">{langItem.flag}</span>
                            <span>{isRtl ? langItem.nameAr : langItem.nameEn}</span>
                          </span>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#12B8C4]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Live Interactive Voice Controller Deck */}
            <div className="w-full flex flex-col items-center gap-3">
                {!isLiveOpenMic ? (
                  /* Initial State: Prompt to Open Mic */
                  <div className="flex flex-col items-center gap-2 text-center">
                    <button
                      type="button"
                      onClick={() => void startOpenMic()}
                      disabled={processing}
                      className="group relative px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#12B8C4] to-cyan-500 text-[#030B18] font-extrabold text-sm shadow-xl shadow-[#12B8C4]/30 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-3 cursor-pointer"
                    >
                      <span className="w-3 h-3 rounded-full bg-[#030B18] animate-ping" />
                      <svg className="w-5 h-5 text-[#030B18]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v7.5a3 3 0 006 0V4.5a3 3 0 00-3-3z" />
                      </svg>
                      {isRtl ? "بدء الحصة وفتح المايك المباشر" : "Start Live Open Mic"}
                    </button>
                  </div>
                ) : (
                  /* Active Open Mic State with Privacy Mute and Visualizer */
                  <div className="w-full flex flex-col items-center gap-2.5">
                    {/* Live Status Orb & Audio Visualizer */}
                    <div className="flex items-center justify-between w-full max-w-md px-4 py-2.5 rounded-2xl bg-[#051329]/80 border border-white/10 backdrop-blur-xl shadow-lg">
                      {/* Left Status Indicator */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            isTeacherMuted
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : speakingPersonaId
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse"
                              : isTeacherSpeaking
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 scale-105"
                              : "bg-[#12B8C4]/15 text-[#12B8C4] border border-[#12B8C4]/25"
                          }`}
                        >
                          {isTeacherMuted ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M3 3l18 18M12 18.75v3.75m-3.75 0h7.5M9.75 9.75v1.5a2.25 2.25 0 002.25 2.25c.348 0 .676-.08.97-.22" />
                            </svg>
                          ) : speakingPersonaId ? (
                            <Headphones className="w-5 h-5 animate-pulse text-cyan-300" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v7.5a3 3 0 006 0V4.5a3 3 0 00-3-3z" />
                            </svg>
                          )}
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isTeacherMuted
                                  ? "bg-red-500"
                                  : speakingPersonaId
                                  ? "bg-cyan-400 animate-ping"
                                  : isTeacherSpeaking
                                  ? "bg-emerald-400 animate-ping"
                                  : "bg-[#12B8C4] animate-pulse"
                              }`}
                            />
                            <span className="text-xs font-bold text-white">
                              {isTeacherMuted
                                ? isRtl
                                  ? "المايك مكتوم (خصوصية)"
                                  : "Microphone Muted (Private)"
                                : speakingPersonaId
                                ? isRtl
                                  ? "طالب يتحدث الآن..."
                                  : "Student Speaking..."
                                : isTeacherSpeaking
                                ? isRtl
                                  ? "جاري التقاط صوتك..."
                                  : "Picking up speech..."
                                : isRtl
                                ? "المايك مفتوح — تحدث بحرية"
                                : "Live Open Mic — Speaking freely"}
                            </span>
                          </div>

                          {/* Sound wave bars (active when unmuted) */}
                          {!isTeacherMuted && (
                            <div className="flex items-center gap-1 mt-1 h-3">
                              {[1, 2, 3, 4, 5].map((i) => {
                                const height = isTeacherSpeaking
                                  ? Math.max(4, Math.min(14, (audioLevel / 20) * (i % 2 === 0 ? 3 : 2.2)))
                                  : 3;
                                return (
                                  <span
                                    key={i}
                                    className="w-1 rounded-full transition-all duration-150"
                                    style={{
                                      height: `${height}px`,
                                      backgroundColor: isTeacherSpeaking ? "#10B981" : "#12B8C4",
                                      opacity: isTeacherSpeaking ? 1 : 0.4,
                                    }}
                                  />
                                );
                              })}
                              <span className="text-[10px] text-[#F6F0E4]/50 font-mono ms-1.5">
                                {isTeacherSpeaking ? "LIVE" : "READY"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Privacy Mute / Unmute Button + Instant Send Button */}
                      <div className="flex items-center gap-2">
                        {!isTeacherMuted && speakingPersonaId === null && (
                          <button
                            type="button"
                            onClick={forceInstantCommit}
                            disabled={processing || isTranscriptProcessing}
                            className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
                            title={isRtl ? "إرسال كلامك فوراً للطلاب (أو اضغط مسطرة المسافة Space)" : "Send speech instantly to students (or press Spacebar)"}
                          >
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                            </svg>
                            <span>{isRtl ? "إرسال (Space)" : "Send (Space)"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={toggleTeacherMute}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isTeacherMuted
                              ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20"
                              : "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 shadow-sm shadow-red-500/20"
                          }`}
                          title={isTeacherMuted ? "إلغاء الكتم" : "كتم المايك للخصوصية"}
                        >
                          {isTeacherMuted ? (
                            <>
                              <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v7.5a3 3 0 006 0V4.5a3 3 0 00-3-3z" />
                              </svg>
                              <span>{isRtl ? "إلغاء الكتم" : "Unmute"}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M3 3l18 18M12 18.75v3.75m-3.75 0h7.5M9.75 9.75v1.5a2.25 2.25 0 002.25 2.25c.348 0 .676-.08.97-.22" />
                              </svg>
                              <span>{isRtl ? "كتم المايك" : "Mute"}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Subtitle helper */}
                    <span className="text-[11px] text-[#F6F0E4]/60 font-medium">
                      {isTeacherMuted
                        ? isRtl
                          ? "المايك مغلق تماماً لحفظ خصوصيتك — انقر على 'إلغاء الكتم' عندما تريد التحدث"
                          : "Muted for privacy — click 'Unmute' to resume speaking"
                        : speakingPersonaId
                        ? isRtl
                          ? "استمع للطالب... المايك سيلتقط كلامك فور انتهائه مباشرة"
                          : "Listening to student... mic will capture your speech right after"
                        : isRtl
                        ? "تحدث بحرية — عند انتهاء سؤالك اضغط 'إرسال (Space)' أو مسطرة الكيبورد للرد الفوري دون انتظار"
                        : "Speak freely — click 'Send (Space)' or press Spacebar when done for instant response"}
                    </span>
                  </div>
                )}
              </div>
          </div>
        </main>

        {/* Side HUD 2: Live Event Stream & Cognitive Discourse (340px) */}
        <aside
          className={`w-full md:w-84 bg-[#051329]/70 backdrop-blur-lg border-t md:border-t-0 md:border-r rtl:md:border-r ltr:md:border-l border-white/10 p-4 sm:p-6 flex-col justify-between shrink-0 order-3 ${
            mobileActiveTab === "discourse" ? "flex flex-grow h-full" : "hidden md:flex"
          }`}
        >
          <div className="space-y-4 flex-grow flex flex-col h-[380px] md:h-full">
            {/* Section Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#12B8C4] animate-pulse" />
                <h2 className="text-xs font-bold text-white tracking-wide uppercase">
                  {isRtl ? "سجل الحوار والتفاعل الحي" : "Live Discourse Log"}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-[#F6F0E4]/40">LIVE LOG</span>
            </div>

            {/* Live Interaction Stream Container */}
            <div
              ref={chatScrollRef}
              className="flex-grow rounded-2xl bg-[#0B2349]/40 border border-white/10 p-4 flex flex-col space-y-3 overflow-y-auto"
            >
              {events.length === 0 ? (
                <div className="my-auto flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#12B8C4]">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white block">
                      {isRtl ? "الجلسة في وضع الاستماع" : "Awaiting Classroom Dialogue"}
                    </span>
                    <p className="text-[11px] text-[#F6F0E4]/50 leading-relaxed max-w-[220px]">
                      {isRtl
                        ? "ابدأ بطرح فكرة الدرس؛ سيتم تسجيل استجابات الطلاب وتحليل طبيعة الأسئلة فورياً في هذه المساحة."
                        : "Begin speaking; live student responses and pedagogical cues will stream here."}
                    </p>
                  </div>
                </div>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className={`p-3 rounded-xl text-xs space-y-1 ${
                      e.kind === "teacher"
                        ? "bg-[#FFB52E]/15 border border-[#FFB52E]/30 text-white self-end text-start max-w-[90%]"
                        : e.kind === "student"
                        ? "bg-[#12B8C4]/15 border border-[#12B8C4]/30 text-white self-start text-start max-w-[90%]"
                        : "bg-white/5 border border-white/10 text-[#F6F0E4]/70 text-center w-full"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono opacity-60">
                      <span className="font-bold">{e.speakerName || (e.kind === "teacher" ? "You" : "Classroom")}</span>
                      <span>{e.timeStr}</span>
                    </div>
                    <p className="leading-relaxed">{e.label}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Realtime Audio Level Equalizer Widget */}
          <div className="pt-4 border-t border-white/10 shrink-0">
            <div className="p-3.5 rounded-2xl bg-[#0B2349]/60 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Dynamic Sound Bars */}
                <div className="flex items-end gap-1 h-5">
                  <div className={`w-1 bg-[#12B8C4] rounded-full transition-all ${recording ? "h-5 animate-pulse" : "h-2"}`} />
                  <div className={`w-1 bg-[#12B8C4] rounded-full transition-all ${recording ? "h-4 animate-pulse" : "h-3"}`} />
                  <div className={`w-1 bg-[#12B8C4] rounded-full transition-all ${recording ? "h-5 animate-pulse" : "h-1"}`} />
                  <div className={`w-1 bg-[#12B8C4] rounded-full transition-all ${recording ? "h-3 animate-pulse" : "h-4"}`} />
                  <div className={`w-1 bg-[#12B8C4] rounded-full transition-all ${recording ? "h-5 animate-pulse" : "h-2"}`} />
                </div>
                <div>
                  <span className="block text-xs font-bold text-white">
                    {recording
                      ? (isRtl ? "اللاقط يسجل الآن..." : "Capturing Audio...")
                      : (isRtl ? "اللاقط التفاعلي جاهز" : "Microphone Ready")}
                  </span>
                  <span className="block text-[10px] text-[#12B8C4] font-mono">NOISE REDUCTION: 98%</span>
                </div>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#12B8C4] shadow-lg shadow-[#12B8C4]" />
            </div>
          </div>
        </aside>
      </div>

      {/* Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#071B3A] border border-white/15 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 text-start">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#D96B58]/20 text-[#D96B58] flex items-center justify-center font-bold shrink-0 border border-[#D96B58]/30">
                <AlertTriangle className="w-6 h-6 text-[#D96B58]" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {isRtl ? "إنهاء الجلسة واستخراج التقرير؟" : t.liveRoom.endModalTitle}
                </h3>
                <p className="text-xs text-[#F6F0E4]/60 mt-0.5">
                  {isRtl ? "سيتم حفظ القياسات وتوليد التقرير التحليلي الشامل" : "Measurements will be saved and analytics compiled"}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#F6F0E4]/80 leading-relaxed bg-white/5 p-3.5 rounded-xl border border-white/5">
              {isRtl
                ? "هل أنت متأكد من إنهاء جلسة المحاكاة الحالية؟ سيتم إيقاف النماذج الصوتية فوراً واحتساب درجات التفاعل وتوليد التقرير التراكمي."
                : t.liveRoom.endModalDesc}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  setShowEndModal(false);
                  setShowDiscardModal(true);
                }}
                disabled={ending}
                className="text-xs font-semibold text-[#D96B58] hover:underline cursor-pointer"
              >
                {isRtl ? "إنهاء الجلسة دون حفظ" : "Exit without saving"}
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  disabled={ending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#F6F0E4]/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  {isRtl ? "متابعة التدريب" : t.liveRoom.cancelButton}
                </button>
                <button
                  type="button"
                  onClick={handleEndSimulation}
                  disabled={ending}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#D96B58] hover:bg-[#D96B58]/90 disabled:opacity-60 text-white transition shadow-lg cursor-pointer"
                >
                  {ending ? (isRtl ? "جاري الإنهاء..." : t.liveRoom.ending) : (isRtl ? "تأكيد الإنهاء وحفظ التقرير" : t.liveRoom.confirmEndButton)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discard & Exit Without Saving Modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#071B3A] border border-white/15 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 text-start">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl font-bold shrink-0 border border-red-500/30">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {isRtl ? "إنهاء الجلسة دون حفظ؟" : "Exit Without Saving?"}
                </h3>
                <p className="text-xs text-[#F6F0E4]/60 mt-0.5">
                  {isRtl ? "لن يتم حفظ أي تسجيل أو تقرير لهذه الجلسة" : "No report or telemetry will be recorded"}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#F6F0E4]/80 leading-relaxed bg-white/5 p-3.5 rounded-xl border border-white/5">
              {isRtl
                ? "سيتم إلغاء الجلسة الحالية وإعادتك مباشرة للوحة التحكم. لن تظهر الجلسة في سجل المحاكاة أو لوحة النمو ولن تؤثر على تقييمك."
                : "This session will be cancelled and discarded. You will return to the dashboard without saving any report or metrics."}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                disabled={cancelling}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#F6F0E4]/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                {isRtl ? "متابعة التدريب" : "Continue Session"}
              </button>
              <button
                type="button"
                onClick={handleEndWithoutSaving}
                disabled={cancelling}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition shadow-lg cursor-pointer"
              >
                {cancelling
                  ? isRtl
                    ? "جاري الخروج..."
                    : "Exiting..."
                  : isRtl
                  ? "نعم، إنهاء دون حفظ"
                  : "Yes, Discard & Exit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Time Ended Modal */}
      {showTimeUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#0A2246] border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-[0_0_50px_rgba(245,158,11,0.2)] space-y-6 text-start">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0 border border-amber-500/30 shadow-inner animate-pulse">
                <Clock className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <span className="text-[11px] font-mono tracking-wider text-amber-400 uppercase font-bold">
                  {isRtl ? "تنبيه اكتمال التوقيت" : "Time Expiry Alert"}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                  {isRtl ? "انتهى وقت الحصة المحدد!" : "Session Time has Ended!"}
                </h3>
                <p className="text-xs text-[#F6F0E4]/60 mt-0.5">
                  {isRtl
                    ? `اكتملت مدة التدريب المحددة (${Math.round(totalDurationMs / 60000)} دقيقة)`
                    : `Training duration (${Math.round(totalDurationMs / 60000)} mins) completed`}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-[#F6F0E4]/90 leading-relaxed">
                {isRtl
                  ? "أحسنت! انتهى الوقت المخصص للحصة. يمكنك الآن إنهاء المحاكاة واعتماد وحفظ تقرير الأداء الشامل والتحليلات البيداغوجية، أو تمديد الوقت للاستمرار في الشرح والتفاعل مع الطلاب."
                  : "Great work! The session timer has reached zero. You can finalize the session to generate your comprehensive pedagogical report, or extend time to continue interacting."}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center">
                <div className="bg-white/5 p-2 rounded-xl">
                  <div className="text-[10px] text-[#F6F0E4]/60 font-medium">{isRtl ? "حديث المعلم TTT" : "Teacher Talk"}</div>
                  <div className="text-sm font-bold text-white mt-0.5">{teacherTalkRatio}%</div>
                </div>
                <div className="bg-white/5 p-2 rounded-xl">
                  <div className="text-[10px] text-[#F6F0E4]/60 font-medium">{isRtl ? "الأسئلة السقراطية" : "Socratic"}</div>
                  <div className="text-sm font-bold text-[#FFB52E] mt-0.5">{socraticRate}%</div>
                </div>
                <div className="bg-white/5 p-2 rounded-xl">
                  <div className="text-[10px] text-[#F6F0E4]/60 font-medium">{isRtl ? "الشمولية" : "Inclusivity"}</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{inclusivityIndex}%</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTotalDurationMs((prev) => prev + 5 * 60 * 1000);
                  setShowTimeUpModal(false);
                  setHasTriggeredTimeUp(false);
                  setIsTeacherMuted(false);
                  isTeacherMutedRef.current = false;
                }}
                disabled={ending}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isRtl ? "تمديد الوقت (+5 دقائق)" : "Extend +5 Minutes"}</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleEndSimulation}
                  disabled={ending}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold bg-[#D96B58] hover:bg-[#D96B58]/90 disabled:opacity-60 text-white transition shadow-lg cursor-pointer flex items-center justify-center gap-2"
                >
                  {ending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{isRtl ? "جاري تجهيز التقرير..." : "Generating Report..."}</span>
                    </>
                  ) : (
                    <span>{isRtl ? "إنهاء الحصة واستعراض التقرير" : "Finish & View Report"}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Fixed Floating Live Speech Preview */}
      {(liveTranscriptPreview || (isLiveOpenMic && isTeacherSpeaking && !isTeacherMuted)) && (
        <aside
          aria-live="polite"
          className="fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-xl mx-auto px-4 py-3 rounded-2xl backdrop-blur-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200 border shadow-2xl transition-all select-none pointer-events-none"
          style={{
            backgroundColor: "rgba(5, 19, 41, 0.95)",
            borderColor: isTranscriptProcessing ? "rgba(34, 211, 238, 0.7)" : "rgba(16, 185, 129, 0.6)",
            boxShadow: isTranscriptProcessing
              ? "0 20px 40px -15px rgba(6, 182, 212, 0.35)"
              : "0 20px 40px -15px rgba(16, 185, 129, 0.3)",
          }}
        >
          <span
            className={`w-3 h-3 rounded-full shrink-0 ${
              isTranscriptProcessing ? "bg-cyan-400 animate-pulse" : "bg-emerald-400 animate-ping"
            }`}
          />
          <div className="flex-1 text-start overflow-hidden">
            <span
              className={`text-[11px] font-bold ml-2 inline-block ${
                isTranscriptProcessing ? "text-cyan-300" : "text-emerald-400"
              }`}
            >
              {isTranscriptProcessing
                ? (isRtl ? "جارِ استجابة الطلاب لكلامك:" : "Students responding to:")
                : (isRtl ? "جارِ الاستماع لكلامك:" : "Live (Listening):")}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-white break-words">
              {liveTranscriptPreview || (isRtl ? "المايك يلتقط صوتك الآن..." : "Picking up your voice...")}
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}

async function safeJson(res: Response): Promise<{ error?: string; [key: string]: unknown }> {
  const text = await res.text();
  if (!text) {
    return { error: "Server returned an empty response. Please check server logs." };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Failed to parse server response" };
  }
}
