import React, { useEffect, useRef, useState } from 'react';

/**
 * Material 3 Audio Level Meter
 *
 * Visual indicator for microphone input levels
 * Uses M3 color tokens for theming
 */
const VUMeter: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [active, setActive] = useState(false);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        let audioContext: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        let microphone: MediaStreamAudioSourceNode | null = null;
        let stream: MediaStream | null = null;

        const initAudio = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setActive(true);

                audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                microphone = audioContext.createMediaStreamSource(stream);

                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.5;

                microphone.connect(analyser);

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                // Get CSS custom properties for M3 colors
                const getColor = (property: string, fallback: string) => {
                    return getComputedStyle(document.documentElement)
                        .getPropertyValue(property).trim() || fallback;
                };

                const draw = () => {
                    if (!analyser || !canvasRef.current) return;

                    analyser.getByteFrequencyData(dataArray);

                    // Calculate RMS for volume approximation
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        const value = dataArray[i] ?? 0;
                        sum += value * value;
                    }
                    const rms = Math.sqrt(sum / bufferLength);
                    const volume = Math.min(100, (rms / 128) * 100 * 1.5);

                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;

                    const width = canvas.width;
                    const height = canvas.height;
                    const bars = 12;
                    const gap = 2;
                    const barWidth = (width - ((bars - 1) * gap)) / bars;

                    ctx.clearRect(0, 0, width, height);

                    // M3 color scheme for bars
                    const colorLow = '#4ade80';      // Green (safe levels)
                    const colorMid = '#facc15';      // Yellow (moderate)
                    const colorHigh = '#f87171';     // Red (peak)
                    const colorInactive = getColor('--md-sys-color-outline-variant', '#cac4d0');

                    // Draw bars
                    for (let i = 0; i < bars; i++) {
                        const x = i * (barWidth + gap);
                        const threshold = (i + 1) * (100 / bars);
                        const isActive = volume >= (threshold - (100 / bars) / 2);

                        let color: string;
                        if (isActive) {
                            if (i < bars * 0.6) {
                                color = colorLow;
                            } else if (i < bars * 0.85) {
                                color = colorMid;
                            } else {
                                color = colorHigh;
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
                console.log("VU Meter: Audio permission denied or error", e);
                setActive(false);
            }
        };

        initAudio();

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (audioContext) audioContext.close();
        };
    }, []);

    if (!active) return null;

    return (
        <div
            className="
                hidden md:flex items-center gap-2
                px-3 py-2
                bg-surface-container rounded-full
                border border-outline-variant
                transition-colors duration-short2 ease-standard
            "
        >
            {/* Microphone Icon */}
            <svg
                className="w-4 h-4 text-on-surface-variant"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
            </svg>

            {/* Level Canvas */}
            <canvas
                ref={canvasRef}
                width={80}
                height={10}
                className="block"
                aria-label="Audio level meter"
            />
        </div>
    );
};

export default VUMeter;
