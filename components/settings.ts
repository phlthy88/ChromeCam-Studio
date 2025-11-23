
export interface CameraSettings {
    // Light & Color
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: number;
    sepia: number;
    hue: number;
    sharpness: number;

    // Exposure (Hardware)
    exposureMode: string; // 'continuous' | 'manual'
    exposureTime: number;
    exposureCompensation: number;

    // White Balance (Hardware)
    whiteBalanceMode: string; // 'continuous' | 'manual'
    colorTemperature: number; // Kelvin (2800K-6500K)

    // Focus Control (Hardware)
    focusMode: string; // 'continuous' | 'manual' | 'single-shot'
    focusDistance: number;

    // Additional Hardware Controls
    iso: number; // Sensor gain
    backlightCompensation: boolean;
    powerLineFrequency: string; // 'disabled' | '50Hz' | '60Hz'
    torch: boolean; // Flash/torch control

    // Visual Filter Preset
    activeFilter: string; // 'none', 'playa', 'honey', 'clay', etc.

    // Geometry (Digital PTZ)
    zoom: number;
    panX: number;
    panY: number;
    rotation: number;
    mirror: boolean;

    // Effects
    blur: number;
    portraitLighting: number; // 0-100 (Studio Light effect)
    faceSmoothing: number; // 0-100 (Beauty/Soft focus)
    vignette: number; // 0-100 (Vignette intensity)
    softwareSharpness: number; // 0-100 (Software-based sharpening)

    // Cinematic Color Grading (WebGL)
    cinematicLut: string; // LUT preset ID ('none', 'teal-orange', etc.)
    cinematicLutIntensity: number; // 0-100 (LUT blend intensity)

    // AI/System
    autoFrame: boolean;
    denoise: boolean;
    autoLowLight: boolean;
    virtualBackground: boolean;
    virtualBackgroundImage: string | null; // Data URL
    qrMode: boolean; // QR/Barcode Scanning

    // Conferencing / Audio
    enableAudio: boolean;
    noiseSuppression: boolean;
    bandwidthSaver: boolean;
    audioDeviceId: string | null; // Microphone selection
    echoCancellation: boolean;
    autoGainControl: boolean;
    sampleRate: number; // 44100 | 48000
    channelCount: number; // 1 (mono) | 2 (stereo)

    // Audio Processor (Web Audio API)
    audioCompressorEnabled: boolean;
    audioCompressorThreshold: number; // dB (-100 to 0)
    audioCompressorKnee: number; // dB (0 to 40)
    audioCompressorRatio: number; // 1 to 20
    audioCompressorAttack: number; // seconds (0 to 1)
    audioCompressorRelease: number; // seconds (0 to 1)
    audioNoiseGateEnabled: boolean;
    audioNoiseGateThreshold: number; // dB (-100 to 0)
    audioNoiseGateAttack: number; // seconds (0 to 0.5)
    audioNoiseGateRelease: number; // seconds (0 to 1)

    // Resolution & Stream
    resolution: string; // '720p' | '1080p' | '4k' | 'custom'
    customWidth: number;
    customHeight: number;
    frameRate: number; // 15 | 24 | 30 | 60
    aspectRatioLock: string; // 'none' | '4:3' | '16:9' | '1:1'
    facingMode: string; // 'user' | 'environment'

    // Recording
    videoCodec: string; // 'vp8' | 'vp9' | 'h264' | 'av1'
    audioCodec: string; // 'opus' | 'aac'
    videoBitrate: number; // Mbps (1-50)
    audioBitrate: number; // kbps (64-320)

    // Overlays
    gridOverlay: string; // 'none' | 'thirds' | 'center' | 'golden' | 'safe'
    showHistogram: boolean;
    showZebraStripes: boolean;
    zebraThreshold: number; // 90-100%
    showFocusPeaking: boolean;
    focusPeakingColor: string; // 'red' | 'green' | 'blue' | 'white'
}

export const DEFAULT_SETTINGS: CameraSettings = {
    // Light & Color
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    hue: 0,
    sharpness: 0,

    // Exposure
    exposureMode: 'continuous',
    exposureTime: 0,
    exposureCompensation: 0,

    // White Balance
    whiteBalanceMode: 'continuous',
    colorTemperature: 4500,

    // Focus
    focusMode: 'continuous',
    focusDistance: 0,

    // Additional Hardware
    iso: 0,
    backlightCompensation: false,
    powerLineFrequency: 'disabled',
    torch: false,

    // Filters
    activeFilter: 'none',

    // Geometry
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    mirror: false,

    // Effects
    blur: 0,
    portraitLighting: 0,
    faceSmoothing: 0,
    vignette: 0,
    softwareSharpness: 0,

    // Cinematic Color Grading (WebGL)
    cinematicLut: 'none',
    cinematicLutIntensity: 100,

    // AI/System
    autoFrame: false,
    denoise: false,
    autoLowLight: false,
    virtualBackground: false,
    virtualBackgroundImage: null,
    qrMode: false,

    // Audio
    enableAudio: false,
    noiseSuppression: true,
    bandwidthSaver: false,
    audioDeviceId: null,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,

    // Audio Processor
    audioCompressorEnabled: false,
    audioCompressorThreshold: -24,
    audioCompressorKnee: 12,
    audioCompressorRatio: 4,
    audioCompressorAttack: 0.003,
    audioCompressorRelease: 0.25,
    audioNoiseGateEnabled: false,
    audioNoiseGateThreshold: -50,
    audioNoiseGateAttack: 0.005,
    audioNoiseGateRelease: 0.1,

    // Resolution & Stream
    resolution: '720p',
    customWidth: 1280,
    customHeight: 720,
    frameRate: 30,
    aspectRatioLock: 'none',
    facingMode: 'user',

    // Recording
    videoCodec: 'vp9',
    audioCodec: 'opus',
    videoBitrate: 8,
    audioBitrate: 128,

    // Overlays
    gridOverlay: 'none',
    showHistogram: false,
    showZebraStripes: false,
    zebraThreshold: 95,
    showFocusPeaking: false,
    focusPeakingColor: 'red',
};

// Resolution presets
export const RESOLUTION_PRESETS: Record<string, { width: number; height: number; label: string }> = {
    '480p': { width: 640, height: 480, label: '480p (SD)' },
    '720p': { width: 1280, height: 720, label: '720p (HD)' },
    '1080p': { width: 1920, height: 1080, label: '1080p (Full HD)' },
    '4k': { width: 3840, height: 2160, label: '4K (UHD)' },
    'custom': { width: 0, height: 0, label: 'Custom' },
};

// Frame rate presets
export const FRAME_RATE_PRESETS = [15, 24, 30, 60];

// Supported video codecs
export const VIDEO_CODECS = [
    { id: 'vp8', label: 'VP8', mimeType: 'video/webm;codecs=vp8' },
    { id: 'vp9', label: 'VP9', mimeType: 'video/webm;codecs=vp9' },
    { id: 'h264', label: 'H.264', mimeType: 'video/mp4;codecs=avc1' },
    { id: 'av1', label: 'AV1', mimeType: 'video/webm;codecs=av01' },
];

// Audio codecs
export const AUDIO_CODECS = [
    { id: 'opus', label: 'Opus' },
    { id: 'aac', label: 'AAC' },
];

// Grid overlay types
export const GRID_OVERLAYS = [
    { id: 'none', label: 'None' },
    { id: 'thirds', label: 'Rule of Thirds' },
    { id: 'center', label: 'Center Cross' },
    { id: 'golden', label: 'Golden Ratio' },
    { id: 'safe', label: 'Safe Zones' },
];

// Aspect ratio presets with their numeric values
export const ASPECT_RATIO_PRESETS = [
    { id: 'none', label: 'Free', ratio: null },
    { id: '4:3', label: '4:3', ratio: 4 / 3 },
    { id: '16:9', label: '16:9', ratio: 16 / 9 },
    { id: '1:1', label: '1:1', ratio: 1 },
    { id: '21:9', label: '21:9', ratio: 21 / 9 },
    { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

// Detected camera capabilities interface
export interface DetectedCapabilities {
    maxResolution: { width: number; height: number } | null;
    supportedResolutions: Array<{ width: number; height: number; label: string }>;
    maxFrameRate: number | null;
    supportedFrameRates: number[];
    supportedAspectRatios: string[];
    hasAutoExposure: boolean;
    hasAutoFocus: boolean;
    hasAutoWhiteBalance: boolean;
    hasTorch: boolean;
    hasZoom: boolean;
    hasPan: boolean;
    hasTilt: boolean;
    hasBacklightCompensation: boolean;
}
