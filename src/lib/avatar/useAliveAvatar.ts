"use client";

import { useEffect, useRef, useState } from "react";

export interface AliveAvatarState {
  isBlinking: boolean;
  blinkScaleY: number;
  breathY: number;
  headTiltDeg: number;
  headScale: number;
  speechNodY: number;
  speechTiltDeg: number;
  jawDropY: number;
  fluidMouthOpenness: number;
}

export function useAliveAvatar(
  rawMouthOpenness: number,
  isSpeaking: boolean,
  state: "attentive" | "hand_raised" | "distracted" = "attentive"
): AliveAvatarState {
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkScaleY, setBlinkScaleY] = useState(1);

  const [motion, setMotion] = useState({
    breathY: 0,
    headTiltDeg: 0,
    headScale: 1,
    speechNodY: 0,
    speechTiltDeg: 0,
    jawDropY: 0,
    fluidMouthOpenness: 0,
  });

  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const nextBlinkTimeRef = useRef<number>(Date.now() + 2000 + Math.random() * 2000);
  const isBlinkInProgressRef = useRef<boolean>(false);
  const smoothMouthRef = useRef<number>(0);

  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      const now = Date.now();
      const t = (now - startTimeRef.current) * 0.001;

      // 1. Organic Eye Blinking
      if (now >= nextBlinkTimeRef.current && !isBlinkInProgressRef.current) {
        isBlinkInProgressRef.current = true;
        setIsBlinking(true);

        const blinkStart = now;
        const blinkDuration = 140;

        const blinkStep = () => {
          const elapsed = Date.now() - blinkStart;
          const progress = Math.min(1, elapsed / blinkDuration);

          let scale = 1;
          if (progress < 0.45) {
            scale = Math.max(0.05, 1 - (progress / 0.45) * 0.95);
          } else {
            scale = Math.min(1, 0.05 + ((progress - 0.45) / 0.55) * 0.95);
          }
          setBlinkScaleY(scale);

          if (progress < 1) {
            requestAnimationFrame(blinkStep);
          } else {
            setBlinkScaleY(1);
            setIsBlinking(false);
            isBlinkInProgressRef.current = false;

            const isDouble = Math.random() < 0.28;
            const nextDelay = isDouble ? 200 : 2500 + Math.random() * 2800;
            nextBlinkTimeRef.current = Date.now() + nextDelay;
          }
        };

        requestAnimationFrame(blinkStep);
      }

      // 2. Continuous Fluid Lip-Sync Interpolation (Spring Lerp)
      const targetMouth = isSpeaking ? rawMouthOpenness : 0;
      smoothMouthRef.current += (targetMouth - smoothMouthRef.current) * 0.35;
      if (smoothMouthRef.current < 0.015) smoothMouthRef.current = 0;

      // 3. Organic Breathing & Posture Dynamics based on Student State
      let breathCycleSpeed = 1.3;
      let breathAmplitude = 1.6;
      let idleSwayAmplitude = 0.6;

      if (state === "hand_raised") {
        breathCycleSpeed = 2.0;
        breathAmplitude = 2.2;
        idleSwayAmplitude = 0.9;
      } else if (state === "distracted") {
        breathCycleSpeed = 0.85;
        breathAmplitude = 1.1;
        idleSwayAmplitude = 1.3;
      }

      const breathY = Math.sin(t * breathCycleSpeed) * breathAmplitude;
      const headTiltDeg = Math.sin(t * (breathCycleSpeed * 0.5)) * idleSwayAmplitude;
      const headScale = 1 + Math.sin(t * breathCycleSpeed) * 0.003;

      // 4. Expressive Speech Gestures
      let speechNodY = 0;
      let speechTiltDeg = 0;
      let jawDropY = 0;

      if (isSpeaking && smoothMouthRef.current > 0.05) {
        speechNodY = Math.sin(t * 7.5) * (smoothMouthRef.current * 3.2);
        speechTiltDeg = Math.cos(t * 5.0) * (smoothMouthRef.current * 1.6);
        jawDropY = smoothMouthRef.current * 2.5;
      }

      setMotion({
        breathY,
        headTiltDeg,
        headScale,
        speechNodY,
        speechTiltDeg,
        jawDropY,
        fluidMouthOpenness: smoothMouthRef.current,
      });

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [rawMouthOpenness, isSpeaking, state]);

  return {
    isBlinking,
    blinkScaleY,
    ...motion,
  };
}
