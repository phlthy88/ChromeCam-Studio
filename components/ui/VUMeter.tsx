import React, { useEffect, useRef, useState } from 'react';
import {
  getAudioContext,
  isAudioContextSupported,
  calculateRMSVolume,
  getCSSProperty,
  VU_METER_CONFIG,
  VU_METER_COLORS,
} from '../../utils/audio';

interface VUMeterProps {
  /** Optional existing audio stream to use instead of creating a new one */
  audioStream?: MediaStream;
}

/**
 * Material 3 Audio Level Meter
 *
 * Visual indicator for microphone input levels.
 * Uses M3 color tokens for theming and shared AudioContext for efficiency.
 *
 * Improvements over original:
 * - Uses shared AudioContext singleton (avoids browser limits)
 * - Can accept existing audio stream (avoids duplicate getUserMedia calls)
 * - Properly disconnects audio nodes on unmount
 * - Extracts magic numbers to constants
 */
const VUMeter: React.FC<VUMeterProps> = ({ audioStream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const requestRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const ownStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isAudioContextSupported()) {
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
          // Component unmounted during async operation
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
        // Note: We don't connect to destination to avoid feedback

        analyserRef.current = analyser;
        sourceRef.current = source;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Get M3 inactive color from CSS
        const colorInactive = getCSSProperty(
          '--md-sys-color-outline-variant',
          VU_METER_COLORS.INACTIVE_FALLBACK
        );

        const draw = () => {
          if (!isActive || !analyserRef.current || !canvasRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);

          const volume = calculateRMSVolume(dataArray);

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          const width = canvas.width;
          const height = canvas.height;
          const { BARS, GAP, GREEN_THRESHOLD, YELLOW_THRESHOLD } = VU_METER_CONFIG;
          const barWidth = (width - (BARS - 1) * GAP) / BARS;

          ctx.clearRect(0, 0, width, height);

          // Draw bars
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
      } catch (_e) {
        setActive(false);
      }
    };

    initAudio();

    return () => {
      isActive = false;

      // Cancel animation frame
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }

      // Disconnect audio nodes (important for memory cleanup)
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      analyserRef.current = null;

      // Stop our own stream if we created one
      if (ownStreamRef.current) {
        ownStreamRef.current.getTracks().forEach((track) => track.stop());
        ownStreamRef.current = null;
      }
    };
  }, [audioStream]);

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
