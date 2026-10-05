"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { Loader2, Volume2, Play, Pause } from "lucide-react";

export type TranscriptLine = {
  id: string;
  speaker: string;
  content: string;
  timestampMs: number;
  isTeacher: boolean;
};

export type EvidenceMoment = {
  eventId: string;
  label: string;
  timestampMs: number;
};

export function EvidenceAndTranscript({
  evidenceMoments,
  transcript,
}: {
  evidenceMoments: EvidenceMoment[];
  transcript: TranscriptLine[];
}) {
  const { lang } = useTranslation();
  const isEn = lang === "en";

  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  function jumpTo(eventId: string) {
    setHighlighted(eventId);
    lineRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "center" });

    // Find the transcript line and trigger audio
    const line = transcript.find((l) => l.id === eventId);
    if (line) {
      handlePlayAudio(line.id, line.content, line.speaker);
    }
  }

  async function handlePlayAudio(id: string, text: string, speaker: string) {
    // If currently playing this line, pause it
    if (playingId === id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }

    setLoadingId(id);
    setHighlighted(id);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          personaName: speaker,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to synthesize audio");
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      currentUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingId(null);
      };

      audio.onerror = () => {
        setPlayingId(null);
        setLoadingId(null);
      };

      await audio.play();
      setPlayingId(id);
    } catch (err) {
      console.error("Audio playback error:", err);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Evidence Moments */}
      {evidenceMoments.length > 0 && (
        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-[#071B3A] dark:text-white">
                {isEn ? "Evidence Moments & Audio" : "أدلة من الجلسة والتسجيل الصوتي"}
              </h2>
              <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
                {isEn
                  ? "Click any moment to jump to the exact transcript line and listen to the audio playback."
                  : "اضغط على أي دليل للانتقال للسطر والاستماع للتسجيل الصوتي الفعلي."}
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-bold">
              {evidenceMoments.length} {isEn ? "Moments" : "أدلة موثقة"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evidenceMoments.map((m) => {
              const isPlaying = playingId === m.eventId;
              const isLoading = loadingId === m.eventId;

              return (
                <button
                  key={m.eventId}
                  onClick={() => jumpTo(m.eventId)}
                  className={`w-full flex items-center justify-between text-start rounded-xl p-3.5 border transition ${
                    isPlaying
                      ? "border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 shadow-sm"
                      : "border-[#071B3A]/10 dark:border-white/10 bg-[#071B3A]/[0.02] dark:bg-white/[0.02] hover:bg-[#071B3A]/5 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-600/10 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-bold">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isPlaying ? (
                        <Volume2 className="w-4 h-4 animate-pulse text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-[#071B3A] dark:text-white">{m.label}</p>
                      <span className="text-[10px] text-[#071B3A]/40 dark:text-white/40 font-mono">
                        {Math.round(m.timestampMs / 1000)}s
                      </span>
                    </div>
                  </div>
                  <span className="text-teal-600 dark:text-teal-400 text-xs font-bold flex items-center gap-1">
                    {isPlaying ? (isEn ? "Playing..." : "جاري الاستماع...") : isEn ? "Play" : "استمع"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Transcript with Interactive Audio Playback */}
      <div className="bg-white dark:bg-white/5 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#071B3A]/10 dark:border-white/10 pb-3">
          <div>
            <h2 className="font-bold text-sm text-[#071B3A] dark:text-white">
              {isEn ? "Full Session Transcript & Voice Timeline" : "نص الجلسة الكامل والتسجيلات الصوتية"}
            </h2>
            <p className="text-xs text-[#071B3A]/50 dark:text-white/50 mt-0.5">
              {isEn
                ? "Interactive playback for each teacher and student speech turn."
                : "استمع لأي حوار أو مشاركة صفية بصوت الطالب المعني واللهجة المناسبة."}
            </p>
          </div>
          {playingId && (
            <div className="flex items-center gap-2 bg-teal-50 dark:bg-teal-950/40 border border-teal-500/30 rounded-lg px-3 py-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-ping" />
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                {isEn ? "Audio Playing" : "جاري تشغيل الصوت"}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {transcript.length === 0 ? (
            <p className="text-xs text-[#071B3A]/40 dark:text-white/40 py-8 text-center">
              {isEn ? "No dialog recorded in this session." : "مفيش حوار مسجّل في الجلسة دي."}
            </p>
          ) : (
            transcript.map((line) => {
              const isPlaying = playingId === line.id;
              const isLoading = loadingId === line.id;
              const isHigh = highlighted === line.id;

              return (
                <div
                  key={line.id}
                  ref={(el) => {
                    lineRefs.current[line.id] = el;
                  }}
                  className={`text-xs rounded-xl p-3.5 border transition-all flex items-start justify-between gap-3 ${
                    isHigh
                      ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-400 ring-2 ring-yellow-400/40"
                      : line.isTeacher
                      ? "bg-teal-50/50 dark:bg-teal-950/20 border-teal-500/20"
                      : "bg-[#F5F1E8]/70 dark:bg-white/[0.03] border-[#071B3A]/5 dark:border-white/10"
                  }`}
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold ${
                          line.isTeacher
                            ? "text-teal-800 dark:text-teal-300"
                            : "text-[#071B3A] dark:text-white"
                        }`}
                      >
                        {line.speaker}
                      </span>
                      <span className="text-[10px] text-[#071B3A]/40 dark:text-white/40 font-mono">
                        {Math.floor(line.timestampMs / 60000)}:
                        {String(Math.floor((line.timestampMs % 60000) / 1000)).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="text-[#071B3A]/90 dark:text-white/90 leading-relaxed font-normal">
                      {line.content}
                    </p>
                  </div>

                  {/* Audio Play Button */}
                  <button
                    onClick={() => handlePlayAudio(line.id, line.content, line.speaker)}
                    disabled={isLoading}
                    title={isEn ? "Play authentic audio" : "تشغيل الصوت باللهجة الأصلية"}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                      isPlaying
                        ? "bg-teal-600 text-white shadow-teal-500/30"
                        : "bg-white dark:bg-[#0D2554] border border-[#071B3A]/15 dark:border-white/20 text-[#071B3A] dark:text-white hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-300"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{isEn ? "Loading..." : "تحميل..."}</span>
                      </>
                    ) : isPlaying ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>{isEn ? "Pause" : "إيقاف"}</span>
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
    </div>
  );
}
