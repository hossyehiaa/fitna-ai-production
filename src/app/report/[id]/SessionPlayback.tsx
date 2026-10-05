"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/context";
import {
  Mic,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Volume2,
  Loader2,
  GraduationCap
} from "lucide-react";

export type PlaybackTurn = {
  id: string;
  speaker: string;
  content: string;
  timestampMs: number;
  isTeacher: boolean;
  audioUrl?: string | null; // Real teacher microphone recording
};

export function SessionPlayback({
  transcript,
  durationMinutes = 5,
}: {
  transcript: PlaybackTurn[];
  durationMinutes?: number;
}) {
  const { lang } = useTranslation();
  const isEn = lang === "en";

  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number | null>(null);
  const [loadingTurnId, setLoadingTurnId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const isPlayingAllRef = useRef(false);
  const currentTurnIndexRef = useRef<number | null>(null);
  const turnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    isPlayingAllRef.current = isPlayingAll;
  }, [isPlayingAll]);

  useEffect(() => {
    currentTurnIndexRef.current = currentTurnIndex;
  }, [currentTurnIndex]);

  function stopCurrentAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, []);

  async function playTurnAtIndex(index: number, continueSequence = false) {
    if (index < 0 || index >= transcript.length) {
      setIsPlayingAll(false);
      setCurrentTurnIndex(null);
      return;
    }

    const turn = transcript[index];
    stopCurrentAudio();
    setCurrentTurnIndex(index);
    setLoadingTurnId(turn.id);

    // Auto-scroll active turn into view
    turnRefs.current[turn.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      let audioSourceUrl = "";

      // 1. If teacher with real recorded microphone audio
      if (turn.isTeacher && turn.audioUrl) {
        audioSourceUrl = turn.audioUrl;
      } else {
        // 2. Student turn (or teacher fallback): fetch authentic Edge-TTS audio
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: turn.content,
            personaName: turn.speaker,
          }),
        });

        if (!res.ok) throw new Error("TTS generation failed");
        const blob = await res.blob();
        audioSourceUrl = URL.createObjectURL(blob);
        currentBlobUrlRef.current = audioSourceUrl;
      }

      const audio = new Audio(audioSourceUrl);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;

      audio.onended = () => {
        setLoadingTurnId(null);
        if (isPlayingAllRef.current) {
          // Play next turn in sequence
          const nextIndex = index + 1;
          if (nextIndex < transcript.length) {
            void playTurnAtIndex(nextIndex, true);
          } else {
            setIsPlayingAll(false);
            setCurrentTurnIndex(null);
          }
        } else {
          setCurrentTurnIndex(null);
        }
      };

      audio.onerror = () => {
        setLoadingTurnId(null);
        if (isPlayingAllRef.current) {
          // Skip to next if error
          void playTurnAtIndex(index + 1, true);
        } else {
          setCurrentTurnIndex(null);
        }
      };

      await audio.play();
      setLoadingTurnId(null);
    } catch (err) {
      console.error("Audio playback error:", err);
      setLoadingTurnId(null);
      if (continueSequence && isPlayingAllRef.current) {
        void playTurnAtIndex(index + 1, true);
      } else {
        setCurrentTurnIndex(null);
        setIsPlayingAll(false);
      }
    }
  }

  function handleTogglePlayAll() {
    if (isPlayingAll) {
      stopCurrentAudio();
      setIsPlayingAll(false);
      setCurrentTurnIndex(null);
    } else {
      setIsPlayingAll(true);
      const startIndex = currentTurnIndex !== null ? currentTurnIndex : 0;
      void playTurnAtIndex(startIndex, true);
    }
  }

  function handleSingleTurnClick(index: number) {
    if (currentTurnIndex === index && !isPlayingAll) {
      // Pause
      stopCurrentAudio();
      setCurrentTurnIndex(null);
    } else {
      setIsPlayingAll(false);
      void playTurnAtIndex(index, false);
    }
  }

  function handleSpeedChange(speed: number) {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }

  function handleSkip(direction: "prev" | "next") {
    const currentIndex = currentTurnIndex ?? 0;
    const targetIndex =
      direction === "next"
        ? Math.min(transcript.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
    void playTurnAtIndex(targetIndex, isPlayingAll);
  }

  const activeTurn = currentTurnIndex !== null ? transcript[currentTurnIndex] : null;
  const currentElapsedMs = activeTurn ? activeTurn.timestampMs : 0;
  const totalDurationMs = Math.max(
    durationMinutes * 60 * 1000,
    transcript[transcript.length - 1]?.timestampMs ?? 0
  );
  const progressPercent = Math.min(100, Math.round((currentElapsedMs / Math.max(1, totalDurationMs)) * 100));

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm border border-[#071B3A]/10 dark:border-white/10 space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="font-bold text-base text-[#071B3A] dark:text-white">
              {isEn ? "Session Playback (Real Voice & Dialogue)" : "تسجيل وتشغيل الجلسة (الصوت الحقيقي والحوار)"}
            </h2>
          </div>
          <p className="text-xs text-[#071B3A]/60 dark:text-white/60 mt-1">
            {isEn
              ? "Listen to the complete classroom session with the teacher's authentic microphone recording and student AI voices."
              : "استمع لتسجيل الجلسة بالكامل بصوت المعلم الحقيقي المسجّل من المايك وأصوات الطلاب التفاعلية."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-500/20">
            {transcript.length} {isEn ? "Turns" : "حوار مسجّل"}
          </span>
        </div>
      </div>

      {/* Master Controller Deck */}
      <div className="bg-[#F5F1E8]/70 dark:bg-[#0D2554]/60 rounded-xl p-4 md:p-5 border border-[#071B3A]/10 dark:border-white/10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Master Play / Skip Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSkip("prev")}
              disabled={transcript.length === 0 || currentTurnIndex === 0}
              className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-[#071B3A]/15 dark:border-white/20 text-[#071B3A] dark:text-white flex items-center justify-center text-xs hover:border-teal-500 disabled:opacity-40 transition"
              title={isEn ? "Previous turn" : "الحوار السابق"}
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleTogglePlayAll}
              disabled={transcript.length === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition ${
                isPlayingAll
                  ? "bg-yellow-500 hover:bg-yellow-600 text-[#071B3A]"
                  : "bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20"
              }`}
            >
              {isPlayingAll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>
                {isPlayingAll
                  ? isEn
                    ? "Pause Full Session"
                    : "إيقاف التشغيل مؤقتاً"
                  : isEn
                  ? "Play Full Session"
                  : "تشغيل الجلسة كاملة"}
              </span>
            </button>

            <button
              onClick={() => handleSkip("next")}
              disabled={
                transcript.length === 0 ||
                currentTurnIndex === transcript.length - 1
              }
              className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-[#071B3A]/15 dark:border-white/20 text-[#071B3A] dark:text-white flex items-center justify-center text-xs hover:border-teal-500 disabled:opacity-40 transition"
              title={isEn ? "Next turn" : "الحوار التالي"}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Playback Speed Selector */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-white/10 p-1 rounded-lg border border-[#071B3A]/10 dark:border-white/15 text-xs font-semibold">
            <span className="text-[10px] text-[#071B3A]/50 dark:text-white/50 px-1.5">
              {isEn ? "Speed:" : "السرعة:"}
            </span>
            {[0.75, 1.0, 1.25, 1.5].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                  playbackSpeed === speed
                    ? "bg-teal-600 text-white font-bold"
                    : "text-[#071B3A] dark:text-white hover:bg-[#071B3A]/5 dark:hover:bg-white/5"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#071B3A]/60 dark:text-white/60">
            <span>
              {Math.floor(currentElapsedMs / 60000)}:
              {String(Math.floor((currentElapsedMs % 60000) / 1000)).padStart(2, "0")}
            </span>
            <span>
              {activeTurn
                ? isEn
                  ? `Turn ${currentTurnIndex! + 1} of ${transcript.length}`
                  : `الحوار ${currentTurnIndex! + 1} من ${transcript.length}`
                : isEn
                ? "Ready to play"
                : "جاهز للتشغيل"}
            </span>
            <span>
              {Math.floor(totalDurationMs / 60000)}:
              {String(Math.floor((totalDurationMs % 60000) / 1000)).padStart(2, "0")}
            </span>
          </div>

          <div className="w-full bg-[#071B3A]/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
            <div
              className="bg-teal-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Turn-by-Turn Audio Stream */}
      <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
        {transcript.length === 0 ? (
          <p className="text-xs text-[#071B3A]/40 dark:text-white/40 py-8 text-center">
            {isEn ? "No dialogue recorded in this session." : "مفيش حوار مسجّل في الجلسة دي."}
          </p>
        ) : (
          transcript.map((turn, index) => {
            const isActive = currentTurnIndex === index;
            const isLoading = loadingTurnId === turn.id;
            const hasRealTeacherAudio = turn.isTeacher && Boolean(turn.audioUrl);

            return (
              <div
                key={turn.id}
                ref={(el) => {
                  turnRefs.current[turn.id] = el;
                }}
                className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  isActive
                    ? "bg-teal-50 dark:bg-teal-950/40 border-teal-500 ring-2 ring-teal-500/30 shadow-sm"
                    : turn.isTeacher
                    ? "bg-[#071B3A]/[0.02] dark:bg-white/[0.02] border-[#071B3A]/10 dark:border-white/10 hover:border-[#071B3A]/20"
                    : "bg-[#F5F1E8]/50 dark:bg-white/[0.01] border-[#071B3A]/5 dark:border-white/5 hover:border-[#071B3A]/15"
                }`}
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-[#071B3A] dark:text-white">
                      {turn.speaker}
                    </span>

                    {/* Audio source badge */}
                    {turn.isTeacher ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-500/20 inline-flex items-center gap-1">
                        <Mic className="w-2.5 h-2.5" />
                        {hasRealTeacherAudio
                          ? isEn
                            ? "Teacher Real Voice"
                            : "صوت المعلم الحقيقي"
                          : isEn
                          ? "Teacher Voice"
                          : "صوت المعلم"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200 border border-yellow-500/20 inline-flex items-center gap-1">
                        <GraduationCap className="w-2.5 h-2.5" />
                        {isEn ? "Student Voice" : "صوت الطالب"}
                      </span>
                    )}

                    <span className="text-[10px] text-[#071B3A]/40 dark:text-white/40 font-mono">
                      {Math.floor(turn.timestampMs / 60000)}:
                      {String(Math.floor((turn.timestampMs % 60000) / 1000)).padStart(2, "0")}
                    </span>
                  </div>

                  <p className="text-xs text-[#071B3A]/90 dark:text-white/90 leading-relaxed">
                    {turn.content}
                  </p>
                </div>

                {/* Individual Play Button */}
                <button
                  onClick={() => handleSingleTurnClick(index)}
                  disabled={isLoading}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                    isActive
                      ? "bg-teal-600 text-white animate-pulse shadow-teal-500/30"
                      : "bg-white dark:bg-white/10 border border-[#071B3A]/15 dark:border-white/20 text-[#071B3A] dark:text-white hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-300"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isActive ? (
                    <>
                      <Pause className="w-3 h-3" />
                      <span>{isEn ? "Playing" : "استماع"}</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3 h-3" />
                      <span>{isEn ? "Play" : "استمع"}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
