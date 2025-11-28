/**
 * Segmentation Manager
 *
 * Manages body segmentation processing via Web Worker or main thread fallback.
 *
 * CRITICAL: This uses a DIRECT URL to public/workers/segmentation.worker.js
 * DO NOT use Vite's ?worker import syntax - it forces ES modules which break importScripts()
 */

import { logger } from './logger';
import { WORKER_INIT_TIMEOUT_MS, SEGMENTATION_TIMEOUT_MS } from '../constants/ai';

import type { FaceLandmarks } from '../types/face';
import type { SegmentationConfig } from '../types/media';
import type { AutoFrameTransform } from '../hooks/useBodySegmentation';

// =============================================================================
// Types
// =============================================================================

export interface SegmentationResult {
  mask: ImageData | ImageBitmap | null;
  autoFrameTransform?: AutoFrameTransform;
  error?: string;
  fps?: number;
  latency?: number;
}

export type SegmentationMode = 'worker' | 'main-thread' | 'disabled';

interface WorkerMessage {
  type: string;
  id?: number;
  mask?: ImageBitmap;
  autoFrameTransform?: AutoFrameTransform;
  success?: boolean;
  error?: string;
  fps?: number;
  latency?: number;
}

// =============================================================================
// Singleton Manager
// =============================================================================

type WorkerFactory = () => Worker;

class SegmentationManager {
  private worker: Worker | null = null;
  private mode: SegmentationMode = 'disabled';
  private isInitializing = false;
  private initializationPromise: Promise<SegmentationMode> | null = null;
  private pendingCallbacks: Map<number, (result: SegmentationResult) => void> = new Map();
  private messageId = 0;
  private _onFaceLandmarks?: (landmarks: FaceLandmarks) => void;
  private currentFps = 0;
  private currentLatency = 0;
  private referenceCount = 0;
  private initializationAttempts = 0;
  private config = {
    maxInitializationAttempts: 3,
    baseRetryDelay: 1000, // 1 second
    initializationTimeout: 45000, // 45 seconds
  };
  private lastError: string | null = null;
  private workerFactory: WorkerFactory;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;

  // Disposal timeout management - prevents "death spiral" in React Strict Mode
  private disposeTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly DISPOSE_DELAY_MS = 2000; // 2s grace period

  constructor(workerFactory?: WorkerFactory) {
    this.workerFactory =
      workerFactory ?? (() => new Worker('/workers/segmentation.worker.js', { type: 'classic' }));
  }

  // =============================================================================
  // Feature Detection
  // =============================================================================

  private static supportsOffscreenCanvas(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  }

  private static supportsWorker(): boolean {
    return typeof Worker !== 'undefined';
  }

  private static supportsImageBitmap(): boolean {
    return typeof createImageBitmap !== 'undefined';
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  async initialize(): Promise<SegmentationMode> {
    if (this.initializationPromise) {
      logger.info(
        'SegmentationManager',
        'Already initializing, waiting for existing initialization'
      );
      return this.initializationPromise;
    }

    if (this.mode !== 'disabled' && this.worker !== null) {
      logger.info('SegmentationManager', `Already initialized in ${this.mode} mode`);
      return this.mode;
    }

    this.isInitializing = true;
    this.initializationAttempts = 0; // Reset for a new cycle of retries

    // Store the promise
    this.initializationPromise = this.performInitialization();

    try {
      // Await the final result of the initialization (with retries)
      const finalMode = await this.initializationPromise;
      this.mode = finalMode;
      return finalMode;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async performInitialization(): Promise<SegmentationMode> {
    const canUseWorker =
      SegmentationManager.supportsWorker() &&
      SegmentationManager.supportsOffscreenCanvas() &&
      SegmentationManager.supportsImageBitmap();

    if (!canUseWorker) {
      this.lastError = 'Worker features not supported by browser';
      logger.warn('SegmentationManager', this.lastError);
      return 'main-thread';
    }

    while (this.initializationAttempts < this.config.maxInitializationAttempts) {
      this.initializationAttempts++;
      logger.info(
        'SegmentationManager',
        `Starting initialization attempt ${this.initializationAttempts}/${this.config.maxInitializationAttempts}...`
      );

      try {
        const workerInitialized = await this.initializeWorker();

        if (this.mode === 'disabled' && !this.isInitializing) {
          logger.warn('SegmentationManager', 'Manager was disposed during initialization');
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
          return 'disabled';
        }

        if (workerInitialized) {
          this.lastError = null;
          return 'worker'; // Success!
        } else {
          // This case happens if initializeWorker resolves to false (e.g., timeout)
          this.lastError = this.lastError || 'Worker initialization promise returned false';
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.lastError = errorMsg;
        logger.warn('SegmentationManager', `Initialization attempt failed: ${errorMsg}`);
      }

      // If we are here, the attempt failed. Wait before the next one.
      if (this.initializationAttempts < this.config.maxInitializationAttempts) {
        const delay = this.config.baseRetryDelay * Math.pow(2, this.initializationAttempts - 1);
        logger.info('SegmentationManager', `Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    logger.error(
      'SegmentationManager',
      `All initialization attempts failed. Last error: ${this.lastError}`
    );
    return 'main-thread'; // Fallback after all attempts failed
  }

  // =============================================================================
  // Worker Initialization
  // =============================================================================

  private async initializeWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      logger.info('SegmentationManager', 'Creating worker...');

      try {
        this.worker = this.workerFactory();
      } catch (e) {
        logger.error('SegmentationManager', 'Failed to create worker:', e);
        resolve(false);
        return;
      }

      // Timeout for initialization using centralized constant
      this.initTimeout = setTimeout(() => {
        logger.error(
          'SegmentationManager',
          `Worker initialization timeout (${WORKER_INIT_TIMEOUT_MS / 1000}s) - falling back to main thread`
        );
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        resolve(false);
      }, WORKER_INIT_TIMEOUT_MS);

      // Handle worker messages
      this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const { type, id, mask, autoFrameTransform, success, error, fps, latency } = e.data;

        switch (type) {
          case 'init-complete':
            if (this.initTimeout) {
              clearTimeout(this.initTimeout);
              this.initTimeout = null;
            }
            if (success) {
              logger.info('SegmentationManager', 'Worker initialized successfully');
              resolve(true);
            } else {
              logger.error('SegmentationManager', 'Worker init failed:', error);
              if (this.worker) {
                this.worker.terminate();
                this.worker = null;
              }
              resolve(false);
            }
            break;

          case 'mask':
            if (id !== undefined && this.pendingCallbacks.has(id)) {
              const callback = this.pendingCallbacks.get(id);
              this.pendingCallbacks.delete(id);

              if (callback) {
                // Update performance metrics
                if (fps !== undefined) this.currentFps = fps;
                if (latency !== undefined) this.currentLatency = latency;

                callback({
                  mask: mask || null,
                  autoFrameTransform,
                  fps: this.currentFps,
                  latency: this.currentLatency,
                });
              }
            } else if (mask) {
              // Unsolicited mask (e.g., from continuous processing)
              // Just log it for now
              logger.debug('SegmentationManager', 'Received unsolicited mask');
            }
            break;

          case 'error':
            logger.error('SegmentationManager', 'Worker error:', error);
            break;

          default:
            logger.warn('SegmentationManager', 'Unknown worker message type:', type);
        }
      };

      // Handle worker errors
      this.worker.onerror = (e: ErrorEvent) => {
        if (this.initTimeout) {
          clearTimeout(this.initTimeout);
          this.initTimeout = null;
        }
        logger.error('SegmentationManager', 'Worker error:', e);
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        resolve(false);
      };

      // Send init message
      logger.info('SegmentationManager', 'Sending init message to worker');
      this.worker.postMessage({ type: 'init', config: { modelType: 'general' } });
    });
  }

  // =============================================================================
  // Face Landmarks Callback (for future FaceMesh integration)
  // =============================================================================

  setFaceLandmarksCallback(callback: (landmarks: FaceLandmarks) => void): void {
    this._onFaceLandmarks = callback;
  }

  getFaceLandmarksCallback(): ((landmarks: FaceLandmarks) => void) | undefined {
    return this._onFaceLandmarks;
  }

  // =============================================================================
  // Frame Processing
  // =============================================================================

  async processFrame(frame: ImageBitmap, autoFrame: boolean = false): Promise<SegmentationResult> {
    if (this.mode === 'disabled') {
      return { mask: null, error: 'Segmentation disabled' };
    }

    if (this.mode === 'worker' && this.worker) {
      return this.processFrameViaWorker(frame, autoFrame);
    }

    // Main thread fallback (not implemented - would need BodyPix in main thread)
    return { mask: null, error: 'Main thread segmentation not implemented' };
  }

  private processFrameViaWorker(
    frame: ImageBitmap,
    autoFrame: boolean
  ): Promise<SegmentationResult> {
    return new Promise((resolve) => {
      if (!this.worker) {
        resolve({ mask: null, error: 'Worker not available' });
        return;
      }

      const id = this.messageId++;
      this.pendingCallbacks.set(id, resolve);

      // Transfer the ImageBitmap to the worker (zero-copy)
      this.worker.postMessage({ type: 'process', id, image: frame, autoFrame }, [frame]);

      // Timeout for individual frame processing (use project constant)
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          resolve({ mask: null, error: 'Segmentation timeout' });
        }
      }, SEGMENTATION_TIMEOUT_MS);
    });
  }

  // =============================================================================
  // Segmentation API (for backward compatibility)
  // =============================================================================

  async segment(video: HTMLVideoElement, autoFrame: boolean = false): Promise<SegmentationResult> {
    if (this.mode !== 'worker' || !this.worker) {
      return { mask: null, error: 'Worker not available' };
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return { mask: null, error: 'Invalid video dimensions' };
    }

    try {
      const imageBitmap = await createImageBitmap(video);
      if (!imageBitmap || imageBitmap.width === 0 || imageBitmap.height === 0) {
        throw new Error('Invalid ImageBitmap created');
      }
      return await this.processFrame(imageBitmap, autoFrame);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return { mask: null, error: `Failed to create ImageBitmap: ${errorMessage}` };
    }
  }

  // =============================================================================
  // Configuration
  // =============================================================================

  /**
   * (For Testing) Overrides the default configuration.
   * @param newConfig Partial configuration object.
   */
  configure(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
  }

  updateConfig(_config: Partial<SegmentationConfig>): void {
    // Future: send config updates to worker
    logger.debug('SegmentationManager', 'Config update requested (not yet implemented)');
  }

  // =============================================================================
  // Status
  // =============================================================================

  getMode(): SegmentationMode {
    return this.mode;
  }

  isWorkerReady(): boolean {
    return this.mode === 'worker' && this.worker !== null;
  }

  getPerformanceMetrics(): { fps: number; latency: number } {
    return { fps: this.currentFps, latency: this.currentLatency };
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  terminateWorker(): void {
    if (this.worker) {
      logger.info('SegmentationManager', 'Terminating worker');
      this.worker.postMessage({ type: 'close' });
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
  }

  acquire(): void {
    // Cancel pending disposal if we're re-acquiring (React remount)
    if (this.disposeTimeout) {
      clearTimeout(this.disposeTimeout);
      this.disposeTimeout = null;
      logger.debug('SegmentationManager', 'Dispose cancelled - component re-acquired reference');
    }

    this.referenceCount++;
    logger.debug('SegmentationManager', `Acquired reference, count: ${this.referenceCount}`);
  }

  release(): void {
    this.referenceCount--;
    logger.debug('SegmentationManager', `Released reference, count: ${this.referenceCount}`);

    if (this.referenceCount <= 0) {
      this.referenceCount = 0;
      logger.info(
        'SegmentationManager',
        `All references released, scheduling disposal in ${this.DISPOSE_DELAY_MS}ms`
      );

      // Clear any existing timeout
      if (this.disposeTimeout) {
        clearTimeout(this.disposeTimeout);
      }

      // Schedule disposal after grace period
      // This prevents "death spiral" during React Strict Mode remounts
      this.disposeTimeout = setTimeout(() => {
        logger.info('SegmentationManager', 'Disposal grace period ended, executing dispose');
        this.dispose();
        this.disposeTimeout = null;
      }, this.DISPOSE_DELAY_MS);
    } else if (this.referenceCount < 0) {
      logger.warn('SegmentationManager', 'Reference count went negative, resetting to 0');
      this.referenceCount = 0;
    }
  }

  /**
   * Force disposal of the manager and worker
   * Should only be called when the application is shutting down
   */
  dispose(): void {
    // Ensure we clear any pending timeout if called manually
    if (this.disposeTimeout) {
      clearTimeout(this.disposeTimeout);
      this.disposeTimeout = null;
    }

    logger.info('SegmentationManager', 'Disposing manager (forced)');
    this.terminateWorker();
    this.mode = 'disabled';
    this.isInitializing = false;
    this.referenceCount = 0;
  }

  /**
   * Check if the manager should be disposed based on inactivity
   * Call this periodically or when needed
   */
  disposeIfUnused(): void {
    if (this.referenceCount <= 0 && this.worker !== null) {
      logger.info('SegmentationManager', 'No active references, disposing manager');
      this.dispose();
      this.mode = 'disabled';
    }
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const segmentationManager = new SegmentationManager();
export { SegmentationManager };
