import { useEffect, useRef } from 'react';
import type { CameraSettings } from '../components/settings';
import type { HardwareCapabilities } from './useCameraStream';
import type { AutoFrameTransform } from './useBodySegmentation';
import { useProOverlays } from './useProOverlays';

interface FilterDef {
    css: string;
    overlay?: string;
    blend?: GlobalCompositeOperation;
    alpha?: number;
}

const FILTER_PRESETS: Record<string, FilterDef> = {
    none: { css: '' },
    playa: {
        css: 'contrast(1.1) brightness(1.1) saturate(1.2) sepia(0.2)',
        overlay: '#fb923c',
        blend: 'overlay',
        alpha: 0.15,
    },
    honey: {
        css: 'contrast(1.0) saturate(1.3) sepia(0.4)',
        overlay: '#fcd34d',
        blend: 'soft-light',
        alpha: 0.2,
    },
    clay: {
        css: 'contrast(0.9) saturate(0.7) sepia(0.3) brightness(1.05)',
        overlay: '#d6d3d1',
        blend: 'multiply',
        alpha: 0.15,
    },
    amber: {
        css: 'contrast(1.15) saturate(1.2) sepia(0.5) hue-rotate(-10deg)',
        overlay: '#f59e0b',
        blend: 'overlay',
        alpha: 0.1,
    },
    isla: {
        css: 'contrast(1.05) saturate(1.1) hue-rotate(10deg)',
        overlay: '#2dd4bf',
        blend: 'overlay',
        alpha: 0.15,
    },
    blush: {
        css: 'contrast(1.0) saturate(1.1) sepia(0.15) hue-rotate(315deg)',
        overlay: '#fda4af',
        blend: 'soft-light',
        alpha: 0.15,
    },
    prime: {
        css: 'contrast(1.2) saturate(1.2) brightness(1.05)',
    },
};

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

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
}

export interface UseVideoRendererReturn {
    maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    tempCanvasRef: React.RefObject<HTMLCanvasElement | null>;
    currentTransformRef: React.RefObject<AutoFrameTransform>;
}

/**
 * useVideoRenderer - Manages the main canvas rendering loop
 *
 * Handles:
 * - Video-to-canvas rendering with filters and transforms
 * - AI-based background blur/replacement compositing
 * - Portrait lighting and face smoothing effects
 * - Professional overlays (grid, histogram, zebra, focus peaking)
 * - Smooth auto-frame transitions
 *
 * Optimizations:
 * - Uses willReadFrequently: true for canvas contexts that read pixel data
 * - Pre-allocated auxiliary canvases for compositing
 * - Smooth lerp-based transform transitions
 */
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
}: UseVideoRendererOptions): UseVideoRendererReturn {
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const currentTransformRef = useRef<AutoFrameTransform>({ panX: 0, panY: 0, zoom: 1 });
    const requestRef = useRef<number | null>(null);
    const settingsRef = useRef(settings);

    const { drawGridOverlay, drawHistogram, drawZebraStripes, drawFocusPeaking } = useProOverlays();

    // Keep settings ref updated
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    // Initialize auxiliary canvases with proper context options
    useEffect(() => {
        const maskCanvas = document.createElement('canvas');
        maskCanvasRef.current = maskCanvas;
        // Use willReadFrequently: true for contexts that use getImageData frequently
        maskCtxRef.current = maskCanvas.getContext('2d', { willReadFrequently: true });

        const tempCanvas = document.createElement('canvas');
        tempCanvasRef.current = tempCanvas;
        tempCtxRef.current = tempCanvas.getContext('2d', { willReadFrequently: true });

        return () => {
            maskCanvasRef.current = null;
            maskCtxRef.current = null;
            tempCanvasRef.current = null;
            tempCtxRef.current = null;
        };
    }, []);

    // Main render loop
    useEffect(() => {
        let isLoopActive = true;

        const processVideo = () => {
            if (!isLoopActive) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            // Use willReadFrequently: true since we call getImageData for overlays
            const ctx = canvas?.getContext('2d', { alpha: false, willReadFrequently: true });
            const maskCanvas = maskCanvasRef.current;
            const maskCtx = maskCtxRef.current;
            const tempCanvas = tempCanvasRef.current;
            const tempCtx = tempCtxRef.current;
            const bgImage = bgImageRef.current;

            const {
                blur,
                portraitLighting,
                faceSmoothing,
                autoFrame,
                denoise,
                mirror,
                rotation,
                virtualBackground,
                activeFilter,
                gridOverlay,
                showHistogram,
                showZebraStripes,
                zebraThreshold,
                showFocusPeaking,
                focusPeakingColor,
            } = settingsRef.current;

            const filterPreset = FILTER_PRESETS[activeFilter] || FILTER_PRESETS['none'];

            // Calculate current transform with smooth interpolation
            if (autoFrame) {
                const speed = 0.05;
                currentTransformRef.current.panX = lerp(currentTransformRef.current.panX, targetTransformRef.current.panX, speed);
                currentTransformRef.current.panY = lerp(currentTransformRef.current.panY, targetTransformRef.current.panY, speed);
                currentTransformRef.current.zoom = lerp(currentTransformRef.current.zoom, targetTransformRef.current.zoom, speed);
            } else {
                const effectiveZoom = hardwareCapabilities.zoom ? 1 : settingsRef.current.zoom;
                const effectivePanX = hardwareCapabilities.panX ? 0 : settingsRef.current.panX;
                const effectivePanY = hardwareCapabilities.panY ? 0 : settingsRef.current.panY;
                currentTransformRef.current = { panX: effectivePanX, panY: effectivePanY, zoom: effectiveZoom };
            }

            const { panX, panY, zoom } = currentTransformRef.current;

            if (canvas && ctx && video && video.readyState >= 2) {
                // Resize canvas to match video dimensions
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    [canvas, tempCanvas, video].forEach(el => {
                        if (el) {
                            el.width = video.videoWidth;
                            el.height = video.videoHeight;
                        }
                    });
                }

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (isCompareActive) {
                    // Compare mode: show raw video
                    ctx.drawImage(video, 0, 0);
                } else {
                    // Apply transforms
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    if (mirror) ctx.scale(-1, 1);
                    ctx.scale(zoom, zoom);
                    ctx.rotate((rotation * Math.PI) / 180);
                    const xOffset = (panX / 100) * canvas.width;
                    const yOffset = (panY / 100) * canvas.height;
                    ctx.translate(xOffset, yOffset);
                    ctx.translate(-canvas.width / 2, -canvas.height / 2);

                    // Build base filter string
                    let baseFilter = '';
                    if (denoise) {
                        const contrastBoost = hardwareCapabilities.contrast ? '100%' : '105%';
                        baseFilter += `blur(0.5px) contrast(${contrastBoost}) `;
                    }
                    const effectiveContrast = hardwareCapabilities.contrast ? 100 : settingsRef.current.contrast;
                    const effectiveSaturation = hardwareCapabilities.saturation ? 100 : settingsRef.current.saturation;
                    const effectiveBrightness = hardwareCapabilities.brightness ? 100 : settingsRef.current.brightness;
                    const totalBrightness = effectiveBrightness + autoGain;
                    baseFilter += `brightness(${totalBrightness}%) contrast(${effectiveContrast}%) saturate(${effectiveSaturation}%) grayscale(${settingsRef.current.grayscale}%) sepia(${settingsRef.current.sepia}%) hue-rotate(${settingsRef.current.hue}deg) `;
                    if (filterPreset) baseFilter += filterPreset.css;

                    const segmentationMask = segmentationMaskRef.current;
                    const isAiNeeded = blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

                    if (isAiNeeded && segmentationMask && maskCanvas && maskCtx && tempCanvas && tempCtx) {
                        // Resize mask canvas if needed
                        if (maskCanvas.width !== segmentationMask.width) {
                            maskCanvas.width = segmentationMask.width;
                            maskCanvas.height = segmentationMask.height;
                        }
                        maskCtx.putImageData(segmentationMask, 0, 0);
                        ctx.globalCompositeOperation = 'source-over';

                        // Draw background (blurred or virtual)
                        if (virtualBackground && bgImage) {
                            ctx.filter = blur > 0 ? `blur(${blur}px) ${baseFilter}` : baseFilter;
                            ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
                        } else {
                            ctx.filter = blur > 0 ? `blur(${blur}px) ${baseFilter}` : baseFilter;
                            ctx.drawImage(video, 0, 0);
                        }
                        ctx.filter = 'none';

                        // Portrait lighting (dim background)
                        if (portraitLighting > 0 && !virtualBackground) {
                            const dimVal = (portraitLighting / 100) * 0.6;
                            ctx.fillStyle = `rgba(0,0,0,${dimVal})`;
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                        }

                        // Draw foreground (person) using mask
                        tempCtx.setTransform(1, 0, 0, 1, 0, 0);
                        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tempCtx.globalCompositeOperation = 'source-over';
                        tempCtx.filter = 'blur(4px)';
                        tempCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height);
                        tempCtx.filter = 'none';
                        tempCtx.globalCompositeOperation = 'source-in';
                        tempCtx.filter = baseFilter;
                        tempCtx.drawImage(video, 0, 0);
                        tempCtx.filter = 'none';

                        // Face smoothing effect
                        if (faceSmoothing > 0) {
                            tempCtx.globalCompositeOperation = 'screen';
                            const smoothAmt = (faceSmoothing / 100) * 10;
                            tempCtx.filter = `blur(${smoothAmt}px) brightness(1.1)`;
                            tempCtx.globalAlpha = 0.6;
                            tempCtx.drawImage(tempCanvas, 0, 0);
                            tempCtx.globalAlpha = 1.0;
                            tempCtx.filter = 'none';
                        }

                        // Composite foreground onto canvas
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.drawImage(tempCanvas, 0, 0);
                    } else {
                        // No AI effects - direct draw with filters
                        ctx.filter = baseFilter || 'none';
                        ctx.drawImage(video, 0, 0);
                        ctx.filter = 'none';
                    }

                    // Apply filter overlay if defined
                    if (filterPreset?.overlay) {
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.globalCompositeOperation = filterPreset.blend || 'overlay';
                        ctx.globalAlpha = filterPreset.alpha || 0.2;
                        ctx.fillStyle = filterPreset.overlay;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1.0;
                    }

                    // Draw professional overlays
                    if (gridOverlay !== 'none') {
                        drawGridOverlay(ctx, canvas.width, canvas.height, gridOverlay);
                    }

                    // Get image data for histogram, zebra, and focus peaking
                    if (showHistogram || showZebraStripes || showFocusPeaking) {
                        try {
                            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                            if (showZebraStripes) {
                                drawZebraStripes(ctx, canvas.width, canvas.height, imageData, zebraThreshold);
                            }

                            if (showFocusPeaking) {
                                drawFocusPeaking(ctx, canvas.width, canvas.height, imageData, focusPeakingColor);
                            }

                            if (showHistogram) {
                                drawHistogram(ctx, canvas.width, canvas.height, imageData);
                            }
                        } catch (e) {
                            // Canvas might be tainted, ignore
                        }
                    }
                }
            }

            if (isLoopActive) {
                requestRef.current = requestAnimationFrame(processVideo);
            }
        };

        requestRef.current = requestAnimationFrame(processVideo);

        return () => {
            isLoopActive = false;
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [
        videoRef,
        canvasRef,
        hardwareCapabilities,
        segmentationMaskRef,
        targetTransformRef,
        bgImageRef,
        isAiActive,
        isCompareActive,
        autoGain,
        drawGridOverlay,
        drawHistogram,
        drawZebraStripes,
        drawFocusPeaking,
    ]);

    return {
        maskCanvasRef,
        tempCanvasRef,
        currentTransformRef,
    };
}

export default useVideoRenderer;
