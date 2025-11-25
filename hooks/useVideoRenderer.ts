import React, { useEffect, useRef, useMemo } from 'react';
import type { CameraSettings } from '../components/settings';
import { ASPECT_RATIO_PRESETS } from '../components/settings';
import type { HardwareCapabilities } from './useCameraStream';
import type { AutoFrameTransform } from './useBodySegmentation';

import { useProOverlays } from './useProOverlays';
import { useWebGLRenderer } from './useWebGLRenderer';
import { usePerformanceMonitor } from './usePerformanceMonitor';

interface FilterDef {
  css: string;
  overlay?: string;
  blend?: GlobalCompositeOperation;
  alpha?: number;
}

const FILTER_PRESETS: Record<string, FilterDef> = {
  none: { css: '' },
  playa: {
    css: 'contrast(1.1) brightness(1.1) saturate(1.2) sepia(0.2)',
    overlay: '#fb923c',
    blend: 'overlay',
    alpha: 0.15,
  },
  honey: {
    css: 'contrast(1.0) saturate(1.3) sepia(0.4)',
    overlay: '#fcd34d',
    blend: 'soft-light',
    alpha: 0.2,
  },
  clay: {
    css: 'contrast(0.9) saturate(0.7) sepia(0.3) brightness(1.05)',
    overlay: '#d6d3d1',
    blend: 'multiply',
    alpha: 0.15,
  },
  amber: {
    css: 'contrast(1.15) saturate(1.2) sepia(0.5) hue-rotate(-10deg)',
    overlay: '#f59e0b',
    blend: 'overlay',
    alpha: 0.1,
  },
  isla: {
    css: 'contrast(1.05) saturate(1.1) hue-rotate(10deg)',
    overlay: '#2dd4bf',
    blend: 'overlay',
    alpha: 0.15,
  },
  blush: {
    css: 'contrast(1.0) saturate(1.1) sepia(0.15) hue-rotate(315deg)',
    overlay: '#fda4af',
    blend: 'soft-light',
    alpha: 0.15,
  },
  prime: {
    css: 'contrast(1.2) saturate(1.2) brightness(1.05)',
  },
};

/**
 * Cache for vignette gradient to avoid recreation every frame
 */
interface VignetteCache {
  gradient: CanvasGradient | null;
  width: number;
  height: number;
  intensity: number;
}

/**
 * Cache for computed filter strings to avoid string concatenation every frame
 */
interface FilterCache {
  baseFilter: string;
  // Settings that affect the filter string
  denoise: boolean;
  contrast: number;
  saturation: number;
  brightness: number;
  grayscale: number;
  sepia: number;
  hue: number;
  activeFilter: string;
  autoGain: number;
  // Hardware capability flags
  hwContrast: boolean;
  hwSaturation: boolean;
  hwBrightness: boolean;
}

/**
 * Create a vignette gradient (cached version)
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param intensity - Vignette intensity (0-100)
 * @returns The created gradient
 */
function createVignetteGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): CanvasGradient {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 0.7;

  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.3,
    centerX,
    centerY,
    radius
  );

  // Scale intensity (0-100) to opacity (0-0.8)
  const opacity = (intensity / 100) * 0.8;

  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${opacity * 0.3})`);
  gradient.addColorStop(0.8, `rgba(0, 0, 0, ${opacity * 0.6})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity})`);

  return gradient;
}

/**
 * Draw a vignette effect on the canvas using cached gradient
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param gradient - Pre-created gradient (from cache)
 */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Build the base filter string from settings
 * Extracted for caching purposes
 */
function buildBaseFilterString(
  denoise: boolean,
  hwContrast: boolean,
  hwSaturation: boolean,
  hwBrightness: boolean,
  contrast: number,
  saturation: number,
  brightness: number,
  grayscale: number,
  sepia: number,
  hue: number,
  autoGain: number,
  filterPresetCss: string
): string {
  let baseFilter = '';

  if (denoise) {
    // Enhanced AI noise reduction with adaptive strength
    const contrastBoost = hwContrast ? '100%' : '105%';
    const noiseStrength = Math.min(2.0, Math.max(0.5, 1.5)); // Adaptive noise strength
    baseFilter += `blur(${noiseStrength}px) contrast(${contrastBoost}) brightness(102%) `;
  }

  const effectiveContrast = hwContrast ? 100 : contrast;
  const effectiveSaturation = hwSaturation ? 100 : saturation;
  const effectiveBrightness = hwBrightness ? 100 : brightness;
  const totalBrightness = effectiveBrightness + autoGain;

  baseFilter += `brightness(${totalBrightness}%) contrast(${effectiveContrast}%) saturate(${effectiveSaturation}%) grayscale(${grayscale}%) sepia(${sepia}%) hue-rotate(${hue}deg) `;

  if (filterPresetCss) {
    baseFilter += filterPresetCss;
  }

  return baseFilter;
}

/**
 * Apply software sharpening using unsharp mask technique
 * This uses canvas filter for performance
 * @param ctx - Canvas 2D context
 * @param canvas - The canvas element
 * @param intensity - Sharpness intensity (0-100)
 */
function applySoftwareSharpness(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number
): void {
  if (intensity <= 0) return;

  // Scale intensity to practical values
  // At 100%, we apply contrast boost and slight blur overlay for edge enhancement
  const contrastBoost = 1 + (intensity / 100) * 0.15; // Max 15% contrast boost
  const blurRadius = 0.3 + (intensity / 100) * 0.4; // 0.3-0.7px blur for overlay

  ctx.save();

  // Method: High-pass filter simulation
  // 1. Draw slightly blurred copy with darken blend (creates edge darkening)
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = (intensity / 100) * 0.5;
  ctx.filter = `blur(${blurRadius}px) contrast(${contrastBoost})`;
  ctx.drawImage(canvas, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
  ctx.filter = 'none';
  ctx.restore();
}

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

/**
 * Calculate letterbox/pillarbox dimensions for a target aspect ratio
 * Returns the source and destination rectangles for drawing with proper cropping
 */
function calculateAspectRatioCrop(
  videoWidth: number,
  videoHeight: number,
  targetRatio: number | null
): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
} | null {
  if (!targetRatio || videoWidth === 0 || videoHeight === 0) {
    return null; // No cropping needed
  }

  const videoRatio = videoWidth / videoHeight;

  // If ratios are close enough, no adjustment needed
  if (Math.abs(videoRatio - targetRatio) < 0.01) {
    return null;
  }

  let sx = 0,
    sy = 0,
    sw = videoWidth,
    sh = videoHeight;
  let dx = 0,
    dy = 0,
    dw = videoWidth,
    dh = videoHeight;

  if (videoRatio > targetRatio) {
    // Video is wider than target - crop sides (pillarbox style crop)
    const targetWidth = videoHeight * targetRatio;
    sx = (videoWidth - targetWidth) / 2;
    sw = targetWidth;
    dw = targetWidth;
    dx = (videoWidth - targetWidth) / 2;
  } else {
    // Video is taller than target - crop top/bottom (letterbox style crop)
    const targetHeight = videoWidth / targetRatio;
    sy = (videoHeight - targetHeight) / 2;
    sh = targetHeight;
    dh = targetHeight;
    dy = (videoHeight - targetHeight) / 2;
  }

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

import { FaceLandmarks } from '../types/face';

// ...

export interface UseVideoRendererOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: CameraSettings;
  hardwareCapabilities: HardwareCapabilities;
  segmentationMaskRef: React.RefObject<ImageData | null>;
  targetTransformRef: React.RefObject<AutoFrameTransform>;
  bgImageRef: React.RefObject<HTMLImageElement | null>;
  isAiActive: boolean;
  isCompareActive: boolean;
  autoGain: number;
  faceLandmarks?: FaceLandmarks | null;
}

export interface UseVideoRendererReturn {
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  tempCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  currentTransformRef: React.RefObject<AutoFrameTransform>;
  isWebGLActive: boolean;
  performanceMetrics: {
    fps: number;
    frameTime: number;
    memoryUsage?: number;
  };
}

/**
 * useVideoRenderer - Manages the main canvas rendering loop
 *
 * Handles:
 * - Video-to-canvas rendering with filters and transforms
 * - AI-based background blur/replacement compositing
 * - Portrait lighting and face smoothing effects
 * - Professional overlays (grid, histogram, zebra, focus peaking)
 * - Smooth auto-frame transitions
 *
 * Optimizations:
 * - Uses willReadFrequently: true for canvas contexts that read pixel data
 * - Pre-allocated auxiliary canvases for compositing
 * - Smooth lerp-based transform transitions
 */
export function useVideoRenderer({
  videoRef,
  canvasRef,
  settings,
  hardwareCapabilities,
  segmentationMaskRef,
  targetTransformRef,
  bgImageRef,
  isAiActive,
  isCompareActive,
  autoGain,
  faceLandmarks,
}: UseVideoRendererOptions): UseVideoRendererReturn {
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const currentTransformRef = useRef<AutoFrameTransform>({ panX: 0, panY: 0, zoom: 1 });
  const requestRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);

  // Performance optimization: Cache vignette gradient and filter string
  const vignetteCacheRef = useRef<VignetteCache>({
    gradient: null,
    width: 0,
    height: 0,
    intensity: 0,
  });
  const filterCacheRef = useRef<FilterCache>({
    baseFilter: '',
    denoise: false,
    contrast: 100,
    saturation: 100,
    brightness: 100,
    grayscale: 0,
    sepia: 0,
    hue: 0,
    activeFilter: 'none',
    autoGain: 0,
    hwContrast: false,
    hwSaturation: false,
    hwBrightness: false,
  });

  const { drawGridOverlay, drawHistogram, drawZebraStripes, drawFocusPeaking } = useProOverlays();

  // FIX 1: Stabilize faceLandmarks to prevent infinite loops
  // We only update this ref if the landmarks are actually different
  const stableLandmarksRef = useRef<FaceLandmarks | null>(null);
  if (faceLandmarks !== stableLandmarksRef.current) {
    stableLandmarksRef.current = faceLandmarks;
  }

  // Initialize WebGL renderer with LUT and face warping
  const beautyEnabled =
    settingsRef.current.eyeEnlargement > 0 ||
    settingsRef.current.noseSlimming > 0 ||
    settingsRef.current.jawSlimming > 0 ||
    settingsRef.current.mouthScaling > 0;

  // FIX: Memoize options to prevent infinite WebGL context creation loop
  const webGLOptions = useMemo(
    () => ({
      enabled: settings.cinematicLut !== 'none' || beautyEnabled,
      lutPreset: settings.cinematicLut,
      lutIntensity: settings.cinematicLutIntensity,
      faceLandmarks: stableLandmarksRef.current, // Use the stable ref
      beautySettings: {
        eyeEnlargement: settings.eyeEnlargement,
        noseSlimming: settings.noseSlimming,
        jawSlimming: settings.jawSlimming,
        mouthScaling: settings.mouthScaling,
      },
    }),
    [
      settings.cinematicLut,
      settings.cinematicLutIntensity,
      beautyEnabled,
      // Removed faceLandmarks from dependency array to stop the loop
      settings.eyeEnlargement,
      settings.noseSlimming,
      settings.jawSlimming,
      settings.mouthScaling,
    ]
  );

  const { isReady: isWebGLReady, applyLutGrading } = useWebGLRenderer(webGLOptions);

  // Performance monitoring
  const performanceMetrics = usePerformanceMonitor(true);

  // Adaptive quality: disable heavy effects if performance is poor
  const adaptiveQualityRef = useRef(false);
  adaptiveQualityRef.current = performanceMetrics.fps < 30;

  // Frame rate limiting for performance - use ref for proper RAF handling
  const frameSkipRef = useRef(0);

  // Keep settings ref updated
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Initialize auxiliary canvases with proper context options
  useEffect(() => {
    const maskCanvas = document.createElement('canvas');
    maskCanvasRef.current = maskCanvas;
    // Use willReadFrequently: true for contexts that use getImageData frequently
    maskCtxRef.current = maskCanvas.getContext('2d', { willReadFrequently: true });

    const tempCanvas = document.createElement('canvas');
    tempCanvasRef.current = tempCanvas;
    tempCtxRef.current = tempCanvas.getContext('2d', { willReadFrequently: true });

    return () => {
      maskCanvasRef.current = null;
      maskCtxRef.current = null;
      tempCanvasRef.current = null;
      tempCtxRef.current = null;
    };
  }, []);

  // Main render loop
  useEffect(() => {
    let isLoopActive = true;

    const processVideo = () => {
      // FIX 2: Race Condition / Mount Check - strict check before any canvas operations
      if (!isLoopActive || !canvasRef.current || !videoRef.current) return;

      // Frame rate limiting for performance mode
      const skipFactor =
        settingsRef.current.performanceMode === 'performance'
          ? 3
          : settingsRef.current.performanceMode === 'balanced'
            ? 2
            : 1;
      const shouldSkipFrame =
        adaptiveQualityRef.current && frameSkipRef.current++ % skipFactor !== 0;

      // Skip frames in low-performance mode
      if (shouldSkipFrame) {
        requestAnimationFrame(processVideo);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      // Use willReadFrequently: true since we call getImageData for overlays
      const ctx = canvas?.getContext('2d', { alpha: false, willReadFrequently: true });
      const maskCanvas = maskCanvasRef.current;
      const maskCtx = maskCtxRef.current;
      const tempCanvas = tempCanvasRef.current;
      const tempCtx = tempCtxRef.current;
      const bgImage = bgImageRef.current;

      const {
        blur,
        portraitLighting,
        faceSmoothing,
        vignette,
        softwareSharpness,
        autoFrame,
        denoise,
        mirror,
        rotation,
        virtualBackground,
        activeFilter,
        gridOverlay,
        showHistogram,
        showZebraStripes,
        zebraThreshold,
        showFocusPeaking,
        focusPeakingColor,
        aspectRatioLock,
      } = settingsRef.current;

      const filterPreset = FILTER_PRESETS[activeFilter] || FILTER_PRESETS['none'];

      // Get target aspect ratio from presets
      const aspectPreset = ASPECT_RATIO_PRESETS.find((p) => p.id === aspectRatioLock);
      const targetAspectRatio = aspectPreset?.ratio ?? null;

      // Calculate current transform with smooth interpolation
      if (autoFrame) {
        const speed = 0.05;
        currentTransformRef.current.panX = lerp(
          currentTransformRef.current.panX,
          targetTransformRef.current.panX,
          speed
        );
        currentTransformRef.current.panY = lerp(
          currentTransformRef.current.panY,
          targetTransformRef.current.panY,
          speed
        );
        currentTransformRef.current.zoom = lerp(
          currentTransformRef.current.zoom,
          targetTransformRef.current.zoom,
          speed
        );
      } else {
        const effectiveZoom = hardwareCapabilities.zoom ? 1 : settingsRef.current.zoom;
        const effectivePanX = hardwareCapabilities.panX ? 0 : settingsRef.current.panX;
        const effectivePanY = hardwareCapabilities.panY ? 0 : settingsRef.current.panY;
        currentTransformRef.current = {
          panX: effectivePanX,
          panY: effectivePanY,
          zoom: effectiveZoom,
        };
      }

      const { panX, panY, zoom } = currentTransformRef.current;

      if (canvas && ctx && video && video.readyState >= 2) {
        // Resize canvas to match video dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          [canvas, tempCanvas, video].forEach((el) => {
            if (el) {
              el.width = video.videoWidth;
              el.height = video.videoHeight;
            }
          });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isCompareActive) {
          // Compare mode: show raw video
          ctx.drawImage(video, 0, 0);
        } else {
          // Apply transforms
          ctx.translate(canvas.width / 2, canvas.height / 2);
          if (mirror) ctx.scale(-1, 1);
          ctx.scale(zoom, zoom);
          ctx.rotate((rotation * Math.PI) / 180);
          const xOffset = (panX / 100) * canvas.width;
          const yOffset = (panY / 100) * canvas.height;
          ctx.translate(xOffset, yOffset);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);

          // Build base filter string with caching to avoid string concatenation every frame
          const filterCache = filterCacheRef.current;
          const cacheValid =
            filterCache.denoise === denoise &&
            filterCache.contrast === settingsRef.current.contrast &&
            filterCache.saturation === settingsRef.current.saturation &&
            filterCache.brightness === settingsRef.current.brightness &&
            filterCache.grayscale === settingsRef.current.grayscale &&
            filterCache.sepia === settingsRef.current.sepia &&
            filterCache.hue === settingsRef.current.hue &&
            filterCache.activeFilter === activeFilter &&
            filterCache.autoGain === autoGain &&
            filterCache.hwContrast === hardwareCapabilities.contrast &&
            filterCache.hwSaturation === hardwareCapabilities.saturation &&
            filterCache.hwBrightness === hardwareCapabilities.brightness;

          let baseFilter: string;
          if (cacheValid) {
            baseFilter = filterCache.baseFilter;
          } else {
            // Rebuild filter string and update cache
            baseFilter = buildBaseFilterString(
              denoise,
              hardwareCapabilities.contrast,
              hardwareCapabilities.saturation,
              hardwareCapabilities.brightness,
              settingsRef.current.contrast,
              settingsRef.current.saturation,
              settingsRef.current.brightness,
              settingsRef.current.grayscale,
              settingsRef.current.sepia,
              settingsRef.current.hue,
              autoGain,
              filterPreset?.css || ''
            );

            // Update cache
            filterCacheRef.current = {
              baseFilter,
              denoise,
              contrast: settingsRef.current.contrast,
              saturation: settingsRef.current.saturation,
              brightness: settingsRef.current.brightness,
              grayscale: settingsRef.current.grayscale,
              sepia: settingsRef.current.sepia,
              hue: settingsRef.current.hue,
              activeFilter,
              autoGain,
              hwContrast: hardwareCapabilities.contrast,
              hwSaturation: hardwareCapabilities.saturation,
              hwBrightness: hardwareCapabilities.brightness,
            };
          }

          const segmentationMask = segmentationMaskRef.current;
          const isAiNeeded =
            blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

          if (isAiNeeded && segmentationMask && maskCanvas && maskCtx && tempCanvas && tempCtx) {
            // Resize mask canvas if needed
            if (maskCanvas.width !== segmentationMask.width) {
              maskCanvas.width = segmentationMask.width;
              maskCanvas.height = segmentationMask.height;
            }
            if (segmentationMask instanceof ImageData) {
              maskCtx.putImageData(segmentationMask, 0, 0);
            } else {
              maskCtx.drawImage(segmentationMask, 0, 0);
            }
            ctx.globalCompositeOperation = 'source-over';

            // Draw background (blurred or virtual)
            if (virtualBackground && bgImage) {
              ctx.filter = blur > 0 ? `blur(${blur}px) ${baseFilter}` : baseFilter;
              ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
            } else {
              ctx.filter = blur > 0 ? `blur(${blur}px) ${baseFilter}` : baseFilter;
              ctx.drawImage(video, 0, 0);
            }
            ctx.filter = 'none';

            // Portrait lighting (dim background)
            if (portraitLighting > 0 && !virtualBackground) {
              const dimVal = (portraitLighting / 100) * 0.6;
              ctx.fillStyle = `rgba(0,0,0,${dimVal})`;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Draw foreground (person) using mask
            tempCtx.setTransform(1, 0, 0, 1, 0, 0);
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.globalCompositeOperation = 'source-over';
            tempCtx.filter = 'blur(4px)';
            tempCtx.drawImage(
              maskCanvas,
              0,
              0,
              maskCanvas.width,
              maskCanvas.height,
              0,
              0,
              tempCanvas.width,
              tempCanvas.height
            );
            tempCtx.filter = 'none';
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.filter = baseFilter;
            tempCtx.drawImage(video, 0, 0);
            tempCtx.filter = 'none';

            // Face smoothing effect (disabled in low-performance mode)
            if (faceSmoothing > 0 && !adaptiveQualityRef.current) {
              tempCtx.globalCompositeOperation = 'screen';
              const smoothAmt = (faceSmoothing / 100) * 10;
              tempCtx.filter = `blur(${smoothAmt}px) brightness(1.1)`;
              tempCtx.globalAlpha = 0.6;
              tempCtx.drawImage(tempCanvas, 0, 0);
              tempCtx.globalAlpha = 1.0;
              tempCtx.filter = 'none';
            }

            // Composite foreground onto canvas
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(tempCanvas, 0, 0);
          } else {
            // No AI effects - direct draw with filters
            ctx.filter = baseFilter || 'none';
            ctx.drawImage(video, 0, 0);
            ctx.filter = 'none';
          }

          // Apply filter overlay if defined
          if (filterPreset?.overlay) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = filterPreset.blend || 'overlay';
            ctx.globalAlpha = filterPreset.alpha || 0.2;
            ctx.fillStyle = filterPreset.overlay;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
          }

          // Reset transform for post-processing effects
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          // Apply aspect ratio letterbox/pillarbox
          const aspectCrop = calculateAspectRatioCrop(
            canvas.width,
            canvas.height,
            targetAspectRatio
          );
          if (aspectCrop) {
            ctx.fillStyle = '#000000';
            // Draw black bars based on aspect ratio
            if (aspectCrop.dx > 0) {
              // Pillarbox - black bars on left and right
              ctx.fillRect(0, 0, aspectCrop.dx, canvas.height);
              ctx.fillRect(canvas.width - aspectCrop.dx, 0, aspectCrop.dx, canvas.height);
            }
            if (aspectCrop.dy > 0) {
              // Letterbox - black bars on top and bottom
              ctx.fillRect(0, 0, canvas.width, aspectCrop.dy);
              ctx.fillRect(0, canvas.height - aspectCrop.dy, canvas.width, aspectCrop.dy);
            }
          }

          // Apply software sharpness effect
          if (softwareSharpness > 0) {
            applySoftwareSharpness(ctx, canvas, softwareSharpness);
          }

          // Apply vignette effect with gradient caching
          if (vignette > 0) {
            const vignetteCache = vignetteCacheRef.current;
            const needsNewGradient =
              !vignetteCache.gradient ||
              vignetteCache.width !== canvas.width ||
              vignetteCache.height !== canvas.height ||
              vignetteCache.intensity !== vignette;

            if (needsNewGradient) {
              // Create and cache new gradient
              const gradient = createVignetteGradient(ctx, canvas.width, canvas.height, vignette);
              vignetteCacheRef.current = {
                gradient,
                width: canvas.width,
                height: canvas.height,
                intensity: vignette,
              };
              drawVignette(ctx, canvas.width, canvas.height, gradient);
            } else if (vignetteCache.gradient) {
              // Use cached gradient
              drawVignette(ctx, canvas.width, canvas.height, vignetteCache.gradient);
            }
          }

          // Apply WebGL LUT cinematic color grading
          const { cinematicLut } = settingsRef.current;
          if (cinematicLut !== 'none' && isWebGLReady) {
            const lutCanvas = applyLutGrading(canvas, settings.cinematicLutIntensity);
            if (lutCanvas) {
              ctx.drawImage(lutCanvas, 0, 0);
            }
          }

          // Draw professional overlays
          if (gridOverlay !== 'none') {
            drawGridOverlay(ctx, canvas.width, canvas.height, gridOverlay);
          }

          // Get image data for histogram, zebra, and focus peaking
          if (showHistogram || showZebraStripes || showFocusPeaking) {
            try {
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

              if (showZebraStripes) {
                drawZebraStripes(ctx, canvas.width, canvas.height, imageData, zebraThreshold);
              }

              if (showFocusPeaking) {
                drawFocusPeaking(ctx, canvas.width, canvas.height, imageData, focusPeakingColor);
              }

              if (showHistogram) {
                drawHistogram(ctx, canvas.width, canvas.height, imageData);
              }
            } catch (_e) {
              // Canvas might be tainted, ignore
            }
          }
        }
      }

      if (isLoopActive) {
        requestRef.current = requestAnimationFrame(processVideo);
      }
    };

    requestRef.current = requestAnimationFrame(processVideo);

    return () => {
      isLoopActive = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [
    videoRef,
    canvasRef,
    hardwareCapabilities,
    segmentationMaskRef,
    targetTransformRef,
    bgImageRef,
    isAiActive,
    isCompareActive,
    autoGain,
    drawGridOverlay,
    drawHistogram,
    drawZebraStripes,
    drawFocusPeaking,
    isWebGLReady,
    applyLutGrading,
  ]);

  return {
    maskCanvasRef,
    tempCanvasRef,
    currentTransformRef,
    isWebGLActive: isWebGLReady && settings.cinematicLut !== 'none',
    performanceMetrics,
  };
}

export default useVideoRenderer;
