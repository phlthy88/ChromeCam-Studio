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
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const softwareFallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentLutRef = useRef<string>('');
  const lutIntensityRef = useRef(lutIntensity);

  // Context loss event handler refs (stored so we can remove them on cleanup)
  const contextLostHandlerRef = useRef<((e: Event) => void) | null>(null);
  const contextRestoredHandlerRef = useRef<((e: Event) => void) | null>(null);

  const [isWebGLSupported, setIsWebGLSupported] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentLutName, setCurrentLutName] = useState('None');

  // Update lutIntensity ref when prop changes
  useEffect(() => {
    lutIntensityRef.current = lutIntensity;
  }, [lutIntensity]);

  // ========================================================================
  // WEBGL INITIALIZATION WITH CONTEXT LOSS HANDLING
  // ========================================================================
  useEffect(() => {
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
      // Check WebGL support
      const supported = WebGLLutRenderer.isSupported();
      setIsWebGLSupported(supported);

      if (!supported) {
        console.warn('[useWebGLRenderer] WebGL not supported, LUT grading will be disabled');
        return;
      }

      // Create canvas for LUT renderer
      if (!webglCanvasRef.current) {
        webglCanvasRef.current = document.createElement('canvas');
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
        setIsReady(false);

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
      const MAX_RETRIES = 3;

      const tryCreateContext = () => {
        try {
          if (!webglCanvasRef.current) return;

          // Initialize face warp renderer when beauty effects are enabled
          if (hasBeautySettings && !faceWarpRendererRef.current) {
            const faceWarpRenderer = new WebGLFaceWarpRenderer();
            const initialized = faceWarpRenderer.initialize(webglCanvasRef.current);
            if (initialized) {
              faceWarpRendererRef.current = faceWarpRenderer;
            }
          }

          // Initialize LUT renderer
          const renderer = new WebGLLutRenderer();
          const initialized = renderer.initialize(webglCanvasRef.current);

          if (initialized) {
            rendererRef.current = renderer;
            setIsReady(true);
          } else {
            throw new Error('WebGL initialization failed');
          }
        } catch (error) {
          console.error('[useWebGLRenderer] Context creation failed:', error);

          if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.warn(
              `[useWebGLRenderer] Retrying context creation (${retryCount}/${MAX_RETRIES})...`
            );
            setTimeout(tryCreateContext, 1000 * retryCount); // Exponential backoff
          } else {
            console.error('[useWebGLRenderer] Failed to initialize WebGL after retries');
            setIsWebGLSupported(false);
          }
        }
      };

      tryCreateContext();
    }, 500); // Wait 500ms for main thread to stabilize

    return () => {
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
      faceWarpRendererRef.current.updateLandmarks(faceLandmarks);
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

  // Apply LUT grading to source
  const applyLutGrading = useCallback(
    (
      source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
      lutIntensity?: number
    ): HTMLCanvasElement | null => {
      // Step 1: Apply face warping if beauty settings are enabled
      let processedSource: HTMLVideoElement | HTMLCanvasElement | ImageBitmap = source;

      if (hasBeautySettings && faceWarpRendererRef.current && beautySettings && faceLandmarks) {
        try {
          // Apply face warp rendering
          faceWarpRendererRef.current.render(source, beautySettings);
          // Use the warped canvas as the source for LUT processing
          if (faceWarpRendererRef.current.canvas) {
            processedSource = faceWarpRendererRef.current.canvas;
          }
        } catch (error) {
          console.warn('[useWebGLRenderer] Face warp rendering failed:', error);
          // Continue with original source if face warp fails
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
          console.warn('[useWebGLRenderer] WebGL render failed, falling back to software:', error);
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
    [enabled, isReady, lutPreset, hasBeautySettings, beautySettings, faceLandmarks]
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
