"use client";

import React, { useEffect, useRef } from "react";
import { VisemeType } from "@/lib/audio/visemeClassifier";

export const STUDENT_MOUTH_BOXES: Record<string, { x: number; y: number; w: number; h: number }> = {
  sara: { x: 409, y: 437, w: 210, h: 110 },
  omar: { x: 407, y: 461, w: 210, h: 110 },
  yassin: { x: 405, y: 461, w: 210, h: 110 },
  nour: { x: 408, y: 465, w: 200, h: 106 },
};

interface VisemeAvatarCanvasProps {
  persona: "sara" | "omar" | "yassin" | "nour";
  baseState: "attentive" | "hand_raised" | "distracted";
  isSpeaking: boolean;
  currentViseme: VisemeType;
  mouthOpenness: number;
  className?: string;
}

export function VisemeAvatarCanvas({
  persona,
  baseState,
  isSpeaking,
  currentViseme,
  mouthOpenness,
  className = "",
}: VisemeAvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cached image elements to prevent any loading flashes or latency
  const imagesRef = useRef<{
    neutral: HTMLImageElement | null;
    speaking: HTMLImageElement | null;
    handRaised: HTMLImageElement | null;
    distracted: HTMLImageElement | null;
    frames: {
      viseme_M: HTMLImageElement | null;
      viseme_A: HTMLImageElement | null;
      viseme_E: HTMLImageElement | null;
      viseme_O: HTMLImageElement | null;
      eyes_blink: HTMLImageElement | null;
      eyes_half: HTMLImageElement | null;
      eyes_wide: HTMLImageElement | null;
      eyes_squint: HTMLImageElement | null;
      eyes_wink: HTMLImageElement | null;
    };
  }>({
    neutral: null,
    speaking: null,
    handRaised: null,
    distracted: null,
    frames: {
      viseme_M: null,
      viseme_A: null,
      viseme_E: null,
      viseme_O: null,
      eyes_blink: null,
      eyes_half: null,
      eyes_wide: null,
      eyes_squint: null,
      eyes_wink: null,
    },
  });

  // Blink timing state
  const nextBlinkTimeRef = useRef<number>(Date.now() + 2000 + Math.random() * 2000);
  const blinkStartRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);

  // Pre-load all postures and sprites
  useEffect(() => {
    let isCancelled = false;

    // Reset frames when persona changes
    imagesRef.current.frames = {
      viseme_M: null,
      viseme_A: null,
      viseme_E: null,
      viseme_O: null,
      eyes_blink: null,
      eyes_half: null,
      eyes_wide: null,
      eyes_squint: null,
      eyes_wink: null,
    };

    const loadImg = (src: string, onLoaded: (img: HTMLImageElement) => void) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (!isCancelled) onLoaded(img);
      };
    };

    loadImg(`/students/${persona}/neutral.jpg`, (img) => (imagesRef.current.neutral = img));
    loadImg(`/students/${persona}/speaking.jpg`, (img) => (imagesRef.current.speaking = img));
    loadImg(`/students/${persona}/hand_raised.jpg`, (img) => (imagesRef.current.handRaised = img));
    loadImg(`/students/${persona}/distracted.jpg`, (img) => (imagesRef.current.distracted = img));

    // Try loading coherent multi-frame animation set for this persona
    loadImg(`/students/${persona}/frames/viseme_M.webp`, (img) => (imagesRef.current.frames.viseme_M = img));
    loadImg(`/students/${persona}/frames/viseme_A.webp`, (img) => (imagesRef.current.frames.viseme_A = img));
    loadImg(`/students/${persona}/frames/viseme_E.webp`, (img) => (imagesRef.current.frames.viseme_E = img));
    loadImg(`/students/${persona}/frames/viseme_O.webp`, (img) => (imagesRef.current.frames.viseme_O = img));
    loadImg(`/students/${persona}/frames/eyes_blink.webp`, (img) => (imagesRef.current.frames.eyes_blink = img));
    loadImg(`/students/${persona}/frames/eyes_half.webp`, (img) => (imagesRef.current.frames.eyes_half = img));
    loadImg(`/students/${persona}/frames/eyes_wide.webp`, (img) => (imagesRef.current.frames.eyes_wide = img));
    loadImg(`/students/${persona}/frames/eyes_squint.webp`, (img) => (imagesRef.current.frames.eyes_squint = img));
    loadImg(`/students/${persona}/frames/eyes_wink.webp`, (img) => (imagesRef.current.frames.eyes_wink = img));

    return () => {
      isCancelled = true;
    };
  }, [persona]);

  // Main 60 FPS Canvas Render Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const render = () => {
      const now = performance.now();
      const realNow = Date.now();

      ctx.save();

      // 1. Organic gentle breathing & speech micro-movement
      const breathY = Math.sin(now * 0.002) * 2.0; // slow calm breathing
      const speechNodY = isSpeaking ? Math.sin(now * 0.012) * 1.5 * mouthOpenness : 0;
      const speechTilt = isSpeaking ? Math.sin(now * 0.006) * 0.004 * mouthOpenness : 0;

      // Transform origin at bottom center
      ctx.translate(512, 850);
      ctx.rotate(speechTilt);
      ctx.translate(-512, -850);
      ctx.translate(0, breathY + speechNodY);

      // 2. Natural Eyelid Blinking Timing (3-stage realistic blink curve)
      if (!isBlinkingRef.current && realNow >= nextBlinkTimeRef.current) {
        isBlinkingRef.current = true;
        blinkStartRef.current = realNow;
      }

      let blinkPhase: "none" | "half" | "closed" = "none";
      if (isBlinkingRef.current) {
        const elapsed = realNow - blinkStartRef.current;
        const totalBlinkDuration = 140; // ms
        if (elapsed < 30) {
          blinkPhase = "half";
        } else if (elapsed < 110) {
          blinkPhase = "closed";
        } else if (elapsed < totalBlinkDuration) {
          blinkPhase = "half";
        } else {
          isBlinkingRef.current = false;
          nextBlinkTimeRef.current = realNow + 2500 + Math.random() * 2500;
        }
      }

      // 3. Select Target Frame
      let baseImg: HTMLImageElement | null = null;
      const sf = imagesRef.current.frames;
      const hasCoherentFrames = Boolean(sf.viseme_M && sf.viseme_M.complete && sf.viseme_M.naturalWidth > 0);

      if (hasCoherentFrames) {
        if (blinkPhase === "closed") {
          baseImg = sf.eyes_blink || sf.viseme_M || imagesRef.current.neutral;
        } else if (blinkPhase === "half") {
          baseImg = sf.eyes_half || sf.eyes_blink || sf.viseme_M || imagesRef.current.neutral;
        } else if (isSpeaking) {
          // Dynamic Viseme Lip Sync
          if (mouthOpenness < 0.12) {
            baseImg = sf.viseme_M || imagesRef.current.neutral;
          } else if (currentViseme === "viseme_A") {
            baseImg = sf.viseme_A || sf.viseme_M;
          } else if (currentViseme === "viseme_O") {
            baseImg = sf.viseme_O || sf.viseme_M;
          } else if (currentViseme === "viseme_E") {
            baseImg = sf.viseme_E || sf.viseme_M;
          } else if (currentViseme === "viseme_half") {
            baseImg = mouthOpenness > 0.4 ? (sf.viseme_E || sf.viseme_A) : sf.viseme_M;
          } else {
            baseImg = sf.viseme_M;
          }
        } else {
          // Idle states
          if (baseState === "hand_raised") {
            baseImg = imagesRef.current.handRaised || sf.eyes_wide || sf.viseme_M;
          } else if (baseState === "distracted") {
            baseImg = imagesRef.current.distracted || sf.viseme_M;
          } else {
            baseImg = sf.viseme_M || imagesRef.current.neutral;
          }
        }
      } else {
        // Clean fallback for personas without coherent frames yet
        baseImg = isSpeaking
          ? imagesRef.current.speaking || imagesRef.current.neutral
          : baseState === "hand_raised"
          ? imagesRef.current.handRaised || imagesRef.current.neutral
          : baseState === "distracted"
          ? imagesRef.current.distracted || imagesRef.current.neutral
          : imagesRef.current.neutral;
      }

      // 4. Render to Canvas with fallback
      if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
        ctx.drawImage(baseImg, 0, 0, 1024, 1024);
      } else {
        const fallback = imagesRef.current.neutral;
        if (fallback && fallback.complete && fallback.naturalWidth > 0) {
          ctx.drawImage(fallback, 0, 0, 1024, 1024);
        } else {
          ctx.fillStyle = "#0a1424";
          ctx.fillRect(0, 0, 1024, 1024);
        }
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [persona, baseState, isSpeaking, currentViseme, mouthOpenness]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}>
      {/* 1024x1024 Native Canvas for Ultra Sharp rendering */}
      <canvas
        ref={canvasRef}
        width={1024}
        height={1024}
        className="w-full h-full object-contain pointer-events-none select-none"
      />
    </div>
  );
}
