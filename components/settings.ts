
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
