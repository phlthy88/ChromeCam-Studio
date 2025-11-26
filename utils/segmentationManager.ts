import type { FaceLandmarks } from '../types/face';
import type { SegmentationConfig } from '../types/media';
import type { AutoFrameTransform } from '../hooks/useBodySegmentation';

// Import the worker using Vite's standard syntax.
// Vite will handle bundling the worker and its dependencies.
import SegmentationWorker from '../workers/segmentation.worker.ts?worker';

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

  private static supportsOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  }

  private static supportsWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  private static supportsImageBitmap(): boolean {
    return typeof createImageBitmap !== 'undefined';
  }

  async initialize(): Promise<SegmentationMode> {
    if (this.isInitializing) {
      return this.mode;
    }

    this.isInitializing = true;

    const canUseWorker =
      SegmentationManager.supportsWorker() &&
      SegmentationManager.supportsOffscreenCanvas() &&
      SegmentationManager.supportsImageBitmap();

    if (canUseWorker) {
      try {
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

    this.mode = 'main-thread';
    this.isInitializing = false;
    return this.mode;
  }

  setFaceLandmarksCallback(callback: (landmarks: FaceLandmarks) => void): void {
    this._onFaceLandmarks = callback;
  }

  getFaceLandmarksCallback(): ((landmarks: FaceLandmarks) => void) | undefined {
    return this._onFaceLandmarks;
  }

  getPerformanceMetrics(): { fps: number; latency: number } {
    return { fps: this.currentFps, latency: this.currentLatency };
  }

  /**
   * Initialize the Web Worker using Vite's bundling.
   */
  private async initializeWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log('[SegmentationManager] Creating bundled worker...');
        
        this.worker = new SegmentationWorker();

        const timeoutId = setTimeout(() => {
          console.warn('[SegmentationManager] Worker init timeout');
          this.terminateWorker();
          resolve(false);
        }, 30000); // Increased timeout for model loading

        this.worker.onmessage = (event: MessageEvent<unknown>) => {
          const response = event.data as { type: string; success: boolean; error: string };

          if (response.type === 'init-complete') {
            clearTimeout(timeoutId);
            if (response.success) {
              console.log('[SegmentationManager] Worker initialized successfully');
              this.setupWorkerMessageHandler();
              resolve(true);
            } else {
              console.warn('[SegmentationManager] Worker init failed:', response.error);
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
            const canvas = document.createElement('canvas');
            canvas.width = response.mask.width;
            canvas.height = response.mask.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(response.mask, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

              const keys = Array.from(this.pendingCallbacks.keys());
              if (keys.length > 0) {
                const firstKey = keys[0];
                if (firstKey !== undefined) {
                  const callback = this.pendingCallbacks.get(firstKey);
                  if (callback) {
                    const result: SegmentationResult = { mask: imageData };
                    if (response.autoFrameTransform) {
                      result.autoFrameTransform = response.autoFrameTransform;
                    }
                    callback(result);
                    this.pendingCallbacks.delete(firstKey);
                  }
                }
              }
            }
            response.mask.close();
          }
          break;
        }

        case 'face-landmarks': {
          const landmarkResponse = response as unknown as {
            type: string;
            landmarks: Array<{ x: number; y: number; z: number }>;
          };
          if (this._onFaceLandmarks && landmarkResponse.landmarks) {
            this._onFaceLandmarks(landmarkResponse.landmarks);
          }
          break;
        }

        case 'error': {
          console.error('[SegmentationManager] Worker error:', response.error);
          this.pendingCallbacks.forEach((callback) => {
            callback({ mask: null, error: response.error });
          });
          this.pendingCallbacks.clear();
          break;
        }
      }
    };
  }

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

      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          resolve({ mask: null, error: 'Segmentation timeout' });
        }
      }, 1000);
    });
  }

  updateConfig(_config: Partial<SegmentationConfig>): void {
    // Not implemented
  }

  getMode(): SegmentationMode {
    return this.mode;
  }

  isWorkerReady(): boolean {
    return this.mode === 'worker' && this.worker !== null;
  }

  terminateWorker(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'close' });
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
  }

  dispose(): void {
    this.terminateWorker();
    this.mode = 'disabled';
  }
}

export const segmentationManager = new SegmentationManager();
export { SegmentationManager };