import { useEffect, useRef, useState } from 'react';
import type { CameraSettings } from '../components/settings';
import { RESOLUTION_PRESETS } from '../components/settings';
import type {
    ExtendedMediaTrackCapabilities,
    ExtendedMediaTrackConstraints,
    ExtendedMediaTrackConstraintSet,
} from '../types/media.d.ts';

/**
 * Hardware capabilities that support direct camera control
 */
export interface HardwareCapabilities {
    zoom: boolean;
    panX: boolean;
    panY: boolean;
    brightness: boolean;
    contrast: boolean;
    saturation: boolean;
}

export interface UseCameraStreamOptions {
    deviceId: string | null;
    settings: CameraSettings;
    onCapabilitiesChange?: (capabilities: ExtendedMediaTrackCapabilities | null) => void;
}

export interface UseCameraStreamReturn {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    streamRef: React.RefObject<MediaStream | null>;
    videoTrackRef: React.RefObject<MediaStreamTrack | null>;
    capabilitiesRef: React.RefObject<ExtendedMediaTrackCapabilities | null>;
    hardwareCapabilities: HardwareCapabilities;
    error: string | null;
}

const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
    ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

/**
 * useCameraStream - Manages MediaStream lifecycle and hardware camera controls
 *
 * Handles:
 * - Camera stream acquisition with configurable resolution/framerate
 * - Audio stream with noise suppression, echo cancellation
 * - PTZ (Pan-Tilt-Zoom) hardware controls when available
 * - Exposure, focus, white balance hardware settings
 * - Hardware capability detection
 */
export function useCameraStream({
    deviceId,
    settings,
    onCapabilitiesChange,
}: UseCameraStreamOptions): UseCameraStreamReturn {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const capabilitiesRef = useRef<ExtendedMediaTrackCapabilities | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hardwareCapabilities, setHardwareCapabilities] = useState<HardwareCapabilities>({
        zoom: false,
        panX: false,
        panY: false,
        brightness: false,
        contrast: false,
        saturation: false,
    });

    // Start/restart stream when device or core settings change
    useEffect(() => {
        let isCancelled = false;

        const startStream = async () => {
            if (!deviceId) return;

            try {
                setError(null);
                setHardwareCapabilities({
                    zoom: false,
                    panX: false,
                    panY: false,
                    brightness: false,
                    contrast: false,
                    saturation: false,
                });
                capabilitiesRef.current = null;
                videoTrackRef.current = null;
                if (onCapabilitiesChange) onCapabilitiesChange(null);

                // Stop existing stream
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                }

                // Determine resolution based on settings
                let widthIdeal: number, heightIdeal: number;
                if (settings.bandwidthSaver) {
                    widthIdeal = 640;
                    heightIdeal = 480;
                } else if (settings.resolution === 'custom') {
                    widthIdeal = settings.customWidth;
                    heightIdeal = settings.customHeight;
                } else {
                    const preset = RESOLUTION_PRESETS[settings.resolution] ?? RESOLUTION_PRESETS['720p'];
                    widthIdeal = preset?.width ?? 1280;
                    heightIdeal = preset?.height ?? 720;
                }
                const fpsIdeal = settings.bandwidthSaver ? 24 : settings.frameRate;

                // Build video constraints
                const videoConstraints: MediaTrackConstraints = {
                    deviceId: { exact: deviceId },
                    width: { ideal: widthIdeal },
                    height: { ideal: heightIdeal },
                    frameRate: { ideal: fpsIdeal },
                    facingMode: settings.facingMode,
                };

                // Build audio constraints
                const audioConstraints: MediaTrackConstraints | boolean = settings.enableAudio ? {
                    deviceId: settings.audioDeviceId ? { exact: settings.audioDeviceId } : undefined,
                    echoCancellation: settings.echoCancellation,
                    noiseSuppression: settings.noiseSuppression,
                    autoGainControl: settings.autoGainControl,
                    sampleRate: settings.sampleRate,
                    channelCount: settings.channelCount,
                } : false;

                // Extended video constraints with PTZ support
                const extendedVideoConstraints: ExtendedMediaTrackConstraintSet = {
                    ...videoConstraints,
                    pan: true,
                    tilt: true,
                    zoom: true,
                };

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: extendedVideoConstraints as MediaTrackConstraints,
                    audio: audioConstraints,
                });

                if (isCancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;
                const videoTrack = stream.getVideoTracks()[0];

                if (videoTrack) {
                    videoTrackRef.current = videoTrack;

                    // Apply initial focus/exposure modes
                    const initialConstraints: ExtendedMediaTrackConstraints = {
                        advanced: [{ focusMode: 'continuous', exposureMode: 'continuous' }],
                    };
                    try {
                        await videoTrack.applyConstraints(initialConstraints as MediaTrackConstraints);
                    } catch (e) {
                        console.warn('[Camera] Initial constraints not supported:', e);
                    }

                    // Get capabilities
                    const caps = videoTrack.getCapabilities() as ExtendedMediaTrackCapabilities;
                    capabilitiesRef.current = caps;
                    if (onCapabilitiesChange) onCapabilitiesChange(caps);

                    // Update hardware capabilities
                    setHardwareCapabilities({
                        zoom: !!caps.zoom,
                        panX: !!caps.pan,
                        panY: !!caps.tilt,
                        brightness: !!caps.brightness,
                        contrast: !!caps.contrast,
                        saturation: !!caps.saturation,
                    });
                }

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Unknown error');
                console.error('[Camera] Stream error:', error);
                setError(error.name === 'NotReadableError' ? 'Camera is in use.' : 'Could not start camera.');
            }
        };

        startStream();

        return () => {
            isCancelled = true;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [
        deviceId,
        settings.enableAudio,
        settings.noiseSuppression,
        settings.echoCancellation,
        settings.autoGainControl,
        settings.bandwidthSaver,
        settings.resolution,
        settings.customWidth,
        settings.customHeight,
        settings.frameRate,
        settings.facingMode,
        settings.audioDeviceId,
        settings.sampleRate,
        settings.channelCount,
        onCapabilitiesChange,
    ]);

    // Apply hardware constraints when settings change
    useEffect(() => {
        const applyHardware = async () => {
            const track = videoTrackRef.current;
            const caps = capabilitiesRef.current;
            if (!track || !caps) return;

            const advancedConstraint: ExtendedMediaTrackConstraintSet = {};
            let hasChanges = false;

            // Zoom
            if (hardwareCapabilities.zoom && caps.zoom) {
                advancedConstraint.zoom = mapRange(settings.zoom, 1, 3, caps.zoom.min, caps.zoom.max);
                hasChanges = true;
            }

            // Brightness, Contrast, Saturation
            if (hardwareCapabilities.brightness && caps.brightness) {
                advancedConstraint.brightness = mapRange(settings.brightness, 0, 200, caps.brightness.min, caps.brightness.max);
                hasChanges = true;
            }
            if (hardwareCapabilities.contrast && caps.contrast) {
                advancedConstraint.contrast = mapRange(settings.contrast, 0, 200, caps.contrast.min, caps.contrast.max);
                hasChanges = true;
            }
            if (hardwareCapabilities.saturation && caps.saturation) {
                advancedConstraint.saturation = mapRange(settings.saturation, 0, 200, caps.saturation.min, caps.saturation.max);
                hasChanges = true;
            }

            // Exposure
            if (caps.exposureMode && settings.exposureMode) {
                advancedConstraint.exposureMode = settings.exposureMode;
                hasChanges = true;
            }
            if (settings.exposureMode === 'manual' && caps.exposureTime && settings.exposureTime) {
                advancedConstraint.exposureTime = settings.exposureTime;
                hasChanges = true;
            }
            if (caps.exposureCompensation && settings.exposureCompensation) {
                advancedConstraint.exposureCompensation = settings.exposureCompensation;
                hasChanges = true;
            }

            // White Balance
            if (caps.whiteBalanceMode) {
                advancedConstraint.whiteBalanceMode = settings.whiteBalanceMode;
                hasChanges = true;
            }
            if (settings.whiteBalanceMode === 'manual' && caps.colorTemperature && settings.colorTemperature) {
                advancedConstraint.colorTemperature = settings.colorTemperature;
                hasChanges = true;
            }

            // Focus
            if (caps.focusMode) {
                advancedConstraint.focusMode = settings.focusMode;
                hasChanges = true;
            }
            if (settings.focusMode === 'manual' && caps.focusDistance && settings.focusDistance) {
                advancedConstraint.focusDistance = settings.focusDistance;
                hasChanges = true;
            }

            // ISO
            if (caps.iso && settings.iso) {
                advancedConstraint.iso = settings.iso;
                hasChanges = true;
            }

            // Sharpness
            if (caps.sharpness && settings.sharpness) {
                advancedConstraint.sharpness = settings.sharpness;
                hasChanges = true;
            }

            // Backlight Compensation
            if (caps.backlightCompensation !== undefined) {
                advancedConstraint.backlightCompensation = settings.backlightCompensation;
                hasChanges = true;
            }

            // Power Line Frequency
            if (caps.powerLineFrequency) {
                const freqMap: Record<string, number> = { 'disabled': 0, '50Hz': 50, '60Hz': 60 };
                advancedConstraint.powerLineFrequency = freqMap[settings.powerLineFrequency] ?? 0;
                hasChanges = true;
            }

            // Torch
            if (caps.torch !== undefined) {
                advancedConstraint.torch = settings.torch;
                hasChanges = true;
            }

            if (hasChanges) {
                const constraints: ExtendedMediaTrackConstraints = { advanced: [advancedConstraint] };
                try {
                    await track.applyConstraints(constraints as MediaTrackConstraints);
                } catch (e) {
                    console.warn('[Camera] Failed to apply hardware constraints:', e);
                }
            }
        };

        applyHardware();
    }, [
        hardwareCapabilities,
        settings.zoom,
        settings.panX,
        settings.panY,
        settings.brightness,
        settings.contrast,
        settings.saturation,
        settings.exposureMode,
        settings.exposureTime,
        settings.exposureCompensation,
        settings.whiteBalanceMode,
        settings.colorTemperature,
        settings.focusMode,
        settings.focusDistance,
        settings.iso,
        settings.sharpness,
        settings.backlightCompensation,
        settings.powerLineFrequency,
        settings.torch,
    ]);

    return {
        videoRef,
        streamRef,
        videoTrackRef,
        capabilitiesRef,
        hardwareCapabilities,
        error,
    };
}

export default useCameraStream;
