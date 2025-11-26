import { useRef, useCallback, useMemo } from 'react';

/**
 * Pre-allocated buffers for histogram calculations
 * This fixes the memory allocation issues identified in the architecture review
 */
interface HistogramBuffers {
  rHist: Uint32Array;
  gHist: Uint32Array;
  bHist: Uint32Array;
  lHist: Uint32Array;
}

/**
 * Pre-allocated canvas for zebra pattern (reused to avoid DOM element creation each frame)
 */
interface PatternCache {
  canvas: HTMLCanvasElement;
  pattern: CanvasPattern | null;
}

export interface ProOverlaySettings {
  gridOverlay: string;
  showHistogram: boolean;
  showZebraStripes: boolean;
  zebraThreshold: number;
  showFocusPeaking: boolean;
  focusPeakingColor: string;
}

export interface UseProOverlaysReturn {
  drawGridOverlay: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    gridOverlay: string
  ) => void;
  drawHistogram: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    imageData: ImageData
  ) => void;
  drawZebraStripes: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    imageData: ImageData,
    zebraThreshold: number
  ) => void;
  drawFocusPeaking: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    imageData: ImageData,
    focusPeakingColor: string
  ) => void;
}

/**
 * useProOverlays - Professional overlay drawing functions with optimized memory allocation
 *
 * Features:
 * - Grid overlays (rule of thirds, center cross, golden ratio, safe zones)
 * - Real-time histogram display (RGBL channels)
 * - Zebra stripes for overexposure warning
 * - Focus peaking with configurable color
 *
 * Optimizations:
 * - Pre-allocated Uint32Array buffers for histogram (avoids 30,720 allocations/sec)
 * - Cached zebra pattern canvas (avoids 30 DOM element creations/sec)
 */
export function useProOverlays(): UseProOverlaysReturn {
  // Pre-allocate histogram buffers (fixes memory allocation issue)
  const histogramBuffers = useRef<HistogramBuffers>({
    rHist: new Uint32Array(256),
    gHist: new Uint32Array(256),
    bHist: new Uint32Array(256),
    lHist: new Uint32Array(256),
  });

  // Pre-allocate zebra pattern canvas (fixes DOM element creation per frame)
  const patternCache = useRef<Map<number, PatternCache>>(new Map());

  // Reusable draw queue to avoid allocation every frame
  const drawQueueRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  // Initialize zebra pattern canvas once with threshold-based caching
  const getZebraPattern = useCallback(
    (ctx: CanvasRenderingContext2D, threshold: number): CanvasPattern | null => {
      let cache = patternCache.current.get(threshold);

      if (!cache) {
        // Create new pattern canvas for this threshold
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 8;
        patternCanvas.height = 8;
        const pCtx = patternCanvas.getContext('2d', { willReadFrequently: true });
        if (pCtx) {
          // Adjust pattern opacity based on threshold
          const opacity = Math.max(0.3, Math.min(0.8, (100 - threshold) / 100));
          pCtx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
          pCtx.lineWidth = 2;
          pCtx.beginPath();
          pCtx.moveTo(0, 8);
          pCtx.lineTo(8, 0);
          pCtx.stroke();
        }
        cache = {
          canvas: patternCanvas,
          pattern: null, // Will be created below
        };
        patternCache.current.set(threshold, cache);
      }

      // Create pattern for this context if not exists or context changed
      if (!cache.pattern) {
        try {
          cache.pattern = ctx.createPattern(cache.canvas, 'repeat');
        } catch (e) {
          console.warn('[useProOverlays] Failed to create zebra pattern:', e);
          return null;
        }
      }

      return cache.pattern;
    },
    []
  );

  // Draw grid overlays
  const drawGridOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, gridOverlay: string) => {
      if (gridOverlay === 'none') return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;

      if (gridOverlay === 'thirds') {
        const thirdW = width / 3;
        const thirdH = height / 3;
        ctx.beginPath();
        ctx.moveTo(thirdW, 0);
        ctx.lineTo(thirdW, height);
        ctx.moveTo(thirdW * 2, 0);
        ctx.lineTo(thirdW * 2, height);
        ctx.moveTo(0, thirdH);
        ctx.lineTo(width, thirdH);
        ctx.moveTo(0, thirdH * 2);
        ctx.lineTo(width, thirdH * 2);
        ctx.stroke();
      } else if (gridOverlay === 'center') {
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.arc(width / 2, height / 2, Math.min(width, height) / 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (gridOverlay === 'golden') {
        const phi = 1.618;
        const g1 = width / phi;
        const g2 = width - g1;
        const gh1 = height / phi;
        const gh2 = height - gh1;
        ctx.beginPath();
        ctx.moveTo(g2, 0);
        ctx.lineTo(g2, height);
        ctx.moveTo(g1, 0);
        ctx.lineTo(g1, height);
        ctx.moveTo(0, gh2);
        ctx.lineTo(width, gh2);
        ctx.moveTo(0, gh1);
        ctx.lineTo(width, gh1);
        ctx.stroke();
      } else if (gridOverlay === 'safe') {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
        const actionMarginX = width * 0.05;
        const actionMarginY = height * 0.05;
        ctx.strokeRect(
          actionMarginX,
          actionMarginY,
          width - actionMarginX * 2,
          height - actionMarginY * 2
        );
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        const titleMarginX = width * 0.1;
        const titleMarginY = height * 0.1;
        ctx.strokeRect(
          titleMarginX,
          titleMarginY,
          width - titleMarginX * 2,
          height - titleMarginY * 2
        );
      }

      ctx.restore();
    },
    []
  );

  // Draw histogram overlay with pre-allocated buffers
  const drawHistogram = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, imageData: ImageData) => {
      const data = imageData.data;
      const { rHist, gHist, bHist, lHist } = histogramBuffers.current;

      // Reset buffers (much faster than reallocating)
      rHist.fill(0);
      gHist.fill(0);
      bHist.fill(0);
      lHist.fill(0);

      // Adaptive sampling based on resolution for performance
      const pixelCount = width * height;
      let sampleStep = 16; // Default: sample every 16th pixel

      if (pixelCount > 3840 * 2160) {
        // 8K+
        sampleStep = 64;
      } else if (pixelCount > 2560 * 1440) {
        // 1440p+
        sampleStep = 48;
      } else if (pixelCount > 1920 * 1080) {
        // 1080p+
        sampleStep = 32;
      } else if (pixelCount > 1280 * 720) {
        // 720p+
        sampleStep = 24;
      }

      for (let i = 0; i < data.length; i += sampleStep * 4) {
        const r = data[i] || 0;
        const g = data[i + 1] || 0;
        const b = data[i + 2] || 0;
        const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        // Increment histogram bins (safe because r,g,b,l are clamped 0-255)
        rHist[r] = (rHist[r] ?? 0) + 1;
        gHist[g] = (gHist[g] ?? 0) + 1;
        bHist[b] = (bHist[b] ?? 0) + 1;
        lHist[l] = (lHist[l] ?? 0) + 1;
      }

      // Find max for normalization
      let maxAll = 0;
      for (let i = 0; i < 256; i++) {
        const max = Math.max(rHist[i] ?? 0, gHist[i] ?? 0, bHist[i] ?? 0, lHist[i] ?? 0);
        if (max > maxAll) maxAll = max;
      }

      // Draw histogram in bottom-right corner
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const histW = 200;
      const histH = 80;
      const histX = width - histW - 10;
      const histY = height - histH - 10;

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(histX, histY, histW, histH);

      // Draw channels
      const drawChannel = (hist: Uint32Array, color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (let i = 0; i < 256; i++) {
          const x = histX + (i / 255) * histW;
          const histVal = hist[i] ?? 0;
          const y = histY + histH - (histVal / maxAll) * histH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      drawChannel(lHist, 'rgba(255, 255, 255, 0.8)');
      drawChannel(rHist, 'rgba(255, 0, 0, 0.5)');
      drawChannel(gHist, 'rgba(0, 255, 0, 0.5)');
      drawChannel(bHist, 'rgba(0, 0, 255, 0.5)');

      ctx.restore();
    },
    []
  );

  // Draw zebra stripes for overexposed areas (with cached pattern and optimizations)
  const drawZebraStripes = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      imageData: ImageData,
      zebraThreshold: number
    ) => {
      const startTime = performance.now();
      const threshold = (zebraThreshold / 100) * 255;
      const data = imageData.data;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const pattern = getZebraPattern(ctx, zebraThreshold);

      // Adaptive step size based on image resolution and performance needs
      const pixelCount = width * height;
      let step = 8; // Increased from 4 to 8 for better performance
      if (pixelCount > 3840 * 2160)
        // 8K+
        step = 24;
      else if (pixelCount > 2560 * 1440)
        // 1440p+
        step = 20;
      else if (pixelCount > 1920 * 1080)
        // 1080p+
        step = 16;
      else if (pixelCount > 1280 * 720)
        // 720p+
        step = 12;

      let overexposedPixels = 0;
      const maxOverexposed = Math.ceil((pixelCount / (step * step)) * 0.05); // Reduced from 10% to 5% for earlier exit

      // Batch drawing for better performance
      // Reuse array by clearing it
      const drawQueue = drawQueueRef.current;
      drawQueue.length = 0;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const i = (y * width + x) * 4;
          const r = data[i] || 0;
          const g = data[i + 1] || 0;
          const b = data[i + 2] || 0;

          if (r > threshold && g > threshold && b > threshold) {
            overexposedPixels++;

            // Early exit if too many overexposed pixels (performance optimization)
            if (overexposedPixels > maxOverexposed) {
              ctx.fillStyle = pattern || 'rgba(255, 0, 0, 0.5)';
              ctx.fillRect(0, 0, width, height); // Fill entire frame
              ctx.restore();
              return;
            }

            // Queue draws instead of drawing immediately for batching
            drawQueue.push({ x, y, w: step, h: step });
          }
        }
      }

      // Batch draw all zebra stripes at once
      if (drawQueue.length > 0) {
        ctx.fillStyle = pattern || 'rgba(255, 0, 0, 0.5)';
        for (const rect of drawQueue) {
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
      }

      ctx.restore();

      // Performance monitoring
      const endTime = performance.now();
      const duration = endTime - startTime;
      if (duration > 16.67) {
        // Log if it takes more than one frame at 60fps
        console.warn(
          `[ZebraStripes] Slow render: ${duration.toFixed(2)}ms (${drawQueue.length} stripes, step=${step})`
        );
      }
    },
    [getZebraPattern]
  );

  // Draw focus peaking overlay
  const drawFocusPeaking = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      imageData: ImageData,
      focusPeakingColor: string
    ) => {
      const data = imageData.data;
      const colorMap: Record<string, string> = {
        red: 'rgba(255, 0, 0, 0.8)',
        green: 'rgba(0, 255, 0, 0.8)',
        blue: 'rgba(0, 0, 255, 0.8)',
        white: 'rgba(255, 255, 255, 0.8)',
      };
      const peakColor = colorMap[focusPeakingColor] ?? 'rgba(255, 0, 0, 0.8)';

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = peakColor;

      // Adaptive step size for focus peaking based on resolution
      const pixelCount = width * height;
      let step = 2; // Default step

      if (pixelCount > 3840 * 2160) {
        // 8K+
        step = 8;
      } else if (pixelCount > 2560 * 1440) {
        // 1440p+
        step = 6;
      } else if (pixelCount > 1920 * 1080) {
        // 1080p+
        step = 4;
      } else if (pixelCount > 1280 * 720) {
        // 720p+
        step = 3;
      }

      const threshold = 50;

      for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
          const getGray = (px: number, py: number) => {
            const i = (py * width + px) * 4;
            return 0.299 * (data[i] || 0) + 0.587 * (data[i + 1] || 0) + 0.114 * (data[i + 2] || 0);
          };

          const gx = getGray(x + step, y) - getGray(x - step, y);
          const gy = getGray(x, y + step) - getGray(x, y - step);
          const mag = Math.sqrt(gx * gx + gy * gy);

          if (mag > threshold) {
            ctx.fillRect(x, y, step, step);
          }
        }
      }

      ctx.restore();
    },
    []
  );

  // Memoize return object to prevent hook consumer re-renders
  return useMemo(
    () => ({
      drawGridOverlay,
      drawHistogram,
      drawZebraStripes,
      drawFocusPeaking,
    }),
    [drawGridOverlay, drawHistogram, drawZebraStripes, drawFocusPeaking]
  );
}

export default useProOverlays;
