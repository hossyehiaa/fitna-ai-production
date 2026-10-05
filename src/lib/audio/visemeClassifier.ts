"use client";

import { useEffect, useRef, useState } from "react";

export type VisemeType = "closed" | "viseme_half" | "viseme_A" | "viseme_O" | "viseme_E";

export interface VisemeState {
  currentViseme: VisemeType;
  mouthOpenness: number; // 0.0 to 1.0
}

/**
 * Real-time acoustic formant & phoneme classifier hook.
 * Analyzes audio element frequency bands to classify into 5 distinct Pixar visemes:
 * - 'closed': silence, resting, or bilabials (M, B, P)
 * - 'viseme_half': consonants & transitions (S, T, D, N, L, R)
 * - 'viseme_A': open wide jaw vowels (A, AA, AH, Fatha)
 * - 'viseme_O': rounded puckered lips (O, OO, W, Damma)
 * - 'viseme_E': wide horizontal smile with teeth (E, I, EE, Kasra)
 * 
 * Includes an organic phonetic cadence engine when Web Audio API is restricted.
 */
export function useVisemeClassifier(
  audioElement: HTMLAudioElement | null,
  isSpeaking: boolean
): VisemeState {
  const [currentViseme, setCurrentViseme] = useState<VisemeType>("closed");
  const [mouthOpenness, setMouthOpenness] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Viseme hold timer to avoid unnatural sub-frame jitter
  const lastChangeTimeRef = useRef<number>(0);
  const activeVisemeRef = useRef<VisemeType>("closed");
  const fallbackClockRef = useRef<number>(0);

  useEffect(() => {
    if (!isSpeaking) {
      setCurrentViseme("closed");
      setMouthOpenness(0);
      activeVisemeRef.current = "closed";
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

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
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.45;
            analyserRef.current = analyser;
          }

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
    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    // Procedural phonetic syllable cycles for natural fallbacks
    const fallbackPhonemePatterns: VisemeType[] = [
      "viseme_half",
      "viseme_A",
      "viseme_half",
      "viseme_O",
      "viseme_half",
      "viseme_E",
      "viseme_A",
      "viseme_half",
      "closed",
    ];

    let prevOpen = 0;

    const loop = (timestamp: number) => {
      // Strictly enforce closed mouth if not speaking or if audio is paused/buffering/ended
      if (
        !isSpeaking ||
        (audioElement && (audioElement.paused || audioElement.ended || audioElement.currentTime === 0))
      ) {
        setCurrentViseme("closed");
        setMouthOpenness(0);
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      let detectedViseme: VisemeType = "closed";
      let openVal = 0;

      if (hasWebAudio && analyser && freqData) {
        analyser.getByteFrequencyData(freqData);

        // Low formant band (F1: 250Hz - 700Hz, bins 3 to 9)
        let lowSum = 0;
        for (let i = 3; i <= 9; i++) lowSum += freqData[i];
        const lowEnergy = lowSum / 7;

        // Mid formant band (F2: 800Hz - 1800Hz, bins 10 to 22)
        let midSum = 0;
        for (let i = 10; i <= 22; i++) midSum += freqData[i];
        const midEnergy = midSum / 13;

        // High formant band (F3 & sibilants: 1900Hz - 4000Hz, bins 23 to 48)
        let highSum = 0;
        for (let i = 23; i <= 48; i++) highSum += freqData[i];
        const highEnergy = highSum / 26;

        const totalVoiceEnergy = (lowEnergy * 0.4 + midEnergy * 0.4 + highEnergy * 0.2);

        if (totalVoiceEnergy < 18) {
          detectedViseme = "closed";
          openVal = 0;
        } else if (totalVoiceEnergy < 34) {
          detectedViseme = "viseme_half";
          openVal = 0.35;
        } else {
          // Determine vowel shape by relative formant dominance
          if (highEnergy > midEnergy * 1.05 && highEnergy > lowEnergy * 0.9) {
            detectedViseme = "viseme_E";
            openVal = 0.65;
          } else if (lowEnergy > midEnergy * 1.15) {
            detectedViseme = "viseme_O";
            openVal = 0.8;
          } else {
            detectedViseme = "viseme_A";
            openVal = 0.95;
          }
        }
      } else {
        // Organic syllable timing: ~3.8 syllables per second
        fallbackClockRef.current += 0.16;
        const clk = fallbackClockRef.current;
        const patternIndex = Math.floor(clk) % fallbackPhonemePatterns.length;
        detectedViseme = fallbackPhonemePatterns[patternIndex];

        // Smooth sinusoidal pulse for syllable openness
        const syllableOpen = Math.max(0, Math.sin(clk * Math.PI));
        openVal = detectedViseme === "closed" ? 0 : detectedViseme === "viseme_half" ? 0.35 * syllableOpen : 0.85 * syllableOpen;
      }

      // Viseme hold duration: keep viseme for at least 80ms to avoid sub-frame flickering
      if (timestamp - lastChangeTimeRef.current > 80) {
        if (detectedViseme !== activeVisemeRef.current) {
          activeVisemeRef.current = detectedViseme;
          setCurrentViseme(detectedViseme);
          lastChangeTimeRef.current = timestamp;
        }
      }

      // Smooth mouth openness lerp
      const smoothedOpen = prevOpen * 0.4 + openVal * 0.6;
      prevOpen = smoothedOpen;
      setMouthOpenness(smoothedOpen);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [audioElement, isSpeaking]);

  return {
    currentViseme,
    mouthOpenness,
  };
}
