/**
 * useWebGLRenderer - GPU-accelerated video rendering with LUT support
 *
 * This hook manages WebGL-based color grading using 3D LUTs.
 * It provides hardware-accelerated video processing for cinematic color effects.
 *
 * Features:
 * - WebGL 3D LUT color grading
 * - Automatic fallback to canvas when WebGL unavailable
 * - Cached LUT textures for performance
 * - Smooth intensity transitions
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { WebGLLutRenderer, WebGLFaceWarpRenderer, applyLutSoftware } from '../utils/webglLut';
import { getCinematicLut } from '../data/cinematicLuts';
import { FaceLandmarks } from '../types/face';
import { logger } from '../utils/logger';
import {
  WEBGL_STABILIZATION_DELAY_MS,
  WEBGL_CONTEXT_RETRY_DELAY_MS,
  WEBGL_MAX_RETRIES,
} from '../constants/webgl';

export interface UseWebGLRendererOptions {
  /** Whether WebGL rendering is enabled */
  enabled: boolean;
  /** ID of the cinematic LUT preset to use */
  lutPreset: string;
  /** LUT intensity (0-100) */
  lutIntensity: number;
  /** Face landmarks for beauty filters */
  faceLandmarks?: FaceLandmarks | null;
  /** Beauty filter settings */
  beautySettings?: {
    eyeEnlargement: number;
    noseSlimming: number;
    jawSlimming: number;
    mouthScaling: number;
  };
}

export interface UseWebGLRendererReturn {
  /** Whether WebGL is supported and initialized */
  isWebGLSupported: boolean;
  /** Whether the renderer is ready */
  isReady: boolean;
  /** The WebGL canvas element */
  webglCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Apply LUT grading to a video frame and return the result */
  applyLutGrading: (
    source: HTMLVideoElement | HTMLCanvasElement,
    lutIntensity?: number
  ) => HTMLCanvasElement | null;
  /** Get the current LUT name */
  currentLutName: string;
}

/**
 * Simple blur effect for skin smoothing
 */
const applySimpleBlur = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
) => {
  const tempData = new Uint8ClampedArray(data);
  const radiusInt = Math.floor(radius);

  for (let y = radiusInt; y < height - radiusInt; y++) {
    for (let x = radiusInt; x < width - radiusInt; x++) {
      let r = 0,
        g = 0,
        b = 0,
        count = 0;

      // Simple box blur
      for (let dy = -radiusInt; dy <= radiusInt; dy++) {
        for (let dx = -radiusInt; dx <= radiusInt; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            r += tempData[idx] || 0;
            g += tempData[idx + 1] || 0;
            b += tempData[idx + 2] || 0;
            count++;
          }
        }
      }

      const idx = (y * width + x) * 4;
      data[idx] = r / count;
      data[idx + 1] = g / count;
      data[idx + 2] = b / count;
    }
  }
};

/**
 * Simple brightness and contrast adjustment
 */
const applyBrightnessContrast = (
  data: Uint8ClampedArray,
  brightness: number,
  contrast: number
) => {
  const factor = (259 * (contrast * 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] || 0;
    const g = data[i + 1] || 0;
    const b = data[i + 2] || 0;

    data[i] = Math.max(0, Math.min(255, factor * (r - 128) + 128 + brightness * 255));
    data[i + 1] = Math.max(0, Math.min(255, factor * (g - 128) + 128 + brightness * 255));
    data[i + 2] = Math.max(0, Math.min(255, factor * (b - 128) + 128 + brightness * 255));
  }
};

/**
 * Hook for WebGL-based LUT color grading
 */
export function useWebGLRenderer({
  enabled,
  lutPreset,
  lutIntensity,
  faceLandmarks,
  beautySettings,
}: UseWebGLRendererOptions): UseWebGLRendererReturn {
  // Enable beauty effects when landmarks are available
  const hasBeautySettings =
    beautySettings &&
    (beautySettings.eyeEnlargement > 0 ||
      beautySettings.noseSlimming > 0 ||
      beautySettings.jawSlimming > 0 ||
      beautySettings.mouthScaling > 0);

  const rendererRef = useRef<WebGLLutRenderer | null>(null);
  const faceWarpRendererRef = useRef<WebGLFaceWarpRenderer | null>(null);
  const lastSettingsKeyRef = useRef<string>('');

  const [isWebGLSupported, setIsWebGLSupported] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentLutName, setCurrentLutName] = useState('None');

  // Debug beauty settings detection (only when settings change)
  const settingsKey = JSON.stringify({
    hasBeautySettings,
    beautySettings,
    isWebGLSupported,
  });

  if (settingsKey !== lastSettingsKeyRef.current) {
    logger.debug('Beauty settings check:', {
      hasBeautySettings,
      beautySettings: beautySettings
        ? {
            eyeEnlargement: beautySettings.eyeEnlargement,
            noseSlimming: beautySettings.noseSlimming,
            jawSlimming: beautySettings.jawSlimming,
            mouthScaling: beautySettings.mouthScaling,
          }
        : null,
      hasFaceLandmarks: !!faceLandmarks,
      faceLandmarksCount: faceLandmarks?.length || 0,
      isWebGLSupported,
      hasFaceWarpRenderer: !!faceWarpRendererRef.current,
    });

    // Warn if beauty effects requested but WebGL not available
    if (hasBeautySettings && !isWebGLSupported) {
      logger.warn(
        'useWebGLRenderer',
        'Beauty effects requested but WebGL not available - using Canvas 2D enhancement fallback'
      );
    }

    lastSettingsKeyRef.current = settingsKey;
  }

  // Warn if beauty effects requested but WebGL not available
  if (hasBeautySettings && !isWebGLSupported) {
    logger.warn(
      'useWebGLRenderer',
      'Beauty effects requested but WebGL not available - using Canvas 2D enhancement fallback'
    );
  }
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const softwareFallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentLutRef = useRef<string>('');
  const lutIntensityRef = useRef(lutIntensity);

  // Context loss event handler refs (stored so we can remove them on cleanup)
  const contextLostHandlerRef = useRef<((e: Event) => void) | null>(null);
  const contextRestoredHandlerRef = useRef<((e: Event) => void) | null>(null);

  // Update lutIntensity ref when prop changes
  useEffect(() => {
    lutIntensityRef.current = lutIntensity;
  }, [lutIntensity]);

  // ========================================================================
  // WEBGL INITIALIZATION WITH CONTEXT LOSS HANDLING
  // ========================================================================
  useEffect(() => {
    let isMounted = true;

    if (!enabled) {
      // Clean up if disabled
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      if (faceWarpRendererRef.current) {
        faceWarpRendererRef.current.dispose();
        faceWarpRendererRef.current = null;
      }
      setIsReady(false);
      return;
    }

    // =======================================================================
    // FIX: Clean up old context loss handlers before creating new ones
    // =======================================================================
    const cleanupContextHandlers = () => {
      if (webglCanvasRef.current) {
        if (contextLostHandlerRef.current) {
          webglCanvasRef.current.removeEventListener(
            'webglcontextlost',
            contextLostHandlerRef.current
          );
        }
        if (contextRestoredHandlerRef.current) {
          webglCanvasRef.current.removeEventListener(
            'webglcontextrestored',
            contextRestoredHandlerRef.current
          );
        }
      }
    };
    cleanupContextHandlers();

    // CRITICAL FIX: Delay WebGL initialization to allow main thread to stabilize
    const initDelay = setTimeout(() => {
      if (!isMounted) return;

      // Check WebGL support
      const supported = WebGLLutRenderer.isSupported();
      if (isMounted) {
        setIsWebGLSupported(supported);
      }

      if (!supported) {
        console.warn('[useWebGLRenderer] WebGL not supported, LUT grading will be disabled');
        return;
      }

      // Create canvas for LUT renderer with validation
      if (!webglCanvasRef.current) {
        const canvas = document.createElement('canvas');
        if (!canvas) {
          console.error('[useWebGLRenderer] Failed to create canvas element');
          return;
        }
        webglCanvasRef.current = canvas;
        // CRITICAL FIX: Set canvas size immediately to prevent context loss
        webglCanvasRef.current.width = 1920;
        webglCanvasRef.current.height = 1080;
      }

      // =====================================================================
      // FIX: ADD CONTEXT LOSS/RESTORE HANDLERS
      //
      // WebGL contexts can be lost when:
      // - User switches tabs (GPU reclaims resources)
      // - System goes to sleep
      // - GPU driver crashes/restarts
      // - Too many WebGL contexts are created
      //
      // Without these handlers, context loss causes silent black screens.
      // =====================================================================
      contextLostHandlerRef.current = (e: Event) => {
        e.preventDefault(); // CRITICAL: Allows context to be restored
        console.warn('[useWebGLRenderer] WebGL context lost - disposing renderers');
        if (isMounted) {
          setIsReady(false);
        }

        // Dispose renderers - they hold stale GL references that will crash
        if (rendererRef.current) {
          try {
            rendererRef.current.dispose();
          } catch (disposeError) {
            console.warn('[useWebGLRenderer] Error disposing LUT renderer:', disposeError);
          }
          rendererRef.current = null;
        }
        if (faceWarpRendererRef.current) {
          try {
            faceWarpRendererRef.current.dispose();
          } catch (disposeError) {
            console.warn('[useWebGLRenderer] Error disposing face warp renderer:', disposeError);
          }
          faceWarpRendererRef.current = null;
        }
      };

      contextRestoredHandlerRef.current = () => {
        console.warn(
          '[useWebGLRenderer] WebGL context restored - will reinitialize on next render'
        );
        // The effect will re-run and reinitialize when dependencies change,
        // or you can force re-init here if needed
      };

      webglCanvasRef.current.addEventListener('webglcontextlost', contextLostHandlerRef.current);
      webglCanvasRef.current.addEventListener(
        'webglcontextrestored',
        contextRestoredHandlerRef.current
      );

      // CRITICAL FIX: Try WebGL context creation with error recovery
      let retryCount = 0;

      const tryCreateContext = () => {
        try {
          if (!webglCanvasRef.current) {
            throw new Error('Canvas ref not available');
          }

          logger.info(
            'useWebGLRenderer',
            `[useWebGLRenderer] Initializing WebGL LUT renderer (attempt ${retryCount + 1}/${WEBGL_MAX_RETRIES + 1})...`
          );

          // Initialize LUT renderer first (this confirms WebGL works)
          const renderer = new WebGLLutRenderer();
          const initialized = renderer.initialize(webglCanvasRef.current);

          if (!initialized) {
            throw new Error(
              'WebGLLutRenderer.initialize() returned false - WebGL context creation or shader compilation failed'
            );
          }

          if (!isMounted) {
            logger.warn('useWebGLRenderer', 'Component unmounted during WebGL initialization');
            renderer.dispose();
            return;
          }

          rendererRef.current = renderer;
          setIsReady(true);
          logger.info('useWebGLRenderer', '✅ WebGL LUT renderer initialized successfully');

          // Only initialize face warp renderer AFTER WebGL is confirmed to work
          if (enabled && !faceWarpRendererRef.current) {
            logger.info('useWebGLRenderer', '[useWebGLRenderer] 🚀 Initializing face warp renderer...');
            try {
              const faceWarpRenderer = new WebGLFaceWarpRenderer();
              const warpInitialized = faceWarpRenderer.initialize(webglCanvasRef.current);
              if (warpInitialized) {
                logger.info(
                  'useWebGLRenderer',
                  '[useWebGLRenderer] ✅ Face warp renderer initialized successfully'
                );
                faceWarpRendererRef.current = faceWarpRenderer;
              } else {
                console.warn(
                  '[useWebGLRenderer] ❌ Failed to initialize face warp renderer - will fall back to Canvas 2D'
                );
              }
            } catch (warpError) {
              console.warn(
                '[useWebGLRenderer] Face warp renderer initialization error:',
                warpError,
                '- will fall back to Canvas 2D'
              );
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[useWebGLRenderer] WebGL context creation failed:', errorMessage);

          // Log additional diagnostic information
          if (error instanceof Error && error.stack) {
            logger.debug('useWebGLRenderer', 'Error stack:', error.stack);
          }

          if (retryCount < WEBGL_MAX_RETRIES) {
            retryCount++;
            const nextDelay = WEBGL_CONTEXT_RETRY_DELAY_MS * retryCount; // Exponential backoff
            console.warn(
              `[useWebGLRenderer] Retrying context creation in ${nextDelay}ms (${retryCount}/${WEBGL_MAX_RETRIES})...`
            );
            setTimeout(tryCreateContext, nextDelay);
          } else {
            console.error(
              `[useWebGLRenderer] Failed to initialize WebGL after ${WEBGL_MAX_RETRIES} retries. Last error: ${errorMessage}`
            );
            if (isMounted) {
              setIsWebGLSupported(false);
            }
          }
        }
      };

      tryCreateContext();
    }, WEBGL_STABILIZATION_DELAY_MS);

    return () => {
      isMounted = false;
      clearTimeout(initDelay);

      // Clean up context loss handlers
      cleanupContextHandlers();

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      if (faceWarpRendererRef.current) {
        faceWarpRendererRef.current.dispose();
        faceWarpRendererRef.current = null;
      }
      setIsReady(false);
    };
  }, [enabled, hasBeautySettings]);
  // ========================================================================

  // Update face landmarks when they change
  useEffect(() => {
    if (faceWarpRendererRef.current && faceLandmarks) {
      logger.debug('useWebGLRenderer', `Updating landmarks: ${faceLandmarks.length} points`);
      faceWarpRendererRef.current.updateLandmarks(faceLandmarks);
    } else if (faceLandmarks) {
      console.warn('[useWebGLRenderer] Face landmarks received but no faceWarpRenderer');
    }
  }, [faceLandmarks]);

  // Load LUT when preset changes
  useEffect(() => {
    if (!isReady || !rendererRef.current) return;

    // Skip if LUT hasn't changed
    if (currentLutRef.current === lutPreset) return;
    currentLutRef.current = lutPreset;

    if (lutPreset === 'none') {
      setCurrentLutName('None');
      return;
    }

    // Load the LUT
    const lutData = getCinematicLut(lutPreset);
    if (lutData) {
      rendererRef.current.loadLut(lutData);
      setCurrentLutName(lutData.name);
    } else {
      setCurrentLutName('None');
    }
  }, [isReady, lutPreset]);

  const applyCanvas2DBeautyFilters = useCallback(
    (
      source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      beautySettings: UseWebGLRendererOptions['beautySettings'],
      faceLandmarks: FaceLandmarks
    ): HTMLVideoElement | HTMLCanvasElement | ImageBitmap => {
      if (!beautySettings || !faceLandmarks || faceLandmarks.length < 68) {
        return source;
      }

      // Create a temporary canvas for beauty effects
      if (!softwareFallbackCanvasRef.current) {
        softwareFallbackCanvasRef.current = document.createElement('canvas');
      }
      const canvas = softwareFallbackCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return source;

      // Set canvas size to match source
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
      canvas.width = width;
      canvas.height = height;

      // Draw the source
      ctx.drawImage(source, 0, 0);

      // Apply simple beauty effects using Canvas2D
      try {
        // Get image data
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Simple skin smoothing effect
        if (beautySettings.eyeEnlargement > 0 || beautySettings.noseSlimming > 0) {
          // Apply a subtle blur to smooth skin
          const blurRadius = Math.min(
            2,
            (beautySettings.eyeEnlargement + beautySettings.noseSlimming) / 50
          );
          if (blurRadius > 0) {
            applySimpleBlur(data, width, height, blurRadius);
          }
        }

        // Simple brightness/contrast adjustment for "beauty" effect
        const brightness = (beautySettings.jawSlimming + beautySettings.mouthScaling) * 0.5;
        if (brightness > 0) {
          applyBrightnessContrast(data, brightness * 0.01, 1.05);
        }

        // Put the modified image data back
        ctx.putImageData(imageData, 0, 0);

        logger.info('useWebGLRenderer', '[useWebGLRenderer] Canvas2D beauty filters applied');
        return canvas;
      } catch (error) {
        console.warn('[useWebGLRenderer] Canvas2D beauty filters failed:', error);
        return source;
      }
    },
    []
  );

  // Apply LUT grading to source
  const applyLutGrading = useCallback(
    (
      source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      lutIntensity?: number
    ): HTMLCanvasElement | null => {
      // Step 1: Apply face warping if beauty settings are enabled
      let processedSource: HTMLVideoElement | HTMLCanvasElement | ImageBitmap = source;

      if (hasBeautySettings && beautySettings && faceLandmarks) {
        logger.info(
          '[useWebGLRenderer] Applying beauty filters with',
          faceLandmarks.length,
          'landmarks'
        );

        // Try WebGL2 beauty effects first
        if (faceWarpRendererRef.current && faceLandmarks.length >= 478) {
          try {
            faceWarpRendererRef.current.render(source, beautySettings);
            if (faceWarpRendererRef.current.canvas) {
              processedSource = faceWarpRendererRef.current.canvas;
              logger.info('useWebGLRenderer', '[useWebGLRenderer] WebGL2 beauty filters applied successfully');
            }
          } catch (error) {
            console.warn('[useWebGLRenderer] WebGL2 beauty rendering failed:', error);
          }
        }

        // Always apply Canvas2D fallback if WebGL failed or insufficient landmarks
        if (processedSource === source) {
          logger.info('useWebGLRenderer', '[useWebGLRenderer] Applying Canvas2D beauty fallback');
          processedSource = applyCanvas2DBeautyFilters(source, beautySettings, faceLandmarks);
        }
      }

      // Step 2: Apply LUT grading if enabled
      if (!enabled || lutPreset === 'none') {
        // If only beauty filters are enabled (no LUT), return the warped canvas
        if (processedSource !== source && processedSource instanceof HTMLCanvasElement) {
          return processedSource;
        }
        return null;
      }

      const lutData = getCinematicLut(lutPreset);
      if (!lutData) {
        // If LUT data is missing but we have a warped canvas, return it
        if (processedSource !== source && processedSource instanceof HTMLCanvasElement) {
          return processedSource;
        }
        return null;
      }

      // Use provided intensity or ref value (for stable function signature)
      const intensity = lutIntensity ?? lutIntensityRef.current;
      // Normalize intensity from 0-100 to 0-1
      const normalizedIntensity = Math.max(0, Math.min(1, intensity / 100));

      // Try WebGL first
      if (isReady && rendererRef.current && webglCanvasRef.current) {
        try {
          // Apply LUT to the (potentially warped) source
          rendererRef.current.render(processedSource, normalizedIntensity);
          return webglCanvasRef.current;
        } catch (error) {
          console.warn(
            '[useWebGLRenderer] WebGL rendering failed, falling back to software:',
            error
          );
          // Continue to software fallback
        }
      }

      // Software fallback - reuse canvas to avoid per-frame allocation
      if (!softwareFallbackCanvasRef.current) {
        softwareFallbackCanvasRef.current = document.createElement('canvas');
      }
      const canvas = softwareFallbackCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

      // Resize canvas only if dimensions changed
      if (canvas.width !== sourceWidth || canvas.height !== sourceHeight) {
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
      }

      ctx.drawImage(source, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const processedData = applyLutSoftware(imageData, lutData);

        // Apply intensity blending
        for (let i = 0; i < processedData.data.length; i += 4) {
          const originalR = (imageData.data[i] ?? 0) / 255;
          const originalG = (imageData.data[i + 1] ?? 0) / 255;
          const originalB = (imageData.data[i + 2] ?? 0) / 255;

          const lutR = (processedData.data[i] ?? 0) / 255;
          const lutG = (processedData.data[i + 1] ?? 0) / 255;
          const lutB = (processedData.data[i + 2] ?? 0) / 255;

          const finalR = originalR * (1 - normalizedIntensity) + lutR * normalizedIntensity;
          const finalG = originalG * (1 - normalizedIntensity) + lutG * normalizedIntensity;
          const finalB = originalB * (1 - normalizedIntensity) + lutB * normalizedIntensity;

          processedData.data[i] = Math.round(finalR * 255);
          processedData.data[i + 1] = Math.round(finalG * 255);
          processedData.data[i + 2] = Math.round(finalB * 255);
        }

        ctx.putImageData(processedData, 0, 0);
        return canvas;
      } catch (error) {
        console.error('[useWebGLRenderer] Software LUT processing failed:', error);
        return null;
      }
    },
    [
      enabled,
      isReady,
      lutPreset,
      hasBeautySettings,
      beautySettings,
      faceLandmarks,
      applyCanvas2DBeautyFilters,
    ]
  );

  return {
    isWebGLSupported,
    isReady,
    webglCanvasRef,
    applyLutGrading,
    currentLutName,
  };
}

export default useWebGLRenderer;
