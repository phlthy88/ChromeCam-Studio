import React, { useEffect, useRef, useMemo } from 'react';
import type { CameraSettings } from '../components/settings';
import { ASPECT_RATIO_PRESETS } from '../components/settings';
import type { HardwareCapabilities } from './useCameraStream';
import type { AutoFrameTransform } from './useBodySegmentation';

import { useProOverlays } from './useProOverlays';
import { useWebGLRenderer } from './useWebGLRenderer';
import { usePerformanceMonitor } from './usePerformanceMonitor';

// ...other code and types...

import { FaceLandmarks } from '../types/face';

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
  // ... other refs and cache ...

  // Updated STABILIZED LANDMARK REF
  const stableLandmarksRef = useRef<FaceLandmarks | null>(null);
  useEffect(() => {
    if (faceLandmarks) {
      // Only update if different
      const landmarksChanged =
        !stableLandmarksRef.current ||
        JSON.stringify(faceLandmarks) !== JSON.stringify(stableLandmarksRef.current);
      if (landmarksChanged) {
        stableLandmarksRef.current = faceLandmarks;
      }
    }
  }, [faceLandmarks]);

  const beautyEnabled =
    settings.eyeEnlargement > 0 ||
    settings.noseSlimming > 0 ||
    settings.jawSlimming > 0 ||
    settings.mouthScaling > 0;

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
    [
      settings.cinematicLut,
      settings.cinematicLutIntensity,
      beautyEnabled,
      settings.eyeEnlargement,
      settings.noseSlimming,
      settings.jawSlimming,
      settings.mouthScaling,
    ]
  );

  const { isReady: isWebGLReady, applyLutGrading } = useWebGLRenderer(webGLOptions);

  // ...rest of hook logic (unchanged)...

  return {
    maskCanvasRef,
    tempCanvasRef,
    currentTransformRef,
    isWebGLActive: isWebGLReady && settings.cinematicLut !== 'none',
    performanceMetrics,
  };
}

export default useVideoRenderer;
