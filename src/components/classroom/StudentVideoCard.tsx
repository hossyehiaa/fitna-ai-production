"use client";

import React, { useMemo } from "react";
import { VisemeAvatarCanvas } from "./VisemeAvatarCanvas";
import { useVisemeClassifier } from "@/lib/audio/visemeClassifier";
import { Zap, Hand, Moon, Volume2, CheckCircle2 } from "lucide-react";
import { CHARACTERS, resolveCharacter, type CharacterKey } from "@/lib/characters/registry";

interface StudentVideoCardProps {
  name: string;
  age: number;
  attention: number;
  /** DB persona.avatar_key — authoritative character identity. */
  avatarKey?: string | null;
  state?: "attentive" | "hand_raised" | "distracted";
  isSpeaking?: boolean;
  audioElement?: HTMLAudioElement | null;
  compact?: boolean;
  className?: string;
}

export function StudentVideoCard({
  name,
  age,
  attention,
  avatarKey,
  state = "attentive",
  isSpeaking = false,
  audioElement = null,
  compact = true,
  className = "",
}: StudentVideoCardProps) {
  // Deterministic character identity: DB avatar_key first, then name.
  // Gender + nationality always come from the character registry — never
  // a default female sprite for a male student.
  const character = useMemo(() => {
    const resolved = resolveCharacter(avatarKey, name);
    return resolved ?? CHARACTERS.sara;
  }, [avatarKey, name]);
  const personaKey: CharacterKey = character.key;
  const theme = character.theme;

  // Hook for acoustic formant & viseme classifier
  const { currentViseme, mouthOpenness } = useVisemeClassifier(audioElement, isSpeaking);

  // Attention status color
  const attentionColor = attention >= 75 ? "text-emerald-400" : attention >= 50 ? "text-amber-400" : "text-rose-400";
  const attentionBg = attention >= 75 ? "bg-emerald-500/10 border-emerald-500/30" : attention >= 50 ? "bg-amber-500/10 border-amber-500/30" : "bg-rose-500/10 border-rose-500/30";

  return (
    <div
      className={`relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 select-none ${
        isSpeaking
          ? "border-2 border-[#12B8C4] ring-4 ring-[#12B8C4]/30 shadow-2xl scale-[1.01]"
          : state === "hand_raised"
          ? "border-2 border-amber-400/60 ring-2 ring-amber-400/20 shadow-xl"
          : state === "distracted"
          ? "border border-rose-500/30 opacity-90"
          : "border border-white/10 hover:border-white/20 shadow-lg"
      } bg-gradient-to-b from-[#081830] to-[#040C1A] ${className}`}
      style={{
        boxShadow: isSpeaking ? `0 0 35px ${theme.glow}, 0 10px 30px rgba(0,0,0,0.5)` : undefined,
      }}
    >
      {/* Aspect-Square Container: 100% Uncropped Character with Full Body */}
      <div className="relative w-full aspect-square overflow-hidden bg-slate-950 flex items-center justify-center">
        {/* Real 2D Cartoon Viseme Canvas Engine (Sprite Layers + Natural Eyelids Blinking + 5 Formant Visemes) */}
        <VisemeAvatarCanvas
          persona={personaKey}
          baseState={state}
          isSpeaking={isSpeaking}
          currentViseme={currentViseme}
          mouthOpenness={mouthOpenness}
        />

        {/* Studio Lighting Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#040C1A] via-transparent to-black/20 pointer-events-none" />

        {/* Top Floating Telemetry & Status Badges */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between z-10 pointer-events-none">
          {/* Live Camera Feed Indicator */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono text-white/90">
            <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? "bg-[#12B8C4] animate-ping" : "bg-emerald-400"}`} />
            <span className="font-semibold tracking-wider uppercase">{isSpeaking ? "TALKING" : "LIVE"}</span>
          </div>

          {/* Attention Score Badge */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-md border text-[10px] font-mono font-bold ${attentionBg} ${attentionColor}`}>
            <Zap className="w-2.5 h-2.5 fill-current" />
            <span>{attention}%</span>
          </div>
        </div>

        {/* Hand Raised Animated Badge */}
        {state === "hand_raised" && (
          <div className="absolute top-8 right-2 z-20 animate-bounce duration-700">
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-[11px] shadow-xl border border-white">
              <Hand className="w-3 h-3 fill-current" />
              <span>سؤال!</span>
            </div>
          </div>
        )}

        {/* Distracted Banner Overlay */}
        {state === "distracted" && (
          <div className="absolute top-8 left-2 z-20 animate-pulse">
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-slate-900/90 text-rose-300 font-bold text-[11px] shadow-xl border border-rose-500/40 backdrop-blur-md">
              <Moon className="w-3 h-3" />
              <span>متشتّت</span>
            </div>
          </div>
        )}

        {/* Speaking Audio Visualizer Overlay at bottom of video feed */}
        {isSpeaking && (
          <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-[#12B8C4]/60 shadow-lg">
            <div className="flex items-center gap-0.5 h-2.5">
              <span
                className="w-0.5 bg-[#12B8C4] rounded-full transition-all duration-75"
                style={{ height: `${4 + mouthOpenness * 10}px` }}
              />
              <span
                className="w-0.5 bg-[#12B8C4] rounded-full transition-all duration-75"
                style={{ height: `${7 + mouthOpenness * 14}px` }}
              />
              <span
                className="w-0.5 bg-[#12B8C4] rounded-full transition-all duration-75"
                style={{ height: `${3 + mouthOpenness * 8}px` }}
              />
            </div>
            <span className="text-[9px] font-bold text-[#12B8C4]">يتحدّث...</span>
          </div>
        )}
      </div>

      {/* Bottom Identity & Metadata Bar */}
      <div className="px-3 py-1.5 sm:py-2 bg-[#051020]/95 border-t border-white/5 flex items-center justify-between">
        {/* Name Pill Badge */}
        <div className="flex items-center gap-1.5">
          <div
            className={`px-2.5 py-0.5 rounded-lg text-[11px] sm:text-xs font-black text-white shadow-sm border ${theme.pillBg} ${theme.pillBorder}`}
          >
            {name}
          </div>
          <span className="text-[10px] sm:text-[11px] text-white/50 font-medium">
            {age} سنوات
          </span>
        </div>

        {/* Status Tag */}
        <div className="text-[10px] sm:text-[11px] font-medium text-white/60">
          {state === "hand_raised" ? (
            <span className="text-amber-400 font-semibold flex items-center gap-1">
              <Hand className="w-3 h-3" />
              <span>رفع يده</span>
            </span>
          ) : state === "distracted" ? (
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              <Moon className="w-3 h-3" />
              <span>متشتت</span>
            </span>
          ) : isSpeaking ? (
            <span className="text-[#12B8C4] font-semibold flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              <span>إجابة صوتية</span>
            </span>
          ) : (
            <span className="text-emerald-400/80 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>منتبه للدرس</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
