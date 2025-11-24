import React, { useEffect, useRef, useState } from 'react';
import {
    getAudioContext,
    isAudioContextSupported,
    calculateRMSVolume,
    getCSSProperty,
    VU_METER_CONFIG,
    VU_METER_COLORS,
} from '../../utils/audio';
import Toggle from './Toggle';
import Chip from './Chip';
import { CameraSettings } from '../settings';

interface MicrophoneWidgetProps {
    settings: CameraSettings;
    onSettingsChange: (settings: CameraSettings) => void;
    audioDevices?: MediaDeviceInfo[];
    audioStream?: MediaStream;
}

/**
 * Comprehensive Microphone Widget
 *
 * Combines:
 * - On/Off toggle
 * - VU Meter volume indicator
 * - Dropdown with all microphone settings
 */
const MicrophoneWidget: React.FC<MicrophoneWidgetProps> = ({
    settings,
    onSettingsChange,
    audioDevices,
    audioStream,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [active, setActive] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const ownStreamRef = useRef<MediaStream | null>(null);

    const update = (key: keyof CameraSettings, value: unknown) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // VU Meter logic
    useEffect(() => {
        if (!settings.enableAudio || !isAudioContextSupported()) {
            setActive(false);
            return;
        }

        let isActive = true;

        const initAudio = async () => {
            try {
                const audioContext = getAudioContext();

                // Use provided stream or create our own
                let stream: MediaStream;
                if (audioStream) {
                    stream = audioStream;
                } else {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    ownStreamRef.current = stream;
                }

                if (!isActive) {
                    if (ownStreamRef.current) {
                        ownStreamRef.current.getTracks().forEach((track) => track.stop());
                        ownStreamRef.current = null;
                    }
                    return;
                }

                setActive(true);

                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);

                analyser.fftSize = VU_METER_CONFIG.FFT_SIZE;
                analyser.smoothingTimeConstant = VU_METER_CONFIG.SMOOTHING;

                source.connect(analyser);

                analyserRef.current = analyser;
                sourceRef.current = source;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const colorInactive = getCSSProperty(
                    '--md-sys-color-outline-variant',
                    VU_METER_COLORS.INACTIVE_FALLBACK
                );

                const draw = () => {
                    if (!isActive || !analyserRef.current || !canvasRef.current) return;

                    analyserRef.current.getByteFrequencyData(dataArray);

                    const volume = calculateRMSVolume(dataArray);

                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    const width = canvas.width;
                    const height = canvas.height;
                    const { BARS, GAP, GREEN_THRESHOLD, YELLOW_THRESHOLD } = VU_METER_CONFIG;
                    const barWidth = (width - (BARS - 1) * GAP) / BARS;

                    ctx.clearRect(0, 0, width, height);

                    for (let i = 0; i < BARS; i++) {
                        const x = i * (barWidth + GAP);
                        const threshold = (i + 1) * (100 / BARS);
                        const isBarActive = volume >= threshold - 100 / BARS / 2;

                        let color: string;
                        if (isBarActive) {
                            if (i < BARS * GREEN_THRESHOLD) {
                                color = VU_METER_COLORS.LOW;
                            } else if (i < BARS * YELLOW_THRESHOLD) {
                                color = VU_METER_COLORS.MID;
                            } else {
                                color = VU_METER_COLORS.HIGH;
                            }
                        } else {
                            color = colorInactive;
                        }

                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.roundRect(x, 0, barWidth, height, 2);
                        ctx.fill();
                    }

                    requestRef.current = requestAnimationFrame(draw);
                };

                draw();
            } catch (e) {
                console.log('Microphone Widget: Audio permission denied or error', e);
                setActive(false);
            }
        };

        initAudio();

        return () => {
            isActive = false;

            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = null;
            }

            if (sourceRef.current) {
                sourceRef.current.disconnect();
                sourceRef.current = null;
            }
            analyserRef.current = null;

            if (ownStreamRef.current) {
                ownStreamRef.current.getTracks().forEach((track) => track.stop());
                ownStreamRef.current = null;
            }
        };
    }, [settings.enableAudio, audioStream]);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Main Widget Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="
                    flex items-center gap-2
                    px-3 py-2
                    bg-surface-container rounded-full
                    border border-outline-variant
                    hover:bg-surface-container-high
                    transition-all duration-short2 ease-standard
                "
                title={settings.enableAudio ? "Microphone On - Click for settings" : "Microphone Off - Click to enable"}
            >
                {/* Microphone Icon with toggle state */}
                <svg
                    className={`w-4 h-4 ${settings.enableAudio ? 'text-on-surface' : 'text-error'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    {settings.enableAudio ? (
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                    ) : (
                        <>
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                            />
                            <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
                        </>
                    )}
                </svg>

                {/* VU Meter (only show when audio enabled) */}
                {settings.enableAudio && active && (
                    <canvas
                        ref={canvasRef}
                        width={80}
                        height={10}
                        className="block"
                        aria-label="Audio level meter"
                    />
                )}

                {/* Chevron */}
                <svg
                    className={`w-4 h-4 text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    className="
                        absolute right-0 top-full mt-2
                        w-80 max-h-[80vh] overflow-y-auto
                        bg-surface-container rounded-xl
                        border border-outline-variant
                        shadow-elevation-3
                        z-50
                        p-4
                    "
                >
                    <div className="space-y-5">
                        {/* Enable/Disable Toggle */}
                        <Toggle
                            label="Enable Microphone"
                            enabled={settings.enableAudio}
                            onChange={(v) => update('enableAudio', v)}
                        />

                        <div
                            className={`space-y-5 transition-opacity ${settings.enableAudio ? 'opacity-100' : 'opacity-[0.38] pointer-events-none'}`}
                        >
                            {/* Microphone Selection */}
                            {audioDevices && audioDevices.length > 0 && (
                                <div>
                                    <label className="md-label-large text-on-surface mb-2 block">Microphone</label>
                                    <div className="relative">
                                        <select
                                            value={settings.audioDeviceId || ''}
                                            onChange={(e) => update('audioDeviceId', e.target.value || null)}
                                            className="w-full appearance-none bg-surface-container-highest hover:bg-surface-high text-on-surface md-body-medium rounded-xl py-2.5 px-3 pr-8 border border-outline-variant/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/15 outline-none cursor-pointer transition-all"
                                        >
                                            <option value="">Default Microphone</option>
                                            {audioDevices.map((device, idx) => (
                                                <option key={device.deviceId} value={device.deviceId}>
                                                    {device.label || `Microphone ${idx + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Audio Processing */}
                            <Toggle
                                label="Noise Suppression"
                                enabled={settings.noiseSuppression}
                                onChange={(v) => update('noiseSuppression', v)}
                            />

                            <Toggle
                                label="Echo Cancellation"
                                enabled={settings.echoCancellation}
                                onChange={(v) => update('echoCancellation', v)}
                            />

                            <Toggle
                                label="Auto Gain Control"
                                enabled={settings.autoGainControl}
                                onChange={(v) => update('autoGainControl', v)}
                            />

                            {/* Sample Rate */}
                            <div className="pt-4 border-t border-outline-variant">
                                <label className="md-label-large text-on-surface mb-3 block">Sample Rate</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[8000, 16000, 24000, 48000].map((rate) => (
                                        <Chip
                                            key={rate}
                                            label={`${rate / 1000}kHz`}
                                            selected={settings.sampleRate === rate}
                                            onClick={() => update('sampleRate', rate)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Channel Count */}
                            <div>
                                <label className="md-label-large text-on-surface mb-3 block">Channels</label>
                                <div className="flex gap-2">
                                    <Chip label="Mono" selected={settings.channelCount === 1} onClick={() => update('channelCount', 1)} />
                                    <Chip label="Stereo" selected={settings.channelCount === 2} onClick={() => update('channelCount', 2)} />
                                </div>
                            </div>

                            {/* Bandwidth Saver */}
                            <Toggle
                                label="Bandwidth Saver"
                                enabled={settings.bandwidthSaver}
                                onChange={(v) => update('bandwidthSaver', v)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MicrophoneWidget;
