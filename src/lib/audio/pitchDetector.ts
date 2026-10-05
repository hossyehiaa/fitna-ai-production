/**
 * Voice pitch detector and gender classifier for teacher utterance audio.
 *
 * Uses normalized autocorrelation on PCM audio samples to estimate the
 * fundamental frequency (F0) of human speech.
 *
 * Threshold:
 * - Adult male voice fundamental frequency: 85 Hz - 165 Hz (mean ~115-130 Hz).
 * - Adult female voice fundamental frequency: 165 Hz - 270 Hz (mean ~200-220 Hz).
 * - Boundary: 165 Hz.
 */

export interface PitchAnalysisResult {
  pitch: number | null;
  gender: "male" | "female" | null;
}

/**
 * Detects fundamental frequency (pitch) from raw PCM audio samples.
 */
export function detectPitchFromPcm(samples: Float32Array, sampleRate: number): PitchAnalysisResult {
  if (!samples || samples.length < 2048 || !sampleRate || sampleRate <= 0) {
    return { pitch: null, gender: null };
  }

  const windowSize = 2048;
  const hopSize = 1024;
  const minFreq = 75; // Lowest typical male pitch (Hz)
  const maxFreq = 320; // Highest typical female speech pitch (Hz)
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.ceil(sampleRate / minFreq);

  const pitches: number[] = [];

  for (let offset = 0; offset + windowSize <= samples.length; offset += hopSize) {
    let sumSquares = 0;
    for (let i = 0; i < windowSize; i++) {
      const val = samples[offset + i];
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / windowSize);
    if (rms < 0.02) continue; // Skip silent or low-energy unvoiced frames

    // Autocorrelation over human pitch lag range with overlap length compensation
    const corr = new Float32Array(maxLag + 1);
    let bestLag = -1;
    let maxNormCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < windowSize - lag; i++) {
        sum += samples[offset + i] * samples[offset + i + lag];
      }
      const normFactor = (windowSize / (windowSize - lag)) * sumSquares;
      const norm = normFactor > 0 ? sum / normFactor : 0;
      corr[lag] = norm;

      if (norm > maxNormCorr) {
        maxNormCorr = norm;
        bestLag = lag;
      }
    }

    if (maxNormCorr > 0.38 && bestLag > 0) {
      // Octave error prevention:
      // Adult male voices often have strong second harmonics (e.g. 230 Hz) due to microphone high-pass filters.
      // If there is a subharmonic peak at ~2 * bestLag (e.g. 115 Hz) with at least 65% of the harmonic peak,
      // it is the true fundamental frequency F0!
      const doubleLag = bestLag * 2;
      if (doubleLag <= maxLag) {
        const searchMin = Math.floor(doubleLag * 0.92);
        const searchMax = Math.min(maxLag, Math.ceil(doubleLag * 1.08));
        let maxSubCorr = -Infinity;
        let bestSubLag = -1;
        for (let l = searchMin; l <= searchMax; l++) {
          if (corr[l] > maxSubCorr) {
            maxSubCorr = corr[l];
            bestSubLag = l;
          }
        }
        if (maxSubCorr >= 0.65 * maxNormCorr && maxSubCorr > 0.32) {
          bestLag = bestSubLag;
        }
      }

      const freq = sampleRate / bestLag;
      if (freq >= minFreq && freq <= maxFreq) {
        pitches.push(freq);
      }
    }
  }

  if (pitches.length < 2) {
    return { pitch: null, gender: null };
  }

  // Calculate median pitch across voiced frames for stability against outliers
  pitches.sort((a, b) => a - b);
  const medianPitch = pitches[Math.floor(pitches.length / 2)];
  const gender = medianPitch < 165 ? "male" : "female";

  return { pitch: medianPitch, gender };
}

/**
 * Decodes an audio Blob in the browser using Web Audio API and classifies voice gender.
 */
export async function detectVoiceGenderFromBlob(
  blob: Blob,
  existingCtx?: AudioContext | null
): Promise<"male" | "female" | null> {
  if (typeof window === "undefined" || !blob || blob.size < 500) {
    return null;
  }

  let localCtx: AudioContext | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = existingCtx && existingCtx.state !== "closed" ? existingCtx : (localCtx = new AudioCtx());
    // Clone buffer so original blob is not detached
    const arrayBuffer = await blob.slice(0).arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const result = detectPitchFromPcm(channelData, audioBuffer.sampleRate);
    return result.gender;
  } catch (err) {
    console.warn("detectVoiceGenderFromBlob error:", err);
    return null;
  } finally {
    if (localCtx && localCtx.state !== "closed") {
      localCtx.close().catch(() => {});
    }
  }
}
