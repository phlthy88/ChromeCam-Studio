/**
 * AI Worker Management for ChromeCam Studio
 *
 * This module provides the infrastructure for off-main-thread AI processing.
 *
 * ## Architecture
 *
 * The AI processing system uses a hybrid approach:
 *
 * 1. **Web Worker Mode** (Preferred)
 *    - Runs MediaPipe segmentation in a dedicated worker thread
 *    - Uses OffscreenCanvas for GPU-accelerated rendering
 *    - Transfers ImageBitmap for zero-copy frame passing
 *    - Keeps UI responsive even during heavy AI inference
 *
 * 2. **Main Thread Mode** (Fallback)
 *    - Used when Worker initialization fails (CDN CORS issues, etc.)
 *    - Current implementation in `useBodySegmentation.ts`
 *    - May cause UI jank on lower-end devices
 *
 * ## CDN Loading Issues
 *
 * MediaPipe loads model files from CDN, which can fail in Worker contexts due to:
 * - CORS policies preventing cross-origin script loading
 * - Content Security Policy (CSP) restrictions
 * - Some browsers blocking importScripts from external origins
 *
 * ## Solutions
 *
 * ### Option 1: Local WASM Bundling (Recommended for Production)
 *
 * 1. Download MediaPipe WASM files:
 *    ```bash
 *    mkdir -p public/mediapipe
 *    cd public/mediapipe
 *    curl -O https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.binarypb
 *    curl -O https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation_landscape.tflite
 *    curl -O https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.tflite
 *    ```
 *
 * 2. Update segmenter config to use local path:
 *    ```typescript
 *    const segmenterConfig = {
 *        runtime: 'mediapipe',
 *        solutionPath: '/mediapipe/',
 *        modelType: 'general',
 *    };
 *    ```
 *
 * ### Option 2: TensorFlow.js Backend (Alternative)
 *
 * Use the TensorFlow.js backend instead of MediaPipe runtime:
 * ```typescript
 * const segmenterConfig = {
 *     runtime: 'tfjs',
 *     modelType: 'general',
 * };
 * ```
 *
 * This loads models differently and may have better worker compatibility,
 * but performance may differ from the MediaPipe backend.
 *
 * ### Option 3: Proxy Loading
 *
 * Load models on main thread and transfer to worker via postMessage.
 * More complex but works around all CDN restrictions.
 *
 * ## Usage
 *
 * ```typescript
 * import { segmentationManager } from '../utils/segmentationManager';
 *
 * // Initialize (call once at app start)
 * const mode = await segmentationManager.initialize();
 * console.log('Using segmentation mode:', mode); // 'worker' or 'main-thread'
 *
 * // Process frame (in animation loop)
 * if (segmentationManager.isWorkerReady()) {
 *     const result = await segmentationManager.segment(videoElement);
 *     if (result.mask) {
 *         // Use the mask ImageData
 *     }
 * }
 *
 * // Cleanup (on unmount)
 * segmentationManager.dispose();
 * ```
 *
 * ## Future Improvements
 *
 * 1. **WebGPU Support**: When WebGPU is widely available, migrate to
 *    GPU-based inference for better performance.
 *
 * 2. **WASM SIMD**: Ensure WASM SIMD instructions are enabled for
 *    faster CPU-based inference as fallback.
 *
 * 3. **Model Caching**: Implement IndexedDB caching for model files
 *    to reduce loading times on repeat visits.
 *
 * @see ../workers/segmentation.worker.ts - Web Worker implementation
 * @see ../utils/segmentationManager.ts - Manager with fallback logic
 * @see ../hooks/useBodySegmentation.ts - Main thread implementation
 */

// Re-export the segmentation manager for convenience
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
