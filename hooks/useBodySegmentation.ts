import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraSettings } from '../components/settings';
import type { BodySegmenter, BarcodeDetector } from '../types/media';
import { segmentationManager, type SegmentationMode } from '../utils/segmentationManager';
import { FaceLandmarks } from '../types/face';

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
  faceLandmarks: FaceLandmarks | null;
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

  // Load MediaPipe scripts if not already loaded - only for main thread fallback
  const loadScripts = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.bodySegmentation) {
      try {
        const loadScript = (url: string) => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        };

        // Load TensorFlow
        if (!window.tf) {
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js');
        }
        // Load MediaPipe Selfie Segmentation
        if (!window.bodySegmentation) {
          await loadScript(
            'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js'
          );
        }
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
  const [faceLandmarks, setFaceLandmarks] = useState<FaceLandmarks | null>(null);

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
    let isMounted = true;

    const initMainThread = async () => {
      if (!isMounted) return;
      setLoadingStatus('Falling back to main thread...');
      await loadScripts(); // Ensure scripts are loaded

      if (!isMounted) return;

      if (window.bodySegmentation) {
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
        } catch (e) {
          if (!isMounted) return;
          console.error('[AI] Main thread initialization failed:', e);
          setLoadingError('Failed to load AI Engine');
          setSegmentationMode('disabled');
        }
      } else {
        if (!isMounted) return;
        setLoadingError('AI scripts failed to load.');
        setSegmentationMode('disabled');
      }
    };

    const init = async () => {
      try {
        setLoadingStatus('Initializing AI Worker...');
        const mode = await segmentationManager.initialize();

        if (!isMounted) return;

        if (mode === 'worker') {
          setSegmentationMode('worker');
          setLoadingStatus('AI Ready (Worker)');
          setLoadingError(null);

          // Set up face landmarks callback
          segmentationManager.setFaceLandmarksCallback((landmarks) => {
            if (isMounted) {
              setFaceLandmarks(landmarks);
            }
          });
        } else if (mode === 'disabled') {
          // Worker unavailable, fall back to main thread
          console.log('[AI] Worker unavailable, falling back to main thread');
          setLoadingStatus('Worker unavailable, using main thread...');
          await initMainThread();
        } else {
          // Unexpected mode
          throw new Error(`Unexpected segmentation mode: ${mode}`);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('[AI] Fatal initialization error:', error);
        setLoadingError('AI system unavailable');
        setSegmentationMode('disabled');
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [loadScripts]);

  // ===========================================================================
  // FIX: REFINED INFERENCE LOOP WITH SEMAPHORE (PREVENTS STACKING)
  // ===========================================================================
  useEffect(() => {
    let isLoopActive = true;
    let animationFrameId: number;
    let isProcessing = false; // CRITICAL: Semaphore to prevent call stacking
    let frameSkipCounter = 0;
    const FRAME_SKIP_INTERVAL = 3; // Process 1 out of every 4 frames (~15 FPS @ 60Hz)

    const inferenceLoop = async () => {
      if (!isLoopActive || segmentationMode === 'disabled') {
        animationFrameId = requestAnimationFrame(inferenceLoop);
        return;
      }

      // 1. Frame Skipping Logic
      frameSkipCounter++;
      if (frameSkipCounter < FRAME_SKIP_INTERVAL) {
        animationFrameId = requestAnimationFrame(inferenceLoop);
        return;
      }
      frameSkipCounter = 0;

      // 2. CRITICAL: Prevent Overlapping Calls
      // If the previous segmentation is still running, SKIP this frame entirely.
      // This is the key fix for the "Death Spiral" - prevents async call stacking.
      if (isProcessing) {
        animationFrameId = requestAnimationFrame(inferenceLoop);
        return;
      }

      const video = videoRef.current;
      const { blur, portraitLighting, faceSmoothing, autoFrame, virtualBackground, qrMode } =
        settingsRef.current;
      const isAiNeeded =
        blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

      if (video && video.readyState >= 2 && !video.paused) {
        isProcessing = true; // Lock - prevent concurrent processing

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
              // AWAIT IS CRITICAL HERE - ensures we wait for completion
              const result = await segmentationManager.segment(
                video,
                settingsRef.current.autoFrame
              );
              mask = result.mask;
              if (result.error) {
                console.warn('[AI] Worker segmentation error:', result.error);
              }

              if (result.autoFrameTransform) {
                targetTransformRef.current = result.autoFrameTransform;
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

            if (!settingsRef.current.autoFrame) {
              targetTransformRef.current = { panX: 0, panY: 0, zoom: 1 };
            }
          } else if (!isAiNeeded) {
            segmentationMaskRef.current = null;
            setIsAiActive(false);
          }
        } catch (e) {
          console.error('[AI] Runtime error during segmentation:', e);
          setAiRuntimeError(true);
          setLoadingError('AI processing encountered an error.');
        } finally {
          isProcessing = false; // Unlock - always release, even on error
        }
      }

      if (isLoopActive) {
        animationFrameId = requestAnimationFrame(inferenceLoop);
      }
    };

    // Start the loop
    animationFrameId = requestAnimationFrame(inferenceLoop);

    return () => {
      isLoopActive = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [segmenter, aiRuntimeError, videoRef, qrResult, segmentationMode]);
  // ===========================================================================

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      // Note: We don't dispose the singleton here as other components might use it
    };
  }, []);

  return {
    segmentationMaskRef,
    targetTransformRef,
    faceLandmarks,
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
