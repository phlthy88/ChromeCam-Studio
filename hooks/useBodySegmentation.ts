import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraSettings } from '../components/settings';
import type { BodySegmenter, BarcodeDetector } from '../types/media';
import { segmentationManager, type SegmentationMode } from '../utils/segmentationManager';
import { FaceLandmarks } from '../types/face';
import { logger } from '../utils/logger';
import { INFERENCE_FRAME_SKIP_FACTOR } from '../constants/ai';
import { ensureTfjsWebGLBackend } from '../utils/tfLoader';

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

  // Load required TensorFlow.js components via centralized loader
  const loadScripts = useCallback(async () => {
    if (typeof window !== 'undefined') {
      // Check if TensorFlow.js is already loaded and ready
      if (window.tf) {
        logger.info('useBodySegmentation', 'TensorFlow.js already loaded globally');
        return;
      }

      logger.info('useBodySegmentation', 'Starting TensorFlow.js loading process');

      try {
        // Use the centralized loader to ensure TensorFlow.js is loaded once
        await ensureTfjsWebGLBackend();
        logger.info('useBodySegmentation', 'TensorFlow.js loaded successfully via centralized loader');
      } catch (error) {
        logger.error('useBodySegmentation', 'Failed to load TensorFlow.js via centralized loader', error);

        // Provide more specific error messages
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('timeout')
        ) {
          setLoadingError(
            'Network error: Unable to download AI libraries. Please check your internet connection and try refreshing the page.'
          );
        } else if (
          errorMessage.includes('CORS') ||
          errorMessage.includes('cross-origin') ||
          errorMessage.includes('blocked')
        ) {
          setLoadingError('Security error: AI libraries blocked by browser security policy.');
        } else {
          setLoadingError('AI libraries failed to load. Some features may not work properly.');
        }

        setSegmentationMode('disabled');
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
          logger.error('useBodySegmentation', '[AI] Main thread initialization failed:', e);
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
      // Acquire reference to the singleton manager
      segmentationManager.acquire();

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
            logger.debug('useBodySegmentation', `Setting ${landmarks.length} face landmarks`);
            if (isMounted) {
              setFaceLandmarks(landmarks);
            }
          });
        } else if (mode === 'disabled' || mode === 'main-thread') {
          // Worker unavailable, fall back to main thread
          logger.warn('useBodySegmentation', `Worker unavailable (mode: ${mode}), falling back to main thread`);
          setLoadingStatus('Worker unavailable, using main thread...');
          await initMainThread();
        }
      } catch (error) {
        if (!isMounted) return;

        logger.error('useBodySegmentation', '[AI] Fatal initialization error:', error);

        // Provide specific error messages based on the error type
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('timeout')) {
          setLoadingError('AI initialization timed out. Please refresh the page and try again.');
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          setLoadingError(
            'Network error: Unable to load AI models. Please check your internet connection.'
          );
        } else if (errorMessage.includes('WebGL') || errorMessage.includes('WebAssembly')) {
          setLoadingError(
            'Your browser does not support the required AI features. Please try a modern browser.'
          );
        } else {
          setLoadingError('AI system failed to initialize. Some features may not be available.');
        }

        setSegmentationMode('disabled');
      }
    };

    init();

    return () => {
      isMounted = false;
      // Release reference to the singleton manager
      segmentationManager.release();
    };
  }, [loadScripts]);

  // ===========================================================================
  // FIX: REFINED INFERENCE LOOP WITH SEMAPHORE (PREVENTS STACKING)
  // ===========================================================================
  useEffect(() => {
    let isLoopActive = true;
    let isMounted = true;
    let animationFrameId: number;
    let isProcessing = false; // CRITICAL: Semaphore to prevent call stacking
    let frameSkipCounter = 0;
    const FRAME_SKIP_INTERVAL = INFERENCE_FRAME_SKIP_FACTOR;

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
              if (barcodes.length > 0 && barcodes[0]?.rawValue && isMounted) {
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
              // Convert ImageBitmap to ImageData for compatibility
              if (result.mask instanceof ImageBitmap) {
                const offscreenCanvas = new OffscreenCanvas(result.mask.width, result.mask.height);
                const ctx = offscreenCanvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(result.mask, 0, 0);
                  mask = ctx.getImageData(0, 0, result.mask.width, result.mask.height);
                }
              } else {
                mask = result.mask;
              }
              if (result.error) {
                logger.warn('useBodySegmentation', '[AI] Worker segmentation error:', result.error);
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

            if (mask && isMounted) {
              segmentationMaskRef.current = mask;
              setIsAiActive(true);
            }

            if (!settingsRef.current.autoFrame) {
              targetTransformRef.current = { panX: 0, panY: 0, zoom: 1 };
            }
          } else if (!isAiNeeded && isMounted) {
            segmentationMaskRef.current = null;
            setIsAiActive(false);
          }
        } catch (e) {
          logger.error('useBodySegmentation', '[AI] Runtime error during segmentation:', e);
          if (isMounted) {
            setAiRuntimeError(true);
            setLoadingError('AI processing encountered an error.');
          }
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
      isMounted = false;
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
