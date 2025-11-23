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
import { WebGLLutRenderer } from '../utils/webglLut';
import { getCinematicLut } from '../data/cinematicLuts';

export interface UseWebGLRendererOptions {
  /** Whether WebGL rendering is enabled */
  enabled: boolean;
  /** ID of the cinematic LUT preset to use */
  lutPreset: string;
  /** LUT intensity (0-100) */
  lutIntensity: number;
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
}: UseWebGLRendererOptions): UseWebGLRendererReturn {
  const rendererRef = useRef<WebGLLutRenderer | null>(null);
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
    console.log('[useWebGLRenderer] Initializing WebGL renderer...');
    const initialized = renderer.initialize(webglCanvasRef.current);

    if (initialized) {
      rendererRef.current = renderer;
      setIsReady(true);
      console.log('[useWebGLRenderer] WebGL renderer initialized successfully');
    } else {
      console.error('[useWebGLRenderer] Failed to initialize WebGL renderer');
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

  // Apply LUT grading to source
  const applyLutGrading = useCallback(
    (source: HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement | null => {
      if (!enabled || !isReady || !rendererRef.current || lutPreset === 'none') {
        return null;
      }

      // Normalize intensity from 0-100 to 0-1
      const normalizedIntensity = lutIntensity / 100;

      // Render with LUT
      rendererRef.current.render(source, normalizedIntensity);

      return webglCanvasRef.current;
    },
    [enabled, isReady, lutPreset, lutIntensity]
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
