"use client";

import { useEffect, useRef, useState } from "react";

export type VisemeShape = "rest" | "slight" | "mid" | "wide" | "round";

export interface LipSyncData {
  mouthOpenness: number; // 0.0 (closed) to 1.0 (wide open)
  viseme: VisemeShape;
  isSpeaking: boolean;
}

/**
 * Real-time acoustic lip-sync analyzer hook.
 * Connects to the active student's HTMLAudioElement via Web Audio API AnalyserNode,
 * reading instantaneous speech amplitude and frequency envelope.
 * Includes a natural speech-cadence fallback when audio context is restricted.
 */
export function useLipSync(
  audioElement: HTMLAudioElement | null,
  isSpeaking: boolean
): LipSyncData {
  const [mouthOpenness, setMouthOpenness] = useState<number>(0);
  const [viseme, setViseme] = useState<VisemeShape>("rest");

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number>(0);

  useEffect(() => {
    if (!isSpeaking) {
      setMouthOpenness(0);
      setViseme("rest");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Try setting up Web Audio API Analyser
    let hasWebAudio = false;
    try {
      if (audioElement && typeof window !== "undefined") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (AudioCtx) {
          if (!audioContextRef.current || audioContextRef.current.state === "closed") {
            audioContextRef.current = new AudioCtx();
          }

          const ctx = audioContextRef.current;
          if (ctx.state === "suspended") {
            void ctx.resume();
          }

          if (!analyserRef.current) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            analyserRef.current = analyser;
          }

          // Only create MediaElementSource once per audio element to avoid DOMException
          if (connectedAudioRef.current !== audioElement) {
            try {
              if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
              }
              const source = ctx.createMediaElementSource(audioElement);
              source.connect(analyserRef.current);
              analyserRef.current.connect(ctx.destination);
              sourceNodeRef.current = source;
              connectedAudioRef.current = audioElement;
              hasWebAudio = true;
            } catch {
              // May throw if already connected or CORS blocked
              hasWebAudio = false;
            }
          } else {
            hasWebAudio = true;
          }
        }
      }
    } catch {
      hasWebAudio = false;
    }

    const analyser = analyserRef.current;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    let prevOpenness = 0;

    const tick = () => {
      if (!isSpeaking) {
        setMouthOpenness(0);
        setViseme("rest");
        return;
      }

      let currentVal = 0;

      if (hasWebAudio && analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);

        // Vocal speech frequencies roughly span bins 3 to 35 (approx 250Hz - 3500Hz)
        let sum = 0;
        let count = 0;
        const startBin = 3;
        const endBin = Math.min(dataArray.length, 36);

        for (let i = startBin; i < endBin; i++) {
          sum += dataArray[i];
          count++;
        }

        const avg = count > 0 ? sum / count : 0;
        // Normalize 0-255 with noise floor around 18
        const normalized = Math.max(0, (avg - 18) / 100);
        currentVal = Math.min(1.0, normalized * 1.4);
      } else {
        // Natural speech cadence algorithmic oscillation with realistic word pauses
        fallbackTimerRef.current += 0.14;
        const t = fallbackTimerRef.current;
        // Syllable modulation (mouth opens on vowels, closes on consonants and pauses)
        const wordEnvelope = Math.max(0, Math.sin(t * 2.8) * 0.7 + 0.3);
        const syllablePulse = Math.max(0, Math.sin(t * 8.6) * 0.65 + Math.sin(t * 14.2) * 0.35);
        currentVal = Math.min(1.0, wordEnvelope * syllablePulse * 1.4);
      }

      // Smooth responsive interpolation to avoid jitter while preserving quick consonant snaps
      const smoothed = prevOpenness * 0.3 + currentVal * 0.7;
      prevOpenness = smoothed;

      setMouthOpenness(smoothed);

      // Determine viseme shape based on openness and frequency distribution
      if (smoothed < 0.12) {
        setViseme("rest");
      } else if (smoothed < 0.35) {
        setViseme("slight");
      } else if (smoothed < 0.65) {
        setViseme("mid");
      } else if (smoothed < 0.85) {
        setViseme("round");
      } else {
        setViseme("wide");
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [audioElement, isSpeaking]);

  return {
    mouthOpenness,
    viseme,
    isSpeaking,
  };
}
