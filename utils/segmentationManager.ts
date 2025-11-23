/**
 * Segmentation Manager
 *
 * Manages body segmentation with automatic fallback between:
 * 1. Web Worker (preferred - off main thread)
 * 2. Main Thread (fallback - if worker fails)
 *
 * This addresses the MediaPipe CDN loading issues mentioned in the codebase
 * by providing graceful degradation.
 */

export interface SegmentationResult {
    mask: ImageData | null;
    error?: string;
}

export type SegmentationMode = 'worker' | 'main-thread' | 'disabled';

interface WorkerResponseReady {
    type: 'ready';
    success: boolean;
    error?: string;
}

interface WorkerResponseMask {
    type: 'mask';
    maskData: Uint8ClampedArray;
    width: number;
    height: number;
}

interface WorkerResponseError {
    type: 'error';
    message: string;
}

type WorkerResponse = WorkerResponseReady | WorkerResponseMask | WorkerResponseError;

/**
 * Singleton class to manage segmentation processing
 */
class SegmentationManager {
    private worker: Worker | null = null;
    private mode: SegmentationMode = 'disabled';
    private isInitializing = false;
    private pendingCallbacks: Map<number, (result: SegmentationResult) => void> = new Map();
    private messageId = 0;

    // Feature detection
    private static supportsOffscreenCanvas(): boolean {
        return typeof OffscreenCanvas !== 'undefined';
    }

    private static supportsWorker(): boolean {
        return typeof Worker !== 'undefined';
    }

    private static supportsImageBitmap(): boolean {
        return typeof createImageBitmap !== 'undefined';
    }

    /**
     * Initialize the segmentation manager
     * Attempts worker initialization with fallback to main thread
     */
    async initialize(): Promise<SegmentationMode> {
        if (this.isInitializing) {
            return this.mode;
        }

        this.isInitializing = true;

        // Check if we can use the worker approach
        const canUseWorker =
            SegmentationManager.supportsWorker() &&
            SegmentationManager.supportsOffscreenCanvas() &&
            SegmentationManager.supportsImageBitmap();

        if (canUseWorker) {
            try {
                // Try to initialize worker
                const workerInitialized = await this.initializeWorker();
                if (workerInitialized) {
                    this.mode = 'worker';
                    console.log('[SegmentationManager] Using Web Worker mode');
                    this.isInitializing = false;
                    return this.mode;
                }
            } catch (e) {
                console.warn('[SegmentationManager] Worker initialization failed:', e);
            }
        }

        // Fallback to main thread
        // The existing useBodySegmentation hook handles main thread processing
        this.mode = 'main-thread';
        console.log('[SegmentationManager] Using main thread fallback');
        this.isInitializing = false;
        return this.mode;
    }

    /**
     * Initialize the Web Worker
     */
    private async initializeWorker(): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                // Create worker from the worker file
                // Note: In Vite, use `new Worker(new URL('./workers/segmentation.worker.ts', import.meta.url), { type: 'module' })`
                // For now, we'll use a blob URL approach for compatibility

                // Check if the worker module is available
                const workerUrl = new URL('../workers/segmentation.worker.ts', import.meta.url);
                this.worker = new Worker(workerUrl, { type: 'module' });

                const timeoutId = setTimeout(() => {
                    console.warn('[SegmentationManager] Worker init timeout');
                    this.terminateWorker();
                    resolve(false);
                }, 10000); // 10 second timeout

                this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                    const response = event.data;

                    if (response.type === 'ready') {
                        clearTimeout(timeoutId);
                        if (response.success) {
                            this.setupWorkerMessageHandler();
                            resolve(true);
                        } else {
                            console.warn('[SegmentationManager] Worker ready but failed:', response.error);
                            this.terminateWorker();
                            resolve(false);
                        }
                    }
                };

                this.worker.onerror = (error) => {
                    clearTimeout(timeoutId);
                    console.error('[SegmentationManager] Worker error:', error);
                    this.terminateWorker();
                    resolve(false);
                };

                // Send init message
                this.worker.postMessage({ type: 'init' });
            } catch (e) {
                console.error('[SegmentationManager] Failed to create worker:', e);
                resolve(false);
            }
        });
    }

    /**
     * Setup message handler for ongoing communication
     */
    private setupWorkerMessageHandler(): void {
        if (!this.worker) return;

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const response = event.data;

            if (response.type === 'mask') {
                // Create ImageData from the transferred array
                const imageData = new ImageData(
                    new Uint8ClampedArray(response.maskData),
                    response.width,
                    response.height
                );

                // Resolve any pending callbacks
                // Note: In a real implementation, you'd track request IDs
                this.pendingCallbacks.forEach((callback) => {
                    callback({ mask: imageData });
                });
                this.pendingCallbacks.clear();
            } else if (response.type === 'error') {
                this.pendingCallbacks.forEach((callback) => {
                    callback({ mask: null, error: response.message });
                });
                this.pendingCallbacks.clear();
            }
        };
    }

    /**
     * Process a video frame through the worker
     */
    async segment(video: HTMLVideoElement): Promise<SegmentationResult> {
        if (this.mode !== 'worker' || !this.worker) {
            return { mask: null, error: 'Worker not available' };
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            return { mask: null, error: 'Invalid video dimensions' };
        }

        return new Promise((resolve) => {
            const id = this.messageId++;
            this.pendingCallbacks.set(id, resolve);

            // Create ImageBitmap from video frame
            createImageBitmap(video)
                .then((imageBitmap) => {
                    this.worker?.postMessage(
                        {
                            type: 'segment',
                            imageBitmap,
                            width: video.videoWidth,
                            height: video.videoHeight,
                        },
                        [imageBitmap] // Transfer ownership
                    );
                })
                .catch((e) => {
                    this.pendingCallbacks.delete(id);
                    resolve({ mask: null, error: `Failed to create ImageBitmap: ${e}` });
                });

            // Timeout handling
            setTimeout(() => {
                if (this.pendingCallbacks.has(id)) {
                    this.pendingCallbacks.delete(id);
                    resolve({ mask: null, error: 'Segmentation timeout' });
                }
            }, 1000); // 1 second timeout per frame
        });
    }

    /**
     * Get current processing mode
     */
    getMode(): SegmentationMode {
        return this.mode;
    }

    /**
     * Check if worker is available and ready
     */
    isWorkerReady(): boolean {
        return this.mode === 'worker' && this.worker !== null;
    }

    /**
     * Terminate the worker and clean up
     */
    terminateWorker(): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'terminate' });
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingCallbacks.clear();
    }

    /**
     * Cleanup all resources
     */
    dispose(): void {
        this.terminateWorker();
        this.mode = 'disabled';
    }
}

// Export singleton instance
export const segmentationManager = new SegmentationManager();

// Export class for testing
export { SegmentationManager };
