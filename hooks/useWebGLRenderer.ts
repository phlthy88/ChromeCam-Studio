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

export interface UseWebGLRendererOptions {
  /** Whether WebGL rendering is enabled */
  enabled: boolean;
  /** ID of the cinematic LUT preset to use */
  lutPreset: string;
  /** LUT intensity (0-100) */
  lutIntensity: number;
  /** Face landmarks for beauty filters */
  faceLandmarks?: any[] | null;
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
  applyLutGrading: (source: HTMLVideoElement | HTMLCanvasElement) => HTMLCanvasElement | null;
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
  const rendererRef = useRef<WebGLLutRenderer | null>(null);
  const faceWarpRendererRef = useRef<WebGLFaceWarpRenderer | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
      setIsReady(false);
      return;
    }

    // Check WebGL support
    const supported = WebGLLutRenderer.isSupported();
    setIsWebGLSupported(supported);
    console.log(`[useWebGLRenderer] WebGL supported: ${supported}`);

    if (!supported) {
      console.warn('[useWebGLRenderer] WebGL not supported, LUT grading will be disabled');
      return;
    }

    // Create canvas and renderer
    if (!webglCanvasRef.current) {
      webglCanvasRef.current = document.createElement('canvas');
    }

    const renderer = new WebGLLutRenderer();
    const faceWarpRenderer = new WebGLFaceWarpRenderer();
    console.log('[useWebGLRenderer] Initializing WebGL renderers...');
    const initialized = renderer.initialize(webglCanvasRef.current);
    console.log('[useWebGLRenderer] LUT renderer initialized:', initialized);
    const faceWarpInitialized = faceWarpRenderer.initialize(webglCanvasRef.current);
    console.log('[useWebGLRenderer] Face warp renderer initialized:', faceWarpInitialized);

    if (initialized && faceWarpInitialized) {
      rendererRef.current = renderer;
      faceWarpRendererRef.current = faceWarpRenderer;
      setIsReady(true);
      console.log('[useWebGLRenderer] WebGL renderers initialized successfully');
    } else {
      console.error(
        '[useWebGLRenderer] Failed to initialize WebGL renderers - LUT:',
        initialized,
        'FaceWarp:',
        faceWarpInitialized
      );
      setIsWebGLSupported(false);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
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
    console.log(`[useWebGLRenderer] Loading LUT preset: ${lutPreset}`);
    const lutData = getCinematicLut(lutPreset);
    if (lutData) {
      console.log(`[useWebGLRenderer] LUT data generated: ${lutData.name}`);
      rendererRef.current.loadLut(lutData);
      setCurrentLutName(lutData.name);
    } else {
      console.log(`[useWebGLRenderer] No LUT data for preset: ${lutPreset}`);
      setCurrentLutName('None');
    }
  }, [isReady, lutPreset]);

  // Apply LUT grading and beauty effects to source
  const applyLutGrading = useCallback(
    (source: HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement | null => {
      if (!enabled) {
        return null;
      }

      const lutData = getCinematicLut(lutPreset);
      if (!lutData) {
        console.warn('[useWebGLRenderer] No LUT data available');
        return null;
      }

      // Normalize intensity from 0-100 to 0-1
      const normalizedIntensity = lutIntensity / 100;

      // Try WebGL first
      if (isReady && rendererRef.current && webglCanvasRef.current) {
        try {
          console.log('[useWebGLRenderer] Applying effects with WebGL');

          // Apply face warping first if enabled
          if (faceWarpRendererRef.current && beautySettings && faceLandmarks) {
            console.log(
              '[useWebGLRenderer] Applying face warp with',
              faceLandmarks.length,
              'landmarks'
            );
            faceWarpRendererRef.current.updateLandmarks(faceLandmarks);
            faceWarpRendererRef.current.render(source, beautySettings);
          } else {
            console.log(
              '[useWebGLRenderer] Face warp not applied - renderer:',
              !!faceWarpRendererRef.current,
              'settings:',
              !!beautySettings,
              'landmarks:',
              !!faceLandmarks
            );
            // Copy source to canvas
            const ctx = webglCanvasRef.current.getContext('2d');
            if (ctx) {
              ctx.drawImage(source, 0, 0);
            }
          }

          // Then apply LUT
          rendererRef.current.render(webglCanvasRef.current, normalizedIntensity);
          return webglCanvasRef.current;
        } catch (error) {
          console.warn('[useWebGLRenderer] WebGL render failed, falling back to software:', error);
        }
      }

      // Software fallback
      console.log('[useWebGLRenderer] Using software LUT fallback');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      canvas.width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      canvas.height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

      ctx.drawImage(source, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const processedData = applyLutSoftware(imageData, lutData);

        // Apply intensity
        for (let i = 0; i < processedData.data.length; i += 4) {
          const originalR = imageData.data[i]! / 255;
          const originalG = imageData.data[i + 1]! / 255;
          const originalB = imageData.data[i + 2]! / 255;

          const lutR = processedData.data[i]! / 255;
          const lutG = processedData.data[i + 1]! / 255;
          const lutB = processedData.data[i + 2]! / 255;

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
    [enabled, isReady, lutPreset, lutIntensity, faceLandmarks, beautySettings]
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
