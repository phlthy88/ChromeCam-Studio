
export interface CameraSettings {
    // Light & Color
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: number;
    sepia: number;
    hue: number;
    
    // Exposure (Hardware)
    exposureMode: string; // 'continuous' | 'manual'
    exposureTime: number;
    exposureCompensation: number;
    
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

    // Conferencing
    enableAudio: boolean;
    noiseSuppression: boolean;
    bandwidthSaver: boolean;
}

export const DEFAULT_SETTINGS: CameraSettings = {
    brightness: 100, // 100% is default CSS filter
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    hue: 0,
    
    exposureMode: 'continuous',
    exposureTime: 0,
    exposureCompensation: 0,

    activeFilter: 'none',
    
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    mirror: false,
    blur: 0,
    portraitLighting: 0,
    faceSmoothing: 0,
    autoFrame: false,
    denoise: false,
    autoLowLight: false,
    virtualBackground: false,
    virtualBackgroundImage: null,
    qrMode: false,
    
    enableAudio: false,
    noiseSuppression: true,
    bandwidthSaver: false,
};
