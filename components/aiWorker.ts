/**
 * AI Worker Management for ChromeCam Studio
 *
 * This module provides the infrastructure for off-main-thread AI processing.
 * It simply re-exports the manager for use in the application.
 */

export { segmentationManager, type SegmentationMode, type SegmentationResult } from '../utils/segmentationManager';

/**
 * Feature detection utilities
 */
export const AIFeatures = {
    /**
     * Check if Web Worker-based AI is supported
     */
    supportsWorkerAI(): boolean {
        return (
            typeof Worker !== 'undefined' &&
            typeof OffscreenCanvas !== 'undefined' &&
            typeof createImageBitmap !== 'undefined'
        );
    },

    /**
     * Check if WebGPU is available for future use
     */
    supportsWebGPU(): boolean {
        return 'gpu' in navigator;
    },

    /**
     * Check if WASM SIMD is supported
     */
    async supportsWasmSIMD(): Promise<boolean> {
        try {
            // Test for SIMD support
            const simdTest = new Uint8Array([
                0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
                253, 15, 253, 98, 11,
            ]);
            await WebAssembly.instantiate(simdTest);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Get recommended processing mode based on device capabilities
     */
    async getRecommendedMode(): Promise<'worker' | 'main-thread'> {
        if (!this.supportsWorkerAI()) {
            return 'main-thread';
        }

        // Check for low-end device indicators
        const hardwareConcurrency = navigator.hardwareConcurrency || 1;
        const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory || 4;

        // Prefer worker on devices with >= 4 cores and >= 4GB RAM
        if (hardwareConcurrency >= 4 && deviceMemory >= 4) {
            return 'worker';
        }

        // On lower-end devices, worker overhead might not be worth it
        return 'main-thread';
    },
};
