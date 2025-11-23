import React, { useEffect, useRef, useState } from 'react';
import { CameraSettings } from './settings';
import type { ExtendedMediaTrackCapabilities } from '../types/media.d.ts';
import {
    useWakeLock,
    useCameraStream,
    useBodySegmentation,
    useVideoRenderer,
    useMediaRecorder,
} from '../hooks';

interface VideoPanelProps {
    deviceId: string | null;
    settings: CameraSettings;
    onCapabilitiesChange?: (capabilities: ExtendedMediaTrackCapabilities | null) => void;
}

/**
 * VideoPanel - Main video display and processing component
 *
 * This component has been refactored from a 993-line "God Component" into a
 * composition of focused custom hooks:
 *
 * - useWakeLock: Prevents screen sleep during camera operation
 * - useCameraStream: Manages MediaStream lifecycle and hardware controls
 * - useBodySegmentation: Handles AI-based body segmentation and auto-framing
 * - useVideoRenderer: Manages the canvas rendering loop with effects
 * - useMediaRecorder: Handles recording and snapshot functionality
 *
 * Benefits:
 * - Better testability (each hook can be tested in isolation)
 * - Improved maintainability (changes to recording won't affect rendering)
 * - Enhanced performance (granular re-renders only where needed)
 * - Easier debugging (errors are contained to specific functionality)
 */
const VideoPanel: React.FC<VideoPanelProps> = ({ deviceId, settings, onCapabilitiesChange }) => {
    // Canvas ref for rendering
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pipVideoRef = useRef<HTMLVideoElement>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    // UI state
    const [isCompareActive, setIsCompareActive] = useState(false);
    const [autoGain, setAutoGain] = useState(0);
    const autoGainRef = useRef(0);
    const lowLightIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep screen awake during camera operation
    useWakeLock();

    // Camera stream management
    const {
        videoRef,
        streamRef,
        hardwareCapabilities,
        error: cameraError,
    } = useCameraStream({
        deviceId,
        settings,
        onCapabilitiesChange,
    });

    // AI body segmentation and auto-framing
    const {
        segmentationMaskRef,
        targetTransformRef,
        isAiActive,
        loadingStatus,
        loadingError,
        qrResult,
    } = useBodySegmentation({
        videoRef,
        settings,
    });

    // Canvas rendering with effects
    useVideoRenderer({
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
    });

    // Recording and snapshots
    const {
        isRecording,
        recordingTime,
        toggleRecording,
        formatTime,
        handleSnapshot,
        flashActive,
    } = useMediaRecorder({
        canvasRef,
        streamRef,
        settings,
    });

    // Load virtual background image
    useEffect(() => {
        if (settings.virtualBackground && settings.virtualBackgroundImage) {
            const img = new Image();
            img.src = settings.virtualBackgroundImage;
            img.onload = () => {
                bgImageRef.current = img;
            };
            img.onerror = () => {
                bgImageRef.current = null;
            };
        } else {
            bgImageRef.current = null;
        }
    }, [settings.virtualBackground, settings.virtualBackgroundImage]);

    // Auto low-light gain adjustment
    useEffect(() => {
        if (!settings.autoLowLight) {
            setAutoGain(0);
            autoGainRef.current = 0;
            if (lowLightIntervalRef.current) clearInterval(lowLightIntervalRef.current);
            return;
        }

        const analyzeBrightness = () => {
            const video = videoRef.current;
            if (!video || video.paused || video.readyState < 2) return;

            const sampleSize = 32;
            const canvas = document.createElement('canvas');
            canvas.width = sampleSize;
            canvas.height = sampleSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            try {
                ctx.drawImage(video, video.videoWidth / 2 - 16, video.videoHeight / 2 - 16, 32, 32, 0, 0, 32, 32);
                const data = ctx.getImageData(0, 0, 32, 32).data;
                let totalLum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    totalLum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
                }
                const avg = totalLum / 1024;
                const target = 110;
                let gain = 0;
                if (avg < target) gain = ((target - avg) / target) * 80;
                const prev = autoGainRef.current;
                const diff = gain - prev;
                if (Math.abs(diff) > 0.5) {
                    const newValue = prev + diff * 0.1;
                    autoGainRef.current = newValue;
                    setAutoGain(newValue);
                }
            } catch (e) {
                // Ignore errors from tainted canvas
            }
        };

        lowLightIntervalRef.current = setInterval(analyzeBrightness, 500);
        return () => {
            if (lowLightIntervalRef.current) clearInterval(lowLightIntervalRef.current);
        };
    }, [settings.autoLowLight, videoRef]);

    // Maintain PiP video stream
    useEffect(() => {
        const maintainPip = async () => {
            if (canvasRef.current && pipVideoRef.current && streamRef.current) {
                const video = pipVideoRef.current;
                if (!video.srcObject) {
                    const stream = canvasRef.current.captureStream(30);
                    video.srcObject = stream;
                }
                if (video.paused && video.readyState >= 2) {
                    try {
                        await video.play();
                    } catch (e) {
                        // Ignore autoplay errors
                    }
                }
            }
        };

        const interval = setInterval(maintainPip, 1000);
        maintainPip();
        return () => clearInterval(interval);
    }, [deviceId, streamRef]);

    // Toggle PiP mode
    const togglePiP = async () => {
        const video = pipVideoRef.current;
        if (!video) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                if (video.readyState === 0) {
                    await new Promise((resolve) => {
                        video.onloadedmetadata = resolve;
                    });
                }
                if (video.paused) await video.play();
                await video.requestPictureInPicture();
            }
        } catch (err) {
            console.warn('PiP failed:', err);
        }
    };

    // Toggle fullscreen mode
    const toggleFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (canvasRef.current?.parentElement) {
                await canvasRef.current.parentElement.requestFullscreen();
            }
        } catch (err) {
            console.warn('Fullscreen failed:', err);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    handleSnapshot();
                    break;
                case 'KeyR':
                    e.preventDefault();
                    toggleRecording();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'KeyM':
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('chromecam-toggle-mirror'));
                    break;
                case 'KeyC':
                    e.preventDefault();
                    setIsCompareActive(prev => !prev);
                    break;
                case 'KeyP':
                    e.preventDefault();
                    togglePiP();
                    break;
                case 'KeyG':
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('chromecam-cycle-grid'));
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSnapshot, toggleRecording]);

    return (
        <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden relative group">
            {/* Flash Overlay */}
            <div className={`absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150 ${flashActive ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* Status Indicators (Top Left/Right) - M3 Semantic Colors */}
            {isAiActive && !isCompareActive && (
                <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest/90 backdrop-blur-sm rounded-full border border-outline-variant/30 shadow-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        <span className="md-label-small text-on-surface-variant">AI Processing</span>
                    </div>
                </div>
            )}

            {isRecording && (
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-error-container/90 backdrop-blur-sm rounded-full border border-error/30 shadow-sm animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-error"></div>
                    <span className="md-label-small text-on-error-container font-mono">{formatTime(recordingTime)}</span>
                </div>
            )}

            {/* QR Code Result */}
            {qrResult && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                    <div
                        className="flex items-center gap-3 px-4 py-2 bg-surface-container-high text-on-surface rounded-full shadow-elevation-3 cursor-pointer"
                        onClick={() => {
                            navigator.clipboard.writeText(qrResult);
                            alert('Copied');
                        }}
                    >
                        <span className="font-medium text-sm truncate max-w-[200px]">{qrResult}</span>
                    </div>
                </div>
            )}

            {/* Loading Status */}
            {settings && (settings.blur > 0 || settings.portraitLighting > 0 || settings.faceSmoothing > 0) && !isAiActive && !loadingError && !isCompareActive && (
                <div className="absolute z-30 text-on-surface-variant bg-surface-container/90 px-4 py-2 rounded-full backdrop-blur-sm animate-pulse flex items-center gap-2">
                    <span className="text-sm font-medium">{loadingStatus}</span>
                </div>
            )}

            {/* Error Display */}
            {(cameraError || loadingError) && (
                <div className="absolute z-30 text-on-error-container bg-error-container/90 px-4 py-2 rounded-full backdrop-blur-sm flex items-center gap-2">
                    <span className="text-sm font-medium">{cameraError || loadingError}</span>
                </div>
            )}

            {/* M3 FLOATING TOOLBAR */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 transition-transform duration-300 translate-y-[150%] group-hover:translate-y-0">
                <div className="flex items-center gap-6 p-4 bg-surface-container-low/95 backdrop-blur-lg rounded-full shadow-elevation-3 border border-outline-variant/30">

                    {/* Secondary Actions (Left) */}
                    <div className="flex items-center gap-2">
                        <button onClick={togglePiP} className="p-3 rounded-full text-on-surface-variant hover:bg-on-surface-variant/10 active:bg-on-surface-variant/20 transition-colors" title="Picture-in-Picture">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                        </button>
                    </div>

                    {/* Primary Actions (Center) */}
                    <div className="flex items-center gap-4 px-2 border-x border-outline-variant/20">
                        {/* Snapshot: Filled Tonal Button */}
                        <button onClick={handleSnapshot} className="w-12 h-12 flex items-center justify-center rounded-full bg-secondary-container text-on-secondary-container hover:shadow-elevation-1 active:scale-95 transition-all" title="Take Snapshot">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        {/* Record: Large FAB */}
                        <button
                            onClick={toggleRecording}
                            className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-300 shadow-elevation-2 hover:shadow-elevation-4 active:scale-95 ${isRecording ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}
                            title={isRecording ? 'Stop Recording' : 'Start Recording'}
                        >
                            <div className={`transition-all duration-300 ${isRecording ? 'w-6 h-6 bg-current rounded-sm' : 'w-4 h-4 bg-current rounded-full scale-150'}`}></div>
                        </button>
                    </div>

                    {/* Secondary Actions (Right) */}
                    <div className="flex items-center gap-2">
                        <button
                            onMouseDown={() => setIsCompareActive(true)}
                            onMouseUp={() => setIsCompareActive(false)}
                            onMouseLeave={() => setIsCompareActive(false)}
                            onTouchStart={() => setIsCompareActive(true)}
                            onTouchEnd={() => setIsCompareActive(false)}
                            className={`p-3 rounded-full transition-colors ${isCompareActive ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-on-surface-variant/10'}`}
                            title="Hold to Compare"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Hidden video elements */}
            <video ref={videoRef} autoPlay playsInline muted={true} crossOrigin="anonymous" className="absolute opacity-0 pointer-events-none" />
            <canvas ref={canvasRef} className="relative z-10 w-full h-full object-contain" />
            <video ref={pipVideoRef} className="fixed top-0 left-0 opacity-0 pointer-events-none h-1 w-1" muted playsInline />
        </div>
    );
};

export default VideoPanel;
