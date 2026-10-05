"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { useLipSync } from "@/lib/audio/lipSyncHook";
import { Hand, Moon } from "lucide-react";

export type StudentAvatarPersona = "omar" | "sara" | "yassin" | "nour";

interface StudentAvatarProps {
  name: string;
  state?: "attentive" | "hand_raised" | "distracted";
  isSpeaking?: boolean;
  audioElement?: HTMLAudioElement | null;
  attention?: number;
  size?: number;
  className?: string;
}

export function StudentAvatar({
  name,
  state = "attentive",
  isSpeaking = false,
  audioElement = null,
  attention = 75,
  size = 110,
  className = "",
}: StudentAvatarProps) {
  // Normalize name to persona key matching reference sheet
  const personaKey: StudentAvatarPersona = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (trimmed.includes("عمر") || trimmed.includes("omar")) return "omar";
    if (trimmed.includes("سارة") || trimmed.includes("sara")) return "sara";
    if (trimmed.includes("ياسين") || trimmed.includes("yassin")) return "yassin";
    if (trimmed.includes("نور") || trimmed.includes("nour")) return "nour";
    return "sara";
  }, [name]);

  // Hook for acoustic and cadence-based lip sync
  const { mouthOpenness, viseme } = useLipSync(audioElement, isSpeaking);

  // Natural organic eye blinking
  const [isBlinking, setIsBlinking] = useState(false);
  useEffect(() => {
    let blinkTimeout: NodeJS.Timeout;
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
        // Next blink between 3.2s and 5.8s
        const nextDelay = 3200 + Math.random() * 2600;
        blinkTimeout = setTimeout(triggerBlink, nextDelay);
      }, 140);
    };

    const initialDelay = 1800 + Math.random() * 2000;
    blinkTimeout = setTimeout(triggerBlink, initialDelay);

    return () => clearTimeout(blinkTimeout);
  }, []);

  // Determine current active expression image
  const currentExpression = useMemo(() => {
    // 1. If actively speaking, lip-sync between frames based on audio energy & visemes
    if (isSpeaking) {
      if (mouthOpenness < 0.2) {
        return "engaged";
      } else if (viseme === "round" || mouthOpenness > 0.7) {
        return "speaking";
      } else {
        return "speaking";
      }
    }

    // 2. If blinking during attentive state
    if (isBlinking && state === "attentive") {
      return "surprised"; // closed / sleepy eye frame
    }

    // 3. Behavioral states
    if (state === "distracted") {
      return "bored"; // Exact reference frame: chin in hand, looking away
    }

    if (state === "hand_raised") {
      return "engaged"; // High engagement, eager look
    }

    // Default attentive / high attention
    if (attention >= 85) {
      return "engaged";
    }

    return "neutral";
  }, [isSpeaking, mouthOpenness, viseme, isBlinking, state, attention]);

  const avatarSrc = `/avatars/${personaKey}/${currentExpression}.png`;

  // Color scheme matching the official reference badges
  const personaTheme = useMemo(() => {
    switch (personaKey) {
      case "omar":
        return {
          pillBg: "bg-teal-500",
          pillBorder: "border-teal-400/40",
          glow: "rgba(20, 184, 166, 0.4)",
          tagColor: "text-teal-300",
        };
      case "sara":
        return {
          pillBg: "bg-rose-500",
          pillBorder: "border-rose-400/40",
          glow: "rgba(244, 63, 94, 0.4)",
          tagColor: "text-rose-300",
        };
      case "yassin":
        return {
          pillBg: "bg-blue-600",
          pillBorder: "border-blue-400/40",
          glow: "rgba(37, 99, 235, 0.4)",
          tagColor: "text-blue-300",
        };
      case "nour":
        return {
          pillBg: "bg-purple-600",
          pillBorder: "border-purple-400/40",
          glow: "rgba(168, 85, 247, 0.4)",
          tagColor: "text-purple-300",
        };
    }
  }, [personaKey]);

  return (
    <div
      className={`relative select-none flex items-center justify-center group ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 3D Pixar Avatar Card Image */}
      <div
        className="w-full h-full rounded-full overflow-hidden relative shadow-inner transition-all duration-200"
        style={{
          boxShadow: isSpeaking
            ? `0 0 24px ${personaTheme.glow}, inset 0 0 12px rgba(255,255,255,0.2)`
            : "none",
        }}
      >
        <Image
          src={avatarSrc}
          alt={name}
          fill
          priority
          sizes={`${size}px`}
          className={`object-cover transition-transform duration-300 ${
            isSpeaking ? "scale-105" : state === "hand_raised" ? "scale-102 -translate-y-0.5" : "scale-100"
          }`}
        />

        {/* Subtle speaking acoustic pulse overlay */}
        {isSpeaking && (
          <div className="absolute inset-0 bg-gradient-to-t from-[#12B8C4]/20 via-transparent to-transparent pointer-events-none" />
        )}
      </div>

      {/* Hand Raised Floating Reaction Badge */}
      {state === "hand_raised" && (
        <div className="absolute -top-3.5 -right-3 z-30 flex items-center animate-bounce duration-700">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold text-[10px] shadow-lg border border-white/60">
            <Hand className="w-2.5 h-2.5" />
            <span>أنا عندي سؤال!</span>
          </div>
        </div>
      )}

      {/* Distracted Wandering Reaction Badge */}
      {state === "distracted" && (
        <div className="absolute -top-3.5 -left-2.5 z-30 flex items-center animate-pulse">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/95 text-amber-300 font-bold text-[10px] shadow-lg border border-amber-500/40">
            <Moon className="w-2.5 h-2.5" />
            <span>مش فاكر بصراحة</span>
          </div>
        </div>
      )}

      {/* Real-Time Speaking Visualizer Halo */}
      {isSpeaking && (
        <div className="absolute -bottom-2 z-20 flex items-center gap-0.5 bg-[#030B18]/90 px-2 py-0.5 rounded-full border border-[#12B8C4]/50 shadow-md">
          <span
            className="w-1 bg-[#12B8C4] rounded-full animate-pulse"
            style={{ height: `${8 + mouthOpenness * 12}px` }}
          />
          <span
            className="w-1 bg-[#12B8C4] rounded-full animate-pulse"
            style={{ height: `${12 + mouthOpenness * 16}px`, animationDelay: "100ms" }}
          />
          <span
            className="w-1 bg-[#12B8C4] rounded-full animate-pulse"
            style={{ height: `${6 + mouthOpenness * 10}px`, animationDelay: "200ms" }}
          />
          <span className="text-[9px] font-bold text-[#12B8C4] mr-1">بيتكلم...</span>
        </div>
      )}
    </div>
  );
}
