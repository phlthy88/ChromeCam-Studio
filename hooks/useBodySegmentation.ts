import { useEffect, useRef, useState } from 'react';
import type { CameraSettings } from '../components/settings';
import type { BodySegmenter, BarcodeDetector } from '../types/media.d.ts';

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
    isAiActive: boolean;
    loadingStatus: string;
    loadingError: string | null;
    aiRuntimeError: boolean;
    qrResult: string | null;
    setQrResult: (result: string | null) => void;
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

    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [aiRuntimeError, setAiRuntimeError] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState<string>('Initializing AI...');
    const [isAiActive, setIsAiActive] = useState(false);
    const [qrResult, setQrResult] = useState<string | null>(null);

    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
        const isAiNeeded = settings.blur > 0 || settings.portraitLighting > 0 || settings.faceSmoothing > 0 || settings.autoFrame || settings.virtualBackground;
        if (!isAiNeeded) {
            setIsAiActive(false);
            segmentationMaskRef.current = null;
        }
    }, [settings]);

    // Initialize BarcodeDetector
    useEffect(() => {
        if (window.BarcodeDetector) {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
    }, []);

    // Initialize AI segmenter
    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval> | undefined;

        const initAI = async () => {
            if (window.bodySegmentation) {
                if (intervalId) clearInterval(intervalId);
                try {
                    const model = window.bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
                    const segmenterConfig = {
                        runtime: 'mediapipe' as const,
                        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/',
                        modelType: 'general' as const,
                    };
                    const seg = await window.bodySegmentation.createSegmenter(model, segmenterConfig);
                    setSegmenter(seg);
                    setLoadingStatus('AI Ready');
                    setLoadingError(null);
                } catch (e) {
                    console.error('[AI] Failed to initialize:', e);
                    setLoadingError('Failed to load AI Engine');
                }
            }
        };

        intervalId = setInterval(initAI, 500);
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    // AI inference loop
    useEffect(() => {
        let isLoopActive = true;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const inferenceLoop = async () => {
            if (!isLoopActive) return;

            const video = videoRef.current;
            const { blur, portraitLighting, faceSmoothing, autoFrame, virtualBackground, qrMode } = settingsRef.current;
            const isAiNeeded = blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

            if (video && video.readyState >= 2 && !video.paused) {
                try {
                    // QR Code detection
                    if (qrMode && barcodeDetectorRef.current && video.videoWidth > 0) {
                        try {
                            const barcodes = await barcodeDetectorRef.current.detect(video);
                            if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                                setQrResult(barcodes[0].rawValue);
                            }
                        } catch (e) {
                            // QR detection failed, ignore
                        }
                    } else if (!qrMode && qrResult) {
                        setQrResult(null);
                    }

                    // Body segmentation
                    if (isAiNeeded && segmenter && !aiRuntimeError && video.videoWidth > 0) {
                        const segmentation = await segmenter.segmentPeople(video);
                        const mask = await window.bodySegmentation!.toBinaryMask(
                            segmentation,
                            FOREGROUND_COLOR,
                            BACKGROUND_COLOR
                        );
                        segmentationMaskRef.current = mask;
                        setIsAiActive(true);

                        // Auto-framing calculation
                        if (settingsRef.current.autoFrame) {
                            const width = mask.width;
                            const height = mask.height;
                            const data = mask.data;
                            let minX = width, maxX = 0, minY = height, maxY = 0;
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
                                targetTransformRef.current = { panX: targetPanX, panY: targetPanY, zoom: targetZoom };
                            }
                        } else {
                            targetTransformRef.current = { panX: 0, panY: 0, zoom: 1 };
                        }
                    } else if (!isAiNeeded) {
                        segmentationMaskRef.current = null;
                        setIsAiActive(false);
                    }
                } catch (e) {
                    setAiRuntimeError(true);
                }
            }

            if (isLoopActive) {
                timeoutId = setTimeout(inferenceLoop, 33); // ~30fps inference
            }
        };

        inferenceLoop();

        return () => {
            isLoopActive = false;
            clearTimeout(timeoutId);
        };
    }, [segmenter, aiRuntimeError, videoRef, qrResult]);

    return {
        segmentationMaskRef,
        targetTransformRef,
        isAiActive,
        loadingStatus,
        loadingError,
        aiRuntimeError,
        qrResult,
        setQrResult,
    };
}

export default useBodySegmentation;
