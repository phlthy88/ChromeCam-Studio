import type { FaceLandmarks } from '../types/face';
import type { SegmentationConfig } from '../types/media';
import type { AutoFrameTransform } from '../hooks/useBodySegmentation';

export interface SegmentationResult {
  mask: ImageData | null;
  autoFrameTransform?: AutoFrameTransform;
  error?: string;
  fps?: number;
  latency?: number;
}

export type SegmentationMode = 'worker' | 'main-thread' | 'disabled';

/**
 * Singleton class to manage segmentation processing
 */
class SegmentationManager {
  private worker: Worker | null = null;
  private mode: SegmentationMode = 'disabled';
  private isInitializing = false;
  private pendingCallbacks: Map<number, (result: SegmentationResult) => void> = new Map();
  private messageId = 0;
  private _onFaceLandmarks?: (landmarks: FaceLandmarks) => void;
  private currentFps = 0;
  private currentLatency = 0;

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
    this.isInitializing = false;
    return this.mode;
  }

  /**
   * Set callback for face landmarks
   */
  setFaceLandmarksCallback(callback: (landmarks: FaceLandmarks) => void): void {
    this._onFaceLandmarks = callback;
  }

  /**
   * Get face landmarks callback (for testing)
   */
  getFaceLandmarksCallback(): ((landmarks: FaceLandmarks) => void) | undefined {
    return this._onFaceLandmarks;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): { fps: number; latency: number } {
    return { fps: this.currentFps, latency: this.currentLatency };
  }

  /**
   * Initialize the Web Worker
   */
  private async initializeWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Create worker from the worker file using Vite's worker import
        const workerUrl = new URL('../workers/segmentation.worker.ts', import.meta.url);
        this.worker = new Worker(workerUrl, { type: 'module' });

        const timeoutId = setTimeout(() => {
          console.warn('[SegmentationManager] Worker init timeout');
          this.terminateWorker();
          resolve(false);
        }, 10000); // 10 second timeout

        this.worker.onmessage = (event: MessageEvent<unknown>) => {
          const response = event.data as { type: string; success: boolean; error: string };

          if (response.type === 'init-complete') {
            clearTimeout(timeoutId);
            if (response.success) {
                this.setupWorkerMessageHandler();
                resolve(true);
            } else {
                console.warn('[SegmentationManager] Worker initialization failed:', response.error);
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

        // Send init message with timestamp
        const initMessage = {
          type: 'init',
          config: { modelType: 'general' },
          timestamp: performance.now(),
        };
        this.worker.postMessage(initMessage);
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

    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = event.data as {
        type: string;
        mask: ImageBitmap;
        error: string;
        autoFrameTransform?: AutoFrameTransform;
      };

      switch (response.type) {
        case 'mask': {
          if (response.mask) {
            // Convert ImageBitmap to ImageData for compatibility with existing renderer
            // In Phase 1.2 (OffscreenCanvas), we would use the ImageBitmap directly
            const canvas = document.createElement('canvas');
            canvas.width = response.mask.width;
            canvas.height = response.mask.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(response.mask, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                // Resolve pending callbacks (LIFO mostly, but we just take the oldest)
                // Actually, since we don't pass ID back from worker yet, just call the first one
                const keys = Array.from(this.pendingCallbacks.keys());
                if (keys.length > 0) {
                    const firstKey = keys[0];
                    if (firstKey !== undefined) {
                        const callback = this.pendingCallbacks.get(firstKey);
                        if (callback) {
                            // Include autoFrameTransform if provided by worker
                            const result: SegmentationResult = {
                              mask: imageData
                            };
                            if (response.autoFrameTransform) {
                              result.autoFrameTransform = response.autoFrameTransform;
                            }
                            callback(result);
                            this.pendingCallbacks.delete(firstKey);
                        }
                    }
                }
            }

            // Close the bitmap to avoid leaks
            response.mask.close();
          }
          break;
        }

        case 'error': {
          console.error('[SegmentationManager] Worker error:', response.error);
          // Clear all pending callbacks
          this.pendingCallbacks.forEach((callback) => {
            callback({ mask: null, error: response.error });
          });
          this.pendingCallbacks.clear();
          break;
        }
      }
    };
  }

  /**
   * Process a video frame through the worker
   */
  async segment(video: HTMLVideoElement, autoFrame: boolean = false): Promise<SegmentationResult> {
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
          const message = {
            type: 'process',
            image: imageBitmap,
            timestamp: performance.now(),
            autoFrame
          };

          this.worker?.postMessage(message, [imageBitmap]);
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
   * Update segmentation configuration
   */
  updateConfig(_config: Partial<SegmentationConfig>): void {
    // Not fully implemented in worker yet
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
      const message = {
        type: 'close',
      };
      this.worker.postMessage(message);
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
