/**
 * Audio Utilities for ChromeCam Studio
 *
 * Provides a singleton AudioContext and utilities for audio processing.
 * This avoids creating multiple AudioContexts (browsers limit these)
 * and provides consistent audio handling across the application.
 */

// Singleton AudioContext instance
let audioContextInstance: AudioContext | null = null;

/**
 * Get or create the shared AudioContext instance.
 * Handles the webkit prefix for Safari compatibility.
 *
 * @returns The shared AudioContext instance
 */
export function getAudioContext(): AudioContext {
    if (!audioContextInstance) {
        const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextClass) {
            throw new Error('AudioContext is not supported in this browser');
        }

        audioContextInstance = new AudioContextClass();
    }

    // Resume if suspended (required after user interaction on some browsers)
    if (audioContextInstance.state === 'suspended') {
        audioContextInstance.resume().catch(console.warn);
    }

    return audioContextInstance;
}

/**
 * Close the shared AudioContext and release resources.
 * Call this when the application is being unmounted or audio is no longer needed.
 */
export async function closeAudioContext(): Promise<void> {
    if (audioContextInstance) {
        await audioContextInstance.close();
        audioContextInstance = null;
    }
}

/**
 * Check if AudioContext is supported in the current browser.
 */
export function isAudioContextSupported(): boolean {
    return !!(
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    );
}

/**
 * VU Meter constants
 */
export const VU_METER_CONFIG = {
    /** Number of bars in the VU meter display */
    BARS: 12,
    /** Gap between bars in pixels */
    GAP: 2,
    /** FFT size for frequency analysis */
    FFT_SIZE: 256,
    /** Smoothing factor for volume transitions */
    SMOOTHING: 0.5,
    /** Threshold percentage for green bars */
    GREEN_THRESHOLD: 0.6,
    /** Threshold percentage for yellow bars */
    YELLOW_THRESHOLD: 0.85,
} as const;

/**
 * VU Meter color scheme (Material 3 compatible)
 */
export const VU_METER_COLORS = {
    /** Safe audio levels (green) */
    LOW: '#4ade80',
    /** Moderate audio levels (yellow) */
    MID: '#facc15',
    /** Peak/clipping levels (red) */
    HIGH: '#f87171',
    /** Inactive bar fallback color */
    INACTIVE_FALLBACK: '#cac4d0',
} as const;

/**
 * Calculate RMS (Root Mean Square) volume from frequency data.
 *
 * @param dataArray - Uint8Array of frequency data from AnalyserNode
 * @returns Volume level as percentage (0-100)
 */
export function calculateRMSVolume(dataArray: Uint8Array): number {
    let sum = 0;
    const length = dataArray.length;

    for (let i = 0; i < length; i++) {
        const value = dataArray[i] ?? 0;
        sum += value * value;
    }

    const rms = Math.sqrt(sum / length);
    // Scale to 0-100 with slight boost
    return Math.min(100, (rms / 128) * 100 * 1.5);
}

/**
 * Get CSS custom property value with fallback.
 *
 * @param property - CSS custom property name (e.g., '--md-sys-color-outline-variant')
 * @param fallback - Fallback value if property not found
 * @returns The property value or fallback
 */
export function getCSSProperty(property: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(property).trim() || fallback;
}
