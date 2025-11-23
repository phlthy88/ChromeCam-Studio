/**
 * Segmentation Manager
 *
 * Manages body segmentation with automatic fallback between:
 * 1. Web Worker (preferred - off main thread)
 * 2. Main Thread (fallback - if worker fails)
 *
 * This addresses the MediaPipe CDN loading issues mentioned in the codebase
 * by providing graceful degradation and proper error handling.
 */

import type {
  SegmentationWorkerMessage,
  SegmentationWorkerResponse,
  SegmentationConfig,
} from '../types/media';

export interface SegmentationResult {
  mask: ImageData | null;
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
  private _onFaceLandmarks?: (landmarks: any[]) => void;
  private onPerformanceUpdate?: (fps: number, latency: number) => void;
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
   * Set callback for face landmarks
   */
  setFaceLandmarksCallback(callback: (landmarks: any[]) => void): void {
    this._onFaceLandmarks = callback;
  }

  /**
   * Get face landmarks callback (for testing)
   */
  getFaceLandmarksCallback(): ((landmarks: any[]) => void) | undefined {
    return this._onFaceLandmarks;
  }

  /**
   * Set callback for performance updates
   */
  setPerformanceCallback(callback: (fps: number, latency: number) => void): void {
    this.onPerformanceUpdate = callback;
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

        this.worker.onmessage = (event: MessageEvent<SegmentationWorkerResponse>) => {
          const response = event.data;

          if (response.type === 'ready') {
            clearTimeout(timeoutId);
            this.setupWorkerMessageHandler();
            resolve(true);
          } else if (response.type === 'error' && !this.pendingCallbacks.size) {
            // Error during init
            clearTimeout(timeoutId);
            console.warn('[SegmentationManager] Worker ready but failed:', response.payload?.error);
            this.terminateWorker();
            resolve(false);
          }
        };

        this.worker.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error('[SegmentationManager] Worker error:', error);
          this.terminateWorker();
          resolve(false);
        };

        // Send init message with timestamp
        const initMessage: SegmentationWorkerMessage = {
          type: 'init',
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

    this.worker.onmessage = (event: MessageEvent<SegmentationWorkerResponse>) => {
      const response = event.data;

      switch (response.type) {
        case 'result': {
          if (response.payload?.maskData && response.payload.width && response.payload.height) {
            // Create ImageData from the transferred array
            const imageData = new ImageData(
              new Uint8ClampedArray(response.payload.maskData),
              response.payload.width,
              response.payload.height
            );

            // Update performance metrics
            if (response.payload.fps !== undefined) {
              this.currentFps = response.payload.fps;
            }
            if (response.payload.latency !== undefined) {
              this.currentLatency = response.payload.latency;
            }

            // Resolve pending callbacks
            this.pendingCallbacks.forEach((callback) => {
              callback({
                mask: imageData,
                fps: this.currentFps,
                latency: this.currentLatency,
              });
            });
            this.pendingCallbacks.clear();
          }
          break;
        }

        case 'performance': {
          if (response.payload?.fps !== undefined) {
            this.currentFps = response.payload.fps;
            if (response.payload.latency !== undefined) {
              this.currentLatency = response.payload.latency;
            }
            if (this.onPerformanceUpdate) {
              this.onPerformanceUpdate(this.currentFps, this.currentLatency);
            }
          }
          break;
        }

        case 'error': {
          console.error('[SegmentationManager] Worker error:', response.payload?.error);
          this.pendingCallbacks.forEach((callback) => {
            callback({ mask: null, error: response.payload?.error });
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
          const message: SegmentationWorkerMessage = {
            type: 'segment',
            payload: {
              imageBitmap,
            },
            timestamp: performance.now(),
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
  updateConfig(config: Partial<SegmentationConfig>): void {
    if (this.worker && this.mode === 'worker') {
      const message: SegmentationWorkerMessage = {
        type: 'updateConfig',
        payload: { config: config as SegmentationConfig },
        timestamp: performance.now(),
      };
      this.worker.postMessage(message);
    }
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
      const message: SegmentationWorkerMessage = {
        type: 'dispose',
        timestamp: performance.now(),
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
