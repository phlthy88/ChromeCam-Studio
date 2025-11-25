import { useEffect, useRef, useState, useCallback } from 'react';

export interface LowLightAnalysis {
  averageBrightness: number;
  minBrightness: number;
  maxBrightness: number;
  contrastRatio: number;
  isLowLight: boolean;
  suggestedGain: number;
}

export interface UseAutoLowLightOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  targetBrightness?: number; // Target average brightness (0-255), default 120
  smoothingFactor?: number; // How fast to adjust (0-1), default 0.08
  sampleInterval?: number; // How often to analyze (ms), default 500
  sampleSize?: number; // Size of sample grid, default 64
}

export interface UseAutoLowLightReturn {
  autoGain: number;
  analysis: LowLightAnalysis | null;
  isAnalyzing: boolean;
}

/**
 * useAutoLowLight - Intelligent low-light detection and gain adjustment
 *
 * OPTIMIZED VERSION:
 * - Uses a single canvas draw/read per interval (downsampling)
 * - Calculates center-weighting via CPU iteration to avoid multiple GPU readbacks
 * - Zero DOM element creation in render loop
 */
export function useAutoLowLight({
  videoRef,
  enabled,
  targetBrightness = 120,
  smoothingFactor = 0.08,
  sampleInterval = 500,
  sampleSize = 64,
}: UseAutoLowLightOptions): UseAutoLowLightReturn {
  const [autoGain, setAutoGain] = useState(0);
  const [analysis, setAnalysis] = useState<LowLightAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const autoGainRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Initialize single reusable canvas
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    canvasRef.current = canvas;
    // willReadFrequently optimizes context for frequent getImageData calls
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctxRef.current = ctx;

    return () => {
      canvasRef.current = null;
      ctxRef.current = null;
    };
  }, [sampleSize]);

  // Analyze brightness - Single pass optimization
  const analyzeBrightness = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!video || !canvas || !ctx || video.paused || video.readyState < 2) {
      return null;
    }

    try {
      // 1. Downsample the entire video frame to sampleSize x sampleSize in ONE draw call
      // This automatically handles averaging pixels (bilinear filtering)
      ctx.drawImage(video, 0, 0, sampleSize, sampleSize);

      // 2. Read pixel data ONCE (Single allocation per interval)
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const data = imageData.data;

      let totalWeightedBrightness = 0;
      let totalWeight = 0;
      let minBrightness = 255;
      let maxBrightness = 0;

      // 3. Iterate pixels and apply center-weighting mathematically
      for (let y = 0; y < sampleSize; y++) {
        for (let x = 0; x < sampleSize; x++) {
          const i = (y * sampleSize + x) * 4;
          // Calculate luminance (Rec. 709 coefficients)
          const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

          // Calculate distance from center (normalized 0.0 to 0.5)
          const cx = x / sampleSize - 0.5;
          const cy = y / sampleSize - 0.5;
          const dist = Math.sqrt(cx * cx + cy * cy);

          // Weight calculation:
          // Center pixels get weight ~1.0
          // Edge pixels get weight ~0.2
          // Formula: 1.0 - (dist * 1.6), clamped at 0.2
          const weight = Math.max(0.2, 1.0 - dist * 1.6);

          totalWeightedBrightness += luminance * weight;
          totalWeight += weight;

          minBrightness = Math.min(minBrightness, luminance);
          maxBrightness = Math.max(maxBrightness, luminance);
        }
      }

      const averageBrightness = totalWeightedBrightness / totalWeight;
      const contrastRatio = maxBrightness > 0 ? minBrightness / maxBrightness : 0;
      const isLowLight = averageBrightness < targetBrightness * 0.8;

      // Calculate suggested gain
      let suggestedGain = 0;
      if (averageBrightness < targetBrightness) {
        const deficit = targetBrightness - averageBrightness;
        const deficitRatio = deficit / targetBrightness;
        suggestedGain = Math.min(deficitRatio * 100, 80);

        if (contrastRatio > 0.7) {
          suggestedGain *= 0.7;
        }
      }

      return {
        averageBrightness,
        minBrightness,
        maxBrightness,
        contrastRatio,
        isLowLight,
        suggestedGain,
      };
    } catch (_e) {
      return null;
    }
  }, [videoRef, sampleSize, targetBrightness]);

  // Main analysis loop
  useEffect(() => {
    if (!enabled) {
      setAutoGain(0);
      autoGainRef.current = 0;
      setAnalysis(null);
      setIsAnalyzing(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsAnalyzing(true);

    const runAnalysis = () => {
      const result = analyzeBrightness();
      if (result) {
        setAnalysis(result);

        const currentGain = autoGainRef.current;
        const targetGain = result.suggestedGain;
        const diff = targetGain - currentGain;

        if (Math.abs(diff) > 0.5) {
          const newGain = currentGain + diff * smoothingFactor;
          autoGainRef.current = newGain;
          setAutoGain(newGain);
        }
      }
    };

    runAnalysis();
    intervalRef.current = setInterval(runAnalysis, sampleInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, analyzeBrightness, smoothingFactor, sampleInterval]);

  return {
    autoGain,
    analysis,
    isAnalyzing,
  };
}

export default useAutoLowLight;
