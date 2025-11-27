import React, { useEffect, useRef, useMemo } from 'react';
import type { CameraSettings } from '../components/settings';
import { ASPECT_RATIO_PRESETS } from '../components/settings';
import type { HardwareCapabilities } from './useCameraStream';
import type { AutoFrameTransform } from './useBodySegmentation';

import { useProOverlays } from './useProOverlays';
import { useWebGLRenderer } from './useWebGLRenderer';
import { usePerformanceMonitor } from './usePerformanceMonitor';

import { FaceLandmarks } from '../types/face';
import { PERFORMANCE } from '../constants/performance';
import { logger } from '../utils/logger';

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
 * Create a vignette gradient (cached version)
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

  const opacity = (intensity / 100) * 0.8;

  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, `rgba(0, 0, 0, ${opacity * 0.3})`);
  gradient.addColorStop(0.8, `rgba(0, 0, 0, ${opacity * 0.6})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity})`);

  return gradient;
}

/**
 * Optimized vignette cache manager
 */
class VignetteCache {
  private gradients = new Map<string, CanvasGradient>();
  private lastWidth = 0;
  private lastHeight = 0;
  private lastIntensity = 0;

  getGradient(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number
  ): CanvasGradient {
    // Check if dimensions or intensity changed
    if (
      width !== this.lastWidth ||
      height !== this.lastHeight ||
      intensity !== this.lastIntensity
    ) {
      // Create cache key and store gradient
      const cacheKey = `${width}x${height}_${intensity}`;

      if (!this.gradients.has(cacheKey)) {
        const gradient = createVignetteGradient(ctx, width, height, intensity);
        this.gradients.set(cacheKey, gradient);

        // Limit cache size to prevent memory leaks
        if (this.gradients.size > 10) {
          const firstKey = this.gradients.keys().next().value;
          if (firstKey) {
            this.gradients.delete(firstKey);
          }
        }
      }

      this.lastWidth = width;
      this.lastHeight = height;
      this.lastIntensity = intensity;

      return this.gradients.get(cacheKey)!;
    }

    // Return cached gradient
    const cacheKey = `${width}x${height}_${intensity}`;
    return this.gradients.get(cacheKey)!;
  }

  clear(): void {
    this.gradients.clear();
  }
}

const vignetteCache = new VignetteCache();

/**
 * Draw a vignette effect on the canvas using cached gradient
 */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number
): void {
  if (intensity <= 0) return;

  const gradient = vignetteCache.getGradient(ctx, width, height, intensity);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Optimized filter string builder with memoization
 */
class FilterCache {
  private cache = new Map<string, string>();

  buildFilterString(settings: CameraSettings): string {
    // Create a simple cache key from relevant settings
    const key = `${settings.brightness}_${settings.contrast}_${settings.saturation}_${settings.hue}_${settings.sharpness}_${settings.grayscale}_${settings.sepia}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Build filter string only when settings change
    let filterString = '';

    // Only add filters that are different from default
    if (settings.brightness !== 100) filterString += `brightness(${settings.brightness}%) `;
    if (settings.contrast !== 100) filterString += `contrast(${settings.contrast}%) `;
    if (settings.saturation !== 100) filterString += `saturation(${settings.saturation}%) `;
    if (settings.hue !== 0) filterString += `hue-rotate(${settings.hue}deg) `;
    if (settings.sharpness !== 0) filterString += `blur(${settings.sharpness * 0.1}px) `;
    if (settings.grayscale !== 0) filterString += `grayscale(${settings.grayscale}%) `;
    if (settings.sepia !== 0) filterString += `sepia(${settings.sepia}%) `;

    this.cache.set(key, filterString);

    // Limit cache size
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    return filterString;
  }

  clear(): void {
    this.cache.clear();
  }
}

const filterCache = new FilterCache();

/**
 * Apply software sharpening using unsharp mask technique
 */
function applySoftwareSharpness(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number
): void {
  if (intensity <= 0) return;

  const contrastBoost = 1 + (intensity / 100) * 0.15;
  const blurRadius = 0.3 + (intensity / 100) * 0.4;

  ctx.save();

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
    return null;
  }

  const videoRatio = videoWidth / videoHeight;

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
    const targetWidth = videoHeight * targetRatio;
    sx = (videoWidth - targetWidth) / 2;
    sw = targetWidth;
    dw = targetWidth;
    dx = (videoWidth - targetWidth) / 2;
  } else {
    const targetHeight = videoWidth / targetRatio;
    sy = (videoHeight - targetHeight) / 2;
    sh = targetHeight;
    dh = targetHeight;
    dy = (videoHeight - targetHeight) / 2;
  }

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

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
  // Refs for auxiliary canvases and contexts
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const requestRef = useRef<number | null>(null);
  const currentTransformRef = useRef<AutoFrameTransform>({ panX: 0, panY: 0, zoom: 1 });
  const settingsRef = useRef(settings);

  // Memoize target aspect ratio to avoid repeated lookups
  const targetAspectRatio = useMemo(() => {
    const aspectPreset = ASPECT_RATIO_PRESETS.find((p) => p.id === settings.aspectRatioLock);
    return aspectPreset?.ratio ?? null;
  }, [settings.aspectRatioLock]);

  const vignetteCacheRef = useRef({
    gradient: null as CanvasGradient | null,
    width: 0,
    height: 0,
    intensity: 0,
  });

  // Updated STABILIZED LANDMARK REF
  const stableLandmarksRef = useRef<FaceLandmarks | null>(null);
  const landmarkUpdateCounterRef = useRef(0);

  useEffect(() => {
    if (faceLandmarks && faceLandmarks.length > 0) {
      // Simple heuristic: Update every 10 frames to reduce churn
      landmarkUpdateCounterRef.current++;

      if (landmarkUpdateCounterRef.current >= 10 || !stableLandmarksRef.current) {
        stableLandmarksRef.current = faceLandmarks;
        landmarkUpdateCounterRef.current = 0;
        logger.debug('useVideoRenderer', `Face landmarks updated: ${faceLandmarks.length} points`);
      }
    }
  }, [faceLandmarks]);

  const beautyEnabled =
    settings.eyeEnlargement > 0 ||
    settings.noseSlimming > 0 ||
    settings.jawSlimming > 0 ||
    settings.mouthScaling > 0;

  logger.debug('useVideoRenderer', 'Beauty settings updated', {
    eyeEnlargement: settings.eyeEnlargement,
    noseSlimming: settings.noseSlimming,
    jawSlimming: settings.jawSlimming,
    mouthScaling: settings.mouthScaling,
    beautyEnabled,
  });

  // FIX: lutIntensity in deps
  const webGLOptions = useMemo(
    () => ({
      enabled: settings.cinematicLut !== 'none' || beautyEnabled,
      lutPreset: settings.cinematicLut,
      lutIntensity: settings.cinematicLutIntensity,
      faceLandmarks: stableLandmarksRef.current,
      beautySettings: {
        eyeEnlargement: settings.eyeEnlargement,
        noseSlimming: settings.noseSlimming,
        jawSlimming: settings.jawSlimming,
        mouthScaling: settings.mouthScaling,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      settings.cinematicLut,
      settings.cinematicLutIntensity,
      beautyEnabled,
      settings.eyeEnlargement,
      stableLandmarksRef.current, // Include in deps to trigger re-render
      settings.noseSlimming,
      settings.jawSlimming,
      settings.mouthScaling,
    ]
  );

  logger.debug(
    'useVideoRenderer',
    `WebGL renderer called with ${webGLOptions.faceLandmarks?.length || 0} face landmarks`
  );
  logger.debug(
    'useVideoRenderer',
    `Video resolution: ${videoRef.current ? `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}` : 'unknown'}`
  );
  const { isReady: isWebGLReady, applyLutGrading } = useWebGLRenderer(webGLOptions);

  // Get professional overlay functions
  const { drawGridOverlay, drawHistogram, drawZebraStripes, drawFocusPeaking } = useProOverlays();

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
      frameSkipRef.current = (frameSkipRef.current + 1) % skipFactor;
      const shouldSkipFrame = adaptiveQualityRef.current && frameSkipRef.current !== 0;

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
      } = settingsRef.current;

      const filterPreset = FILTER_PRESETS[activeFilter] || FILTER_PRESETS['none'];

      // Calculate current transform with smooth interpolation (optimized)
      if (autoFrame) {
        const speed = PERFORMANCE.AUTO_FRAME_LERP_SPEED;

        // Calculate new transform values
        const newPanX = lerp(
          currentTransformRef.current.panX,
          targetTransformRef.current.panX,
          speed
        );
        const newPanY = lerp(
          currentTransformRef.current.panY,
          targetTransformRef.current.panY,
          speed
        );
        const newZoom = lerp(
          currentTransformRef.current.zoom,
          targetTransformRef.current.zoom,
          speed
        );

        // Only update if transform changed significantly
        const panXChanged =
          Math.abs(newPanX - currentTransformRef.current.panX) > PERFORMANCE.PAN_CHANGE_THRESHOLD;
        const panYChanged =
          Math.abs(newPanY - currentTransformRef.current.panY) > PERFORMANCE.PAN_CHANGE_THRESHOLD;
        const zoomChanged =
          Math.abs(newZoom - currentTransformRef.current.zoom) > PERFORMANCE.ZOOM_CHANGE_THRESHOLD;

        if (panXChanged || panYChanged || zoomChanged) {
          currentTransformRef.current.panX = newPanX;
          currentTransformRef.current.panY = newPanY;
          currentTransformRef.current.zoom = newZoom;
        }
      } else {
        // Manual transform (no interpolation needed)
        const effectiveZoom = hardwareCapabilities.zoom ? 1 : settingsRef.current.zoom;
        const effectivePanX = hardwareCapabilities.panX ? 0 : settingsRef.current.panX;
        const effectivePanY = hardwareCapabilities.panY ? 0 : settingsRef.current.panY;

        // Only update if values changed to avoid unnecessary object allocation
        if (
          currentTransformRef.current.panX !== effectivePanX ||
          currentTransformRef.current.panY !== effectivePanY ||
          currentTransformRef.current.zoom !== effectiveZoom
        ) {
          // Mutate existing object instead of creating new one
          currentTransformRef.current.panX = effectivePanX;
          currentTransformRef.current.panY = effectivePanY;
          currentTransformRef.current.zoom = effectiveZoom;
        }
      }

      const { panX, panY, zoom } = currentTransformRef.current;

      // Check if transforms are needed (skip identity transforms for performance)
      const needsTransform =
        mirror ||
        Math.abs(zoom - 1) > 0.01 ||
        Math.abs(rotation) > 0.1 ||
        Math.abs(panX) > 0.5 ||
        Math.abs(panY) > 0.5;

      if (canvas && ctx && video && video.readyState >= 2) {
        // Resize canvas to match video dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          // Direct iteration - no array allocation
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if (tempCanvas) {
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
          }
          // Note: video element doesn't need width/height set
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isCompareActive) {
          // Compare mode: show raw video
          ctx.drawImage(video, 0, 0);
        } else {
          // Apply transforms only if needed (skip identity transforms for performance)
          if (needsTransform) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            if (mirror) ctx.scale(-1, 1);
            if (Math.abs(zoom - 1) > 0.01) ctx.scale(zoom, zoom);
            if (Math.abs(rotation) > 0.1) ctx.rotate((rotation * Math.PI) / 180);
            if (Math.abs(panX) > 0.5 || Math.abs(panY) > 0.5) {
              const xOffset = (panX / 100) * canvas.width;
              const yOffset = (panY / 100) * canvas.height;
              ctx.translate(xOffset, yOffset);
            }
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
          }

          // Build base filter string with caching to avoid string concatenation every frame
          const baseFilter = filterCache.buildFilterString(settingsRef.current);
          const effectiveContrast = hardwareCapabilities.contrast
            ? 100
            : settingsRef.current.contrast;
          const effectiveBrightness = hardwareCapabilities.brightness
            ? 100
            : settingsRef.current.brightness;
          const effectiveSaturation = hardwareCapabilities.saturation
            ? 100
            : settingsRef.current.saturation;

          // Only add hardware adjustment to base filter if not using hardware controls
          let finalFilter = baseFilter;
          if (
            effectiveContrast !== 100 ||
            effectiveBrightness !== 100 ||
            effectiveSaturation !== 100
          ) {
            finalFilter += `contrast(${effectiveContrast}%) brightness(${effectiveBrightness}%) saturate(${effectiveSaturation}%)`;
          }

          // Apply auto gain if enabled
          if (autoGain > 0) {
            finalFilter += ` brightness(${100 + autoGain}%)`;
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
              ctx.filter = blur > 0 ? `blur(${blur}px) ${finalFilter}` : finalFilter;
              ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
            } else {
              ctx.filter = blur > 0 ? `blur(${blur}px) ${finalFilter}` : finalFilter;
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
            tempCtx.filter = finalFilter;
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
            ctx.filter = finalFilter || 'none';
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

              // Mutate existing cache object
              const cache = vignetteCacheRef.current;
              cache.gradient = gradient;
              cache.width = canvas.width;
              cache.height = canvas.height;
              cache.intensity = vignette;
              drawVignette(ctx, canvas.width, canvas.height, vignette);
            } else if (vignetteCache.gradient) {
              // Use cached gradient
              drawVignette(ctx, canvas.width, canvas.height, vignetteCache.intensity || vignette);
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
    settings,
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
