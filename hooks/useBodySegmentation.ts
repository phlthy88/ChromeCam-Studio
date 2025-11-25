import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraSettings } from '../components/settings';
import type { BodySegmenter, BarcodeDetector } from '../types/media';
import { segmentationManager, type SegmentationMode } from '../utils/segmentationManager';

// Constants to avoid GC in the inference loop
const FOREGROUND_COLOR = { r: 255, g: 255, b: 255, a: 255 };
const BACKGROUND_COLOR = { r: 0, g: 0, b: 0, a: 0 };

export interface AutoFrameTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export interface UseBodySegmentationOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  settings: CameraSettings;
}

export interface UseBodySegmentationReturn {
  segmentationMaskRef: React.RefObject<ImageData | null>;
  targetTransformRef: React.RefObject<AutoFrameTransform>;
  faceLandmarks: any[] | null;
  isAiActive: boolean;
  loadingStatus: string;
  loadingError: string | null;
  aiRuntimeError: boolean;
  qrResult: string | null;
  setQrResult: (result: string | null) => void;
  /** Current segmentation processing mode */
  segmentationMode: SegmentationMode;
}

/**
 * useBodySegmentation - Handles AI-based body segmentation and auto-framing
 *
 * Features:
 * - MediaPipe body segmentation initialization and inference
 * - Auto-framing based on detected person position
 * - QR code detection using BarcodeDetector API
 * - Graceful error handling for AI failures
 */
export function useBodySegmentation({
  videoRef,
  settings,
}: UseBodySegmentationOptions): UseBodySegmentationReturn {
  const [segmenter, setSegmenter] = useState<BodySegmenter | null>(null);
  const segmentationMaskRef = useRef<ImageData | null>(null);
  const targetTransformRef = useRef<AutoFrameTransform>({ panX: 0, panY: 0, zoom: 1 });
  const barcodeDetectorRef = useRef<BarcodeDetector | null>(null);

  // Load MediaPipe scripts if not already loaded
  const loadScripts = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.bodySegmentation) {
      try {
        // Load TensorFlow
        if (!window.tf) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        // Load MediaPipe Selfie Segmentation
        if (!window.bodySegmentation) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src =
              'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        console.log('[useBodySegmentation] Scripts loaded successfully');
      } catch (error) {
        console.error('[useBodySegmentation] Failed to load scripts:', error);
      }
    }
  }, []);

  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [aiRuntimeError, setAiRuntimeError] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Initializing AI...');
  const [isAiActive, setIsAiActive] = useState(false);
  const [qrResult, setQrResult] = useState<string | null>(null);
  const [segmentationMode, setSegmentationMode] = useState<SegmentationMode>('disabled');
  const [faceLandmarks, setFaceLandmarks] = useState<any[] | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    const isAiNeeded =
      settings.blur > 0 ||
      settings.portraitLighting > 0 ||
      settings.faceSmoothing > 0 ||
      settings.autoFrame ||
      settings.virtualBackground;
    if (!isAiNeeded) {
      setIsAiActive(false);
      segmentationMaskRef.current = null;
    }
  }, [settings]);

  // Initialize BarcodeDetector
  useEffect(() => {
    // Check if the API exists
    if ('BarcodeDetector' in window) {
      // The augmentation in types/media.ts ensures typescript knows about this constructor
      const BarcodeDetectorClass = window.BarcodeDetector;
      if (BarcodeDetectorClass) {
        barcodeDetectorRef.current = new BarcodeDetectorClass({ formats: ['qr_code'] });
      }
    }
  }, []);

  // Initialize AI segmenter - try worker first, then fall back to main thread
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let isMounted = true;

    const initWorker = async (): Promise<boolean> => {
      try {
        setLoadingStatus('Loading AI Scripts...');
        await loadScripts();
        setLoadingStatus('Initializing AI Worker...');
        const mode = await segmentationManager.initialize();

        if (!isMounted) return false;

        if (mode === 'worker') {
          setSegmentationMode('worker');
          setLoadingStatus('AI Ready (Worker)');
          setLoadingError(null);
          console.log('[AI] Using Web Worker for segmentation');

          // Set up face landmarks callback
          segmentationManager.setFaceLandmarksCallback((landmarks) => {
            console.log('[useBodySegmentation] Received face landmarks:', landmarks.length);
            if (isMounted) {
              setFaceLandmarks(landmarks);
            }
          });

          return true;
        }
        return false;
      } catch (e) {
        console.warn('[AI] Worker initialization failed:', e);
        return false;
      }
    };

    const initMainThread = async () => {
      if (window.bodySegmentation) {
        if (intervalId) clearInterval(intervalId);
        try {
          const model = window.bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
          const segmenterConfig = {
            runtime: 'mediapipe' as const,
            solutionPath:
              'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/',
            modelType: 'general' as const,
          };
          const seg = await window.bodySegmentation.createSegmenter(model, segmenterConfig);
          if (!isMounted) return;
          setSegmenter(seg);
          setSegmentationMode('main-thread');
          setLoadingStatus('AI Ready (Main Thread)');
          setLoadingError(null);
          console.log('[AI] Using main thread for segmentation');
        } catch (e) {
          console.error('[AI] Failed to initialize:', e);
          setLoadingError('Failed to load AI Engine');
          setSegmentationMode('disabled');
        }
      }
    };

    const init = async () => {
      // Try worker-based segmentation first
      const workerReady = await initWorker();

      if (!isMounted) return;

      // If worker failed, fall back to main thread
      if (!workerReady) {
        setLoadingStatus('Falling back to main thread...');
        intervalId = setInterval(initMainThread, 500);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadScripts]);

  // AI inference loop
  useEffect(() => {
    let isLoopActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const inferenceLoop = async () => {
      if (!isLoopActive) return;

      const video = videoRef.current;
      const { blur, portraitLighting, faceSmoothing, autoFrame, virtualBackground, qrMode } =
        settingsRef.current;
      const isAiNeeded =
        blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

      if (video && video.readyState >= 2 && !video.paused) {
        try {
          // QR Code detection
          if (qrMode && barcodeDetectorRef.current && video.videoWidth > 0) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(video);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                setQrResult(barcodes[0].rawValue);
              }
            } catch (_e) {
              // QR detection failed, ignore
            }
          } else if (!qrMode && qrResult) {
            setQrResult(null);
          }

          // Body segmentation - use worker or main thread based on mode
          const canRunWorker = segmentationMode === 'worker' && segmentationManager.isWorkerReady();
          const canRunMainThread = segmentationMode === 'main-thread' && segmenter;

          if (
            isAiNeeded &&
            (canRunWorker || canRunMainThread) &&
            !aiRuntimeError &&
            video.videoWidth > 0
          ) {
            let mask: ImageData | null = null;

            if (canRunWorker) {
              // Use Web Worker for off-main-thread processing
              const result = await segmentationManager.segment(video);
              mask = result.mask;
              if (result.error) {
                console.warn('[AI] Worker segmentation error:', result.error);
              }
            } else if (canRunMainThread && segmenter) {
              // Fallback to main thread processing
              const segmentation = await segmenter.segmentPeople(video);
              if (window.bodySegmentation) {
                mask = await window.bodySegmentation.toBinaryMask(
                  segmentation,
                  FOREGROUND_COLOR,
                  BACKGROUND_COLOR
                );
              }
            }

            if (mask) {
              segmentationMaskRef.current = mask;
              setIsAiActive(true);
            }

            // Auto-framing calculation
            if (settingsRef.current.autoFrame && mask) {
              const width = mask.width;
              const height = mask.height;
              const data = mask.data;
              let minX = width,
                maxX = 0,
                minY = height,
                maxY = 0;
              let found = false;

              // Sample every 8th pixel for performance
              for (let y = 0; y < height; y += 8) {
                for (let x = 0; x < width; x += 8) {
                  if ((data[(y * width + x) * 4] ?? 0) > 128) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                  }
                }
              }

              if (found) {
                const boxCenterX = (minX + maxX) / 2;
                const boxHeight = maxY - minY;
                // Focus on the face/head area (upper ~25% of detected body)
                const faceY = minY + boxHeight * 0.25;
                const centerXPercent = boxCenterX / width;
                const faceYPercent = faceY / height;
                const targetPanX = (0.5 - centerXPercent) * 100;
                const targetPanY = (0.5 - faceYPercent) * 100;
                let targetZoom = (height * 0.6) / boxHeight;
                targetZoom = Math.max(1, Math.min(targetZoom, 2.5));
                targetTransformRef.current = {
                  panX: targetPanX,
                  panY: targetPanY,
                  zoom: targetZoom,
                };
              }
            } else {
              targetTransformRef.current = { panX: 0, panY: 0, zoom: 1 };
            }
          } else if (!isAiNeeded) {
            segmentationMaskRef.current = null;
            setIsAiActive(false);
          }
        } catch (e) {
          console.error('[AI] Runtime error during segmentation:', e);
          setAiRuntimeError(true);
          setLoadingError('AI processing encountered an error. Some features may be unavailable.');
        }
      }

      if (isLoopActive) {
        // Use requestAnimationFrame for better performance synchronization
        // This prevents double work by aligning with the render loop
        // Only run inference every other frame (~30fps on 60fps displays)
        timeoutId = setTimeout(inferenceLoop, 66); // ~15fps inference to reduce CPU load
      }
    };

    inferenceLoop();

    return () => {
      isLoopActive = false;
      clearTimeout(timeoutId);
    };
  }, [segmenter, aiRuntimeError, videoRef, qrResult, segmentationMode]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      // Note: We don't dispose the singleton here as other components might use it
      // The singleton pattern means it persists for the app lifecycle
    };
  }, []);

  return {
    segmentationMaskRef,
    targetTransformRef,
    faceLandmarks, // Will be null if no face detection - beauty effects need real landmarks
    isAiActive,
    loadingStatus,
    loadingError,
    aiRuntimeError,
    qrResult,
    setQrResult,
    segmentationMode,
  };
}

export default useBodySegmentation;
