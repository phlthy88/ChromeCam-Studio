
import React, { useEffect, useRef, useState } from 'react';
import { CameraSettings } from './settings';

declare global {
    interface Window {
        bodySegmentation: any;
        BarcodeDetector?: any;
        showSaveFilePicker?: (options?: any) => Promise<any>;
    }
}

interface VideoPanelProps {
    deviceId: string | null;
    settings: CameraSettings;
    onCapabilitiesChange?: (capabilities: MediaTrackCapabilities | null) => void;
}

// Constants to avoid GC in the render loop
const FOREGROUND_COLOR = { r: 255, g: 255, b: 255, a: 255 };
const BACKGROUND_COLOR = { r: 0, g: 0, b: 0, a: 0 };

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
        alpha: 0.15
    },
    honey: {
        css: 'contrast(1.0) saturate(1.3) sepia(0.4)',
        overlay: '#fcd34d',
        blend: 'soft-light',
        alpha: 0.2
    },
    clay: {
        css: 'contrast(0.9) saturate(0.7) sepia(0.3) brightness(1.05)',
        overlay: '#d6d3d1',
        blend: 'multiply',
        alpha: 0.15
    },
    amber: {
        css: 'contrast(1.15) saturate(1.2) sepia(0.5) hue-rotate(-10deg)',
        overlay: '#f59e0b',
        blend: 'overlay',
        alpha: 0.1
    },
    isla: {
        css: 'contrast(1.05) saturate(1.1) hue-rotate(10deg)',
        overlay: '#2dd4bf',
        blend: 'overlay',
        alpha: 0.15
    },
    blush: {
        css: 'contrast(1.0) saturate(1.1) sepia(0.15) hue-rotate(315deg)',
        overlay: '#fda4af',
        blend: 'soft-light',
        alpha: 0.15
    },
    prime: {
        css: 'contrast(1.2) saturate(1.2) brightness(1.05)',
    }
};

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
    ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

const saveFile = async (blob: Blob, filename: string, type: string) => {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'Media File', accept: { [type]: ['.' + filename.split('.').pop()] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) { console.log("File save cancelled or failed, falling back to download."); }
    }
    const link = document.createElement('a');
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
};

const VideoPanel: React.FC<VideoPanelProps> = ({ deviceId, settings, onCapabilitiesChange }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pipVideoRef = useRef<HTMLVideoElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    const [segmenter, setSegmenter] = useState<any>(null);
    const segmentationMaskRef = useRef<ImageData | null>(null);
    const requestRef = useRef<number | null>(null);
    const lowLightIntervalRef = useRef<any>(null);
    const currentTransformRef = useRef({ panX: 0, panY: 0, zoom: 1 });
    const targetTransformRef = useRef({ panX: 0, panY: 0, zoom: 1 });
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const capabilitiesRef = useRef<MediaTrackCapabilities | null>(null);
    const activeHardwareRef = useRef({
        zoom: false, panX: false, panY: false,
        brightness: false, contrast: false, saturation: false
    });
    const activeStreamRef = useRef<MediaStream | null>(null);
    const settingsRef = useRef(settings);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [aiRuntimeError, setAiRuntimeError] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState<string>('Initializing AI...');
    const [isAiActive, setIsAiActive] = useState(false);
    const [_autoGain, setAutoGain] = useState(0);
    const autoGainRef = useRef(0);
    const [isCompareActive, setIsCompareActive] = useState(false);
    const [flashActive, setFlashActive] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<any>(null);
    const [qrResult, setQrResult] = useState<string | null>(null);
    const barcodeDetectorRef = useRef<any>(null);

    useEffect(() => {
        settingsRef.current = settings;
        const isAiNeeded = settings.blur > 0 || settings.portraitLighting > 0 || settings.faceSmoothing > 0 || settings.autoFrame || settings.virtualBackground;
        if (!isAiNeeded) { setIsAiActive(false); segmentationMaskRef.current = null; }
    }, [settings]);

    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => { if ('wakeLock' in navigator) try { wakeLock = await (navigator as any).wakeLock.request('screen'); } catch (err) {} };
        requestWakeLock();
        const handleVisibilityChange = () => { if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock(); };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => { if (wakeLock !== null) wakeLock.release(); document.removeEventListener('visibilitychange', handleVisibilityChange); };
    }, []);

    useEffect(() => { if (window.BarcodeDetector) barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] }); }, []);

    useEffect(() => {
        const maskCanvas = document.createElement('canvas'); maskCanvasRef.current = maskCanvas; maskCtxRef.current = maskCanvas.getContext('2d', { willReadFrequently: true });
        const tempCanvas = document.createElement('canvas'); tempCanvasRef.current = tempCanvas; tempCtxRef.current = tempCanvas.getContext('2d', { willReadFrequently: true });
    }, []);

    useEffect(() => {
        let intervalId: any;
        const initAI = async () => {
            if (window.bodySegmentation) {
                 clearInterval(intervalId);
                 try {
                    const model = window.bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
                    const segmenterConfig = { runtime: 'mediapipe', solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/', modelType: 'general' };
                    const seg = await window.bodySegmentation.createSegmenter(model, segmenterConfig);
                    setSegmenter(seg); setLoadingStatus('AI Ready'); setLoadingError(null);
                 } catch(e) { setLoadingError("Failed to load AI Engine"); }
            }
        };
        intervalId = setInterval(initAI, 500);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (settings.virtualBackground && settings.virtualBackgroundImage) {
            const img = new Image(); img.src = settings.virtualBackgroundImage; img.onload = () => { bgImageRef.current = img; }; img.onerror = () => { bgImageRef.current = null; };
        } else { bgImageRef.current = null; }
    }, [settings.virtualBackground, settings.virtualBackgroundImage]);

    useEffect(() => {
        if (!settings.autoLowLight) { setAutoGain(0); autoGainRef.current = 0; if (lowLightIntervalRef.current) clearInterval(lowLightIntervalRef.current); return; }
        const analyzeBrightness = () => {
            const video = videoRef.current;
            if (!video || video.paused || video.readyState < 2) return;
            const sampleSize = 32; const canvas = document.createElement('canvas'); canvas.width = sampleSize; canvas.height = sampleSize;
            const ctx = canvas.getContext('2d'); if (!ctx) return;
            try {
                ctx.drawImage(video, video.videoWidth/2 - 16, video.videoHeight/2 - 16, 32, 32, 0, 0, 32, 32);
                const data = ctx.getImageData(0, 0, 32, 32).data;
                let totalLum = 0; for (let i = 0; i < data.length; i += 4) totalLum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i+1] ?? 0) + 0.0722 * (data[i+2] ?? 0);
                const avg = totalLum / 1024; const target = 110;
                let gain = 0; if (avg < target) gain = ((target - avg) / target) * 80;
                const prev = autoGainRef.current; const diff = gain - prev;
                if (Math.abs(diff) > 0.5) { const newValue = prev + diff * 0.1; autoGainRef.current = newValue; setAutoGain(newValue); }
            } catch(e) {}
        };
        lowLightIntervalRef.current = setInterval(analyzeBrightness, 500);
        return () => clearInterval(lowLightIntervalRef.current);
    }, [settings.autoLowLight]);

    useEffect(() => {
        let isCancelled = false;
        const startStream = async () => {
            if (deviceId) {
                try {
                    setIsAiActive(false);
                    activeHardwareRef.current = { zoom: false, panX: false, panY: false, brightness: false, contrast: false, saturation: false };
                    capabilitiesRef.current = null; videoTrackRef.current = null; if (onCapabilitiesChange) onCapabilitiesChange(null);
                    if (activeStreamRef.current) { activeStreamRef.current.getTracks().forEach(t => t.stop()); activeStreamRef.current = null; }
                    if (videoRef.current) videoRef.current.srcObject = null;
                    const widthIdeal = settings.bandwidthSaver ? 640 : 1280; const heightIdeal = settings.bandwidthSaver ? 480 : 720; const fpsIdeal = settings.bandwidthSaver ? 24 : 30;
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { deviceId: { exact: deviceId }, width: { ideal: widthIdeal }, height: { ideal: heightIdeal }, frameRate: { ideal: fpsIdeal }, pan: true, tilt: true, zoom: true } as any,
                        audio: settings.enableAudio ? { echoCancellation: true, noiseSuppression: settings.noiseSuppression, autoGainControl: true } : false
                    });
                    if (isCancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                    activeStreamRef.current = stream;
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrackRef.current = videoTrack;
                        try { await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }] } as any); } catch (e) {}
                        const caps = videoTrack.getCapabilities(); capabilitiesRef.current = caps; if (onCapabilitiesChange) onCapabilitiesChange(caps);
                        // @ts-ignore
                        activeHardwareRef.current.zoom = !!caps.zoom; activeHardwareRef.current.panX = !!caps.pan; activeHardwareRef.current.panY = !!caps.tilt; activeHardwareRef.current.brightness = !!caps.brightness; activeHardwareRef.current.contrast = !!caps.contrast; activeHardwareRef.current.saturation = !!caps.saturation;
                    }
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play().catch(_e => {});
                        videoRef.current.onloadedmetadata = () => { if (videoRef.current && canvasRef.current) { canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight; videoRef.current.width = videoRef.current.videoWidth; videoRef.current.height = videoRef.current.videoHeight; } };
                    }
                } catch (err: any) { setLoadingError(err.name === 'NotReadableError' ? "Camera is in use." : "Could not start camera."); }
            }
        };
        startStream();
        return () => { isCancelled = true; if (activeStreamRef.current) activeStreamRef.current.getTracks().forEach(track => track.stop()); };
    }, [deviceId, settings.enableAudio, settings.noiseSuppression, settings.bandwidthSaver]);

    useEffect(() => {
        const applyHardware = async () => {
            const track = videoTrackRef.current; const caps = capabilitiesRef.current; if (!track || !caps) return;
            const constraints: any = { advanced: [{}] }; let hasChanges = false;
             // @ts-ignore
            if (activeHardwareRef.current.zoom && caps.zoom) { constraints.advanced[0].zoom = mapRange(settings.zoom, 1, 3, caps.zoom.min, caps.zoom.max); hasChanges = true; }
             // @ts-ignore
            if (activeHardwareRef.current.brightness && caps.brightness) { constraints.advanced[0].brightness = mapRange(settings.brightness, 0, 200, caps.brightness.min, caps.brightness.max); hasChanges = true; }
             // @ts-ignore
            if (activeHardwareRef.current.contrast && caps.contrast) { constraints.advanced[0].contrast = mapRange(settings.contrast, 0, 200, caps.contrast.min, caps.contrast.max); hasChanges = true; }
             // @ts-ignore
            if (activeHardwareRef.current.saturation && caps.saturation) { constraints.advanced[0].saturation = mapRange(settings.saturation, 0, 200, caps.saturation.min, caps.saturation.max); hasChanges = true; }
            // @ts-ignore
            if (caps.exposureMode && settings.exposureMode) { constraints.advanced[0].exposureMode = settings.exposureMode; hasChanges = true; }
            // @ts-ignore
            if (settings.exposureMode === 'manual' && caps.exposureTime && settings.exposureTime) { constraints.advanced[0].exposureTime = settings.exposureTime; hasChanges = true; }
            // @ts-ignore
            if (caps.exposureCompensation && settings.exposureCompensation) { constraints.advanced[0].exposureCompensation = settings.exposureCompensation; hasChanges = true; }
            if (hasChanges) try { await track.applyConstraints(constraints); } catch (e) {}
        };
        applyHardware();
    }, [settings.zoom, settings.panX, settings.panY, settings.brightness, settings.contrast, settings.saturation, settings.exposureMode, settings.exposureTime, settings.exposureCompensation]);


    useEffect(() => {
        const maintainPip = async () => {
            if (canvasRef.current && pipVideoRef.current && activeStreamRef.current) {
                const video = pipVideoRef.current;
                if (!video.srcObject) { const stream = canvasRef.current.captureStream(30); video.srcObject = stream; }
                if (video.paused && video.readyState >= 2) try { await video.play(); } catch (e) { }
            }
        };
        const interval = setInterval(maintainPip, 1000); maintainPip(); return () => clearInterval(interval);
    }, [deviceId]);

    useEffect(() => {
        let isLoopActive = true; let timeoutId: any;
        const inferenceLoop = async () => {
            if (!isLoopActive) return;
            const video = videoRef.current;
            const { blur, portraitLighting, faceSmoothing, autoFrame, virtualBackground, qrMode } = settingsRef.current;
            const isAiNeeded = blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

            if (video && video.readyState >= 2 && !video.paused) {
                 try {
                     if (qrMode && barcodeDetectorRef.current && video.videoWidth > 0) {
                         try { const barcodes = await barcodeDetectorRef.current.detect(video); if (barcodes.length > 0) setQrResult(barcodes[0].rawValue); } catch (e) {}
                     } else if (!qrMode && qrResult) { setQrResult(null); }

                     if (isAiNeeded && segmenter && !aiRuntimeError && video.videoWidth > 0) {
                        const segmentation = await segmenter.segmentPeople(video);
                        const mask = await window.bodySegmentation.toBinaryMask(segmentation, FOREGROUND_COLOR, BACKGROUND_COLOR);
                        segmentationMaskRef.current = mask; setIsAiActive(true);

                        if (settingsRef.current.autoFrame) {
                            const width = mask.width; const height = mask.height; const data = mask.data;
                            let minX = width, maxX = 0, minY = height, maxY = 0; let found = false;
                            for (let y = 0; y < height; y += 8) {
                                for (let x = 0; x < width; x += 8) {
                                     if (data[(y * width + x) * 4] > 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; found = true; }
                                }
                            }
                            if (found) {
                                const boxCenterX = (minX + maxX) / 2; const boxHeight = maxY - minY;
                                // Focus on the face/head area (upper ~25% of detected body) instead of body center
                                const faceY = minY + boxHeight * 0.25;
                                const centerXPercent = boxCenterX / width; const faceYPercent = faceY / height;
                                const targetPanX = (0.5 - centerXPercent) * 100; const targetPanY = (0.5 - faceYPercent) * 100;
                                let targetZoom = (height * 0.6) / boxHeight; targetZoom = Math.max(1, Math.min(targetZoom, 2.5));
                                targetTransformRef.current = { panX: targetPanX, panY: targetPanY, zoom: targetZoom };
                            }
                        } else { targetTransformRef.current = { panX: 0, panY: 0, zoom: 1 }; }
                     } else if (!isAiNeeded) { segmentationMaskRef.current = null; setIsAiActive(false); }
                } catch (e) { setAiRuntimeError(true); }
            }
            if (isLoopActive) timeoutId = setTimeout(inferenceLoop, 33);
        };
        inferenceLoop(); return () => { isLoopActive = false; clearTimeout(timeoutId); };
    }, [segmenter, aiRuntimeError]);

    useEffect(() => {
        let isLoopActive = true;
        const processVideo = () => {
            if (!isLoopActive) return;
            const video = videoRef.current; const canvas = canvasRef.current; const ctx = canvas?.getContext('2d', { alpha: false });
            const maskCanvas = maskCanvasRef.current; const maskCtx = maskCtxRef.current; const tempCanvas = tempCanvasRef.current; const tempCtx = tempCtxRef.current;
            const bgImage = bgImageRef.current;
            const { blur, portraitLighting, faceSmoothing, autoFrame, denoise, mirror, rotation, virtualBackground, activeFilter } = settingsRef.current;
            const filterPreset = FILTER_PRESETS[activeFilter] || FILTER_PRESETS['none'];

            if (autoFrame) {
                const speed = 0.05;
                currentTransformRef.current.panX = lerp(currentTransformRef.current.panX, targetTransformRef.current.panX, speed);
                currentTransformRef.current.panY = lerp(currentTransformRef.current.panY, targetTransformRef.current.panY, speed);
                currentTransformRef.current.zoom = lerp(currentTransformRef.current.zoom, targetTransformRef.current.zoom, speed);
            } else {
                const effectiveZoom = activeHardwareRef.current.zoom ? 1 : settingsRef.current.zoom;
                const effectivePanX = activeHardwareRef.current.panX ? 0 : settingsRef.current.panX;
                const effectivePanY = activeHardwareRef.current.panY ? 0 : settingsRef.current.panY;
                currentTransformRef.current = { panX: effectivePanX, panY: effectivePanY, zoom: effectiveZoom };
            }
            const { panX, panY, zoom } = currentTransformRef.current;

            if (canvas && ctx && video && video.readyState >= 2) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { [canvas, tempCanvas, video].forEach(el => { if(el) { el.width = video.videoWidth; el.height = video.videoHeight; }}); }
                ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (isCompareActive) { ctx.drawImage(video, 0, 0); } else {
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    if (mirror) ctx.scale(-1, 1);
                    ctx.scale(zoom, zoom);
                    ctx.rotate((rotation * Math.PI) / 180);
                    const xOffset = (panX / 100) * canvas.width; const yOffset = (panY / 100) * canvas.height;
                    ctx.translate(xOffset, yOffset); ctx.translate(-canvas.width / 2, -canvas.height / 2);

                    let baseFilter = '';
                    if (denoise) { const contrastBoost = activeHardwareRef.current.contrast ? '100%' : '105%'; baseFilter += `blur(0.5px) contrast(${contrastBoost}) `; }
                    const effectiveContrast = activeHardwareRef.current.contrast ? 100 : settingsRef.current.contrast;
                    const effectiveSaturation = activeHardwareRef.current.saturation ? 100 : settingsRef.current.saturation;
                    const effectiveBrightness = activeHardwareRef.current.brightness ? 100 : settingsRef.current.brightness;
                    const totalBrightness = effectiveBrightness + autoGainRef.current;
                    baseFilter += `brightness(${totalBrightness}%) contrast(${effectiveContrast}%) saturate(${effectiveSaturation}%) grayscale(${settingsRef.current.grayscale}%) sepia(${settingsRef.current.sepia}%) hue-rotate(${settingsRef.current.hue}deg) `;
                    if (filterPreset) baseFilter += filterPreset.css;

                    const segmentationMask = segmentationMaskRef.current;
                    const isAiNeeded = blur > 0 || portraitLighting > 0 || faceSmoothing > 0 || autoFrame || virtualBackground;

                    if (isAiNeeded && segmentationMask && maskCanvas && maskCtx && tempCanvas && tempCtx) {
                        if (maskCanvas.width !== segmentationMask.width) { maskCanvas.width = segmentationMask.width; maskCanvas.height = segmentationMask.height; }
                        maskCtx.putImageData(segmentationMask, 0, 0);
                        ctx.globalCompositeOperation = 'source-over';
                        if (virtualBackground && bgImage) { ctx.filter = (blur > 0) ? `blur(${blur}px) ${baseFilter}` : baseFilter; ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height); }
                        else { ctx.filter = (blur > 0) ? `blur(${blur}px) ${baseFilter}` : baseFilter; ctx.drawImage(video, 0, 0); }
                        ctx.filter = 'none';

                        if (portraitLighting > 0 && !virtualBackground) { const dimVal = (portraitLighting / 100) * 0.6; ctx.fillStyle = `rgba(0,0,0,${dimVal})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

                        tempCtx.setTransform(1, 0, 0, 1, 0, 0); tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tempCtx.globalCompositeOperation = 'source-over'; tempCtx.filter = 'blur(4px)';
                        tempCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height); tempCtx.filter = 'none';
                        tempCtx.globalCompositeOperation = 'source-in'; tempCtx.filter = baseFilter; tempCtx.drawImage(video, 0, 0); tempCtx.filter = 'none';

                        if (faceSmoothing > 0) { tempCtx.globalCompositeOperation = 'screen'; const smoothAmt = (faceSmoothing / 100) * 10; tempCtx.filter = `blur(${smoothAmt}px) brightness(1.1)`; tempCtx.globalAlpha = 0.6; tempCtx.drawImage(tempCanvas, 0, 0); tempCtx.globalAlpha = 1.0; tempCtx.filter = 'none'; }

                        ctx.globalCompositeOperation = 'source-over';
                        // Draw subject without shadow effects to avoid shadow focal points behind the figure
                        ctx.drawImage(tempCanvas, 0, 0);
                    } else { ctx.filter = baseFilter || 'none'; ctx.drawImage(video, 0, 0); ctx.filter = 'none'; }

                    if (filterPreset?.overlay) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = filterPreset.blend || 'overlay'; ctx.globalAlpha = filterPreset.alpha || 0.2; ctx.fillStyle = filterPreset.overlay; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0; }
                }
            }
            if (isLoopActive) requestRef.current = requestAnimationFrame(processVideo);
        };
        requestRef.current = requestAnimationFrame(processVideo);
        return () => { isLoopActive = false; if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [isAiActive, isCompareActive]);

    const handleSnapshot = async () => {
        if (canvasRef.current) {
            setFlashActive(true); setTimeout(() => setFlashActive(false), 150);
            canvasRef.current.toBlob(async (blob) => { if (!blob) return; await saveFile(blob, `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, 'image/png'); }, 'image/png');
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { mediaRecorderRef.current.stop(); }
            clearInterval(recordingTimerRef.current); setIsRecording(false);
        } else {
            if (!canvasRef.current) return; recordedChunksRef.current = []; const stream = canvasRef.current.captureStream(30);
            if (activeStreamRef.current && settings.enableAudio) { const audioTracks = activeStreamRef.current.getAudioTracks(); const firstTrack = audioTracks[0]; if (firstTrack) stream.addTrack(firstTrack); }
            try {
                const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
                recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };
                recorder.onstop = async () => { const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' }); await saveFile(blob, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, 'video/webm'); };
                recorder.start(); mediaRecorderRef.current = recorder; setIsRecording(true); setRecordingTime(0);
                recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
            } catch (e) { console.error("Recording failed", e); }
        }
    };
    const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${mins}:${secs < 10 ? '0' : ''}${secs}`; };
    const togglePiP = async () => {
        const video = pipVideoRef.current; if (!video) return;
        try { if (document.pictureInPictureElement) { await document.exitPictureInPicture(); } else { if (video.readyState === 0) await new Promise((resolve) => { video.onloadedmetadata = resolve; }); if (video.paused) await video.play(); await video.requestPictureInPicture(); } } catch (err) { }
    };

    return (
        <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden relative group">
            {/* Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-10 z-20 transition-opacity duration-500">
                <div className="w-full h-full grid grid-cols-3 grid-rows-3"> {[...Array(9)].map((_, i) => <div key={i} className="border border-white/20"></div>)} </div>
            </div>

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
                    <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-high text-on-surface rounded-full shadow-elevation-3 cursor-pointer" onClick={() => { navigator.clipboard.writeText(qrResult); alert('Copied'); }}>
                        <span className="font-medium text-sm truncate max-w-[200px]">{qrResult}</span>
                    </div>
                </div>
            )}

            {/* Loading Status */}
            {settingsRef.current && (settingsRef.current.blur > 0 || settingsRef.current.portraitLighting > 0 || settingsRef.current.faceSmoothing > 0) && !isAiActive && !loadingError && !isCompareActive && (
                <div className="absolute z-30 text-on-surface-variant bg-surface-container/90 px-4 py-2 rounded-full backdrop-blur-sm animate-pulse flex items-center gap-2">
                    <span className="text-sm font-medium">{loadingStatus}</span>
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
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>

                        {/* Record: Large FAB */}
                        <button onClick={toggleRecording} className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-300 shadow-elevation-2 hover:shadow-elevation-4 active:scale-95 ${isRecording ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`} title={isRecording ? "Stop Recording" : "Start Recording"}>
                            <div className={`transition-all duration-300 ${isRecording ? 'w-6 h-6 bg-current rounded-sm' : 'w-4 h-4 bg-current rounded-full scale-150'}`}></div>
                        </button>
                    </div>

                    {/* Secondary Actions (Right) */}
                    <div className="flex items-center gap-2">
                        <button
                            onMouseDown={() => setIsCompareActive(true)} onMouseUp={() => setIsCompareActive(false)} onMouseLeave={() => setIsCompareActive(false)} onTouchStart={() => setIsCompareActive(true)} onTouchEnd={() => setIsCompareActive(false)}
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

            <video ref={videoRef} autoPlay playsInline muted={true} crossOrigin="anonymous" className="absolute opacity-0 pointer-events-none" />
            <canvas ref={canvasRef} className="relative z-10 w-full h-full object-contain" />
            <video ref={pipVideoRef} className="fixed top-0 left-0 opacity-0 pointer-events-none h-1 w-1" muted playsInline />
        </div>
    );
};

export default VideoPanel;
