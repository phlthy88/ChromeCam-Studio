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
import {
  WebGLLutRenderer,
  WebGLFaceWarpRenderer,
  applyLutSoftware,
} from '../utils/webglLut';
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
    source: HTMLVideoElement | HTMLCanvasElement
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
  const hasFaceLandmarks = faceLandmarks && faceLandmarks.length > 0;
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
  const [isWebGLSupported, setIsWebGLSupported] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentLutName, setCurrentLutName] = useState('None');

  // Initialize WebGL renderer
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

    // Initialize face warp renderer when beauty effects are enabled
    if (hasBeautySettings && !faceWarpRendererRef.current) {
      console.log('[useWebGLRenderer] Initializing face warp renderer for beauty effects');
      const faceWarpRenderer = new WebGLFaceWarpRenderer();
      const initialized = faceWarpRenderer.initialize(webglCanvasRef.current!);
      if (initialized) {
        faceWarpRendererRef.current = faceWarpRenderer;
        console.log('[useWebGLRenderer] Face warp renderer initialized successfully');
        setIsReady(true);
      } else {
        console.error('[useWebGLRenderer] Failed to initialize face warp renderer');
      }
    }

    // Check WebGL support
    const supported = WebGLLutRenderer.isSupported();
    setIsWebGLSupported(supported);
    if (!supported) {
      console.warn(
        '[useWebGLRenderer] WebGL not supported, LUT grading will be disabled'
      );
      return;
    }

    // Create canvas for LUT renderer
    if (!webglCanvasRef.current) {
      webglCanvasRef.current = document.createElement('canvas');
    }

    // Initialize LUT renderer
    const renderer = new WebGLLutRenderer();
    const initialized = renderer.initialize(webglCanvasRef.current);

    if (initialized) {
      rendererRef.current = renderer;
      setIsReady(true);
    } else {
      console.error('[useWebGLRenderer] Failed to initialize WebGL LUT renderer');
      setIsWebGLSupported(false);
    }

    // Note: Face warp renderer disabled for now - requires separate canvas and face detection
    // TODO: Re-enable when proper face landmark detection is implemented

    return () => {
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
  }, [enabled]);

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
      intensity: number
    ): HTMLCanvasElement | null => {
      if (!enabled || lutPreset === 'none') {
        return null;
      }

      const lutData = getCinematicLut(lutPreset);
      if (!lutData) {
        return null;
      }

      // Normalize intensity from 0-100 to 0-1
      const normalizedIntensity = Math.max(0, Math.min(1, lutIntensity / 100));

      // Try WebGL first
      if (isReady && rendererRef.current && webglCanvasRef.current) {
        try {
          // Apply LUT directly to source
          rendererRef.current.render(source, normalizedIntensity);
          return webglCanvasRef.current;
        } catch (error) {
          console.warn(
            '[useWebGLRenderer] WebGL render failed, falling back to software:',
            error
          );
        }
      }

      // Software fallback - reuse canvas to avoid per-frame allocation
      if (!softwareFallbackCanvasRef.current) {
        softwareFallbackCanvasRef.current = document.createElement('canvas');
      }
      const canvas = softwareFallbackCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const sourceWidth =
        source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const sourceHeight =
        source instanceof HTMLVideoElement ? source.videoHeight : source.height;

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

          const finalR =
            originalR * (1 - normalizedIntensity) + lutR * normalizedIntensity;
          const finalG =
            originalG * (1 - normalizedIntensity) + lutG * normalizedIntensity;
          const finalB =
            originalB * (1 - normalizedIntensity) + lutB * normalizedIntensity;

          processedData.data[i] = Math.round(finalR * 255);
          processedData.data[i + 1] = Math.round(finalG * 255);
          processedData.data[i + 2] = Math.round(finalB * 255);
        }

        ctx.putImageData(processedData, 0, 0);
        return canvas;
      } catch (error) {
        console.error(
          '[useWebGLRenderer] Software LUT processing failed:',
          error
        );
        return null;
      }
    },
    [
      enabled,
      isReady,
      lutPreset,
      lutIntensity,
      applyLutSoftware,
      hasFaceLandmarks,
      hasBeautySettings,
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
