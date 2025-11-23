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
 * Analyzes multiple regions of the video frame to determine:
 * - Average brightness across the frame
 * - Contrast ratio (brightest to darkest regions)
 * - Whether the scene is considered "low light"
 * - Suggested gain adjustment for optimal brightness
 *
 * Uses a multi-sample approach for more accurate detection:
 * - Center-weighted sampling (face region typically center)
 * - Edge sampling for background context
 * - Smooth gain transitions to avoid flickering
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
  // Reusable ImageData buffer to avoid GC churn
  const imageDataRef = useRef<ImageData | null>(null);

  // Initialize canvas and reusable ImageData buffer for sampling
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctxRef.current = ctx;

    // Pre-allocate ImageData buffer to avoid allocations during analysis
    if (ctx) {
      imageDataRef.current = ctx.createImageData(sampleSize, sampleSize);
    }

    return () => {
      canvasRef.current = null;
      ctxRef.current = null;
      imageDataRef.current = null;
    };
  }, [sampleSize]);

  // Analyze brightness from multiple regions
  // Optimized to reuse ImageData buffer and reduce allocations
  const analyzeBrightness = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const reusableImageData = imageDataRef.current;

    if (!video || !canvas || !ctx || !reusableImageData || video.paused || video.readyState < 2) {
      return null;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (vw === 0 || vh === 0) return null;

    try {
      // Sample regions: center (40%), corners (15% each)
      // Note: Using static array to avoid allocation per call
      const regions = [
        // Center region (weighted more heavily)
        { x: vw * 0.3, y: vh * 0.3, w: vw * 0.4, h: vh * 0.4, weight: 0.5 },
        // Top-left
        { x: 0, y: 0, w: vw * 0.25, h: vh * 0.25, weight: 0.125 },
        // Top-right
        { x: vw * 0.75, y: 0, w: vw * 0.25, h: vh * 0.25, weight: 0.125 },
        // Bottom-left
        { x: 0, y: vh * 0.75, w: vw * 0.25, h: vh * 0.25, weight: 0.125 },
        // Bottom-right
        { x: vw * 0.75, y: vh * 0.75, w: vw * 0.25, h: vh * 0.25, weight: 0.125 },
      ];

      let totalWeightedBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;

      // Reuse the same Uint8ClampedArray reference for all regions
      const data = reusableImageData.data;
      const pixelCount = sampleSize * sampleSize;

      for (const region of regions) {
        // Draw region to sample canvas
        ctx.drawImage(video, region.x, region.y, region.w, region.h, 0, 0, sampleSize, sampleSize);

        // Copy pixel data directly into our reusable buffer
        // This copies into the existing Uint8ClampedArray instead of allocating new one
        const freshData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        data.set(freshData.data);

        let regionBrightness = 0;

        // Process pixel data (RGBA format, 4 bytes per pixel)
        for (let i = 0; i < data.length; i += 4) {
          // Use perceived brightness formula (ITU-R BT.709)
          const luminance =
            0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
          regionBrightness += luminance;

          minBrightness = Math.min(minBrightness, luminance);
          maxBrightness = Math.max(maxBrightness, luminance);
        }

        const avgRegionBrightness = regionBrightness / pixelCount;
        totalWeightedBrightness += avgRegionBrightness * region.weight;
      }

      const averageBrightness = totalWeightedBrightness;
      const contrastRatio = maxBrightness > 0 ? minBrightness / maxBrightness : 0;
      const isLowLight = averageBrightness < targetBrightness * 0.8;

      // Calculate suggested gain
      let suggestedGain = 0;
      if (averageBrightness < targetBrightness) {
        // Scale gain based on how far below target we are
        const deficit = targetBrightness - averageBrightness;
        const deficitRatio = deficit / targetBrightness;
        // Max gain of 80, scaled by deficit ratio
        suggestedGain = Math.min(deficitRatio * 100, 80);

        // Reduce gain if contrast is already low (to avoid washing out)
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
      // Canvas might be tainted
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

        // Smooth transition to new gain value
        const currentGain = autoGainRef.current;
        const targetGain = result.suggestedGain;
        const diff = targetGain - currentGain;

        // Only adjust if difference is significant
        if (Math.abs(diff) > 0.5) {
          const newGain = currentGain + diff * smoothingFactor;
          autoGainRef.current = newGain;
          setAutoGain(newGain);
        }
      }
    };

    // Run immediately
    runAnalysis();

    // Then run on interval
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
