
import React, { useEffect, useRef, useState } from 'react';

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

                const draw = () => {
                    if (!analyser || !canvasRef.current) return;
                    
                    analyser.getByteFrequencyData(dataArray);
                    
                    // Calculate RMS (Root Mean Square) for better volume approximation
                    let sum = 0;
                    for(let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i] * dataArray[i];
                    }
                    const rms = Math.sqrt(sum / bufferLength);
                    
                    // Normalize (rms usually 0-128ish for normal speech)
                    // Scale to 0-100 range with some boost
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

                    // Draw bars
                    for (let i = 0; i < bars; i++) {
                        const x = i * (barWidth + gap);
                        const threshold = (i + 1) * (100 / bars);
                        const isActive = volume >= (threshold - (100/bars)/2); // simpler threshold
                        
                        let color = isActive 
                            ? (i < bars * 0.6 ? '#4ade80' : i < bars * 0.85 ? '#facc15' : '#f87171') // green-400, yellow-400, red-400
                            : '#e2e8f0'; // slate-200 (light mode inactive)

                        // Dark mode check helper - naive check for simplicity in loop
                        // ideally passed via context or css variable usage
                        if (!isActive && document.documentElement.classList.contains('dark')) {
                            color = '#334155'; // slate-700
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
        <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-700 transition-colors">
            <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <canvas ref={canvasRef} width={80} height={10} className="block" />
        </div>
    );
};

export default VUMeter;
