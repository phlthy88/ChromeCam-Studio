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
  private maxInitializationAttempts = 3;
  private lastError: string | null = null;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;

  // Disposal timeout management - prevents "death spiral" in React Strict Mode
  private disposeTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly DISPOSE_DELAY_MS = 2000; // 2s grace period

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
    // If already initializing, return the existing promise to avoid duplicate initialization
    if (this.initializationPromise) {
      logger.info(
        'SegmentationManager',
        'Already initializing, waiting for existing initialization'
      );
      return this.initializationPromise;
    }

    // If already initialized and worker is still active, return current mode
    if (this.mode !== 'disabled' && this.worker !== null) {
      logger.info('SegmentationManager', `Already initialized in ${this.mode} mode`);
      return this.mode;
    }

    // Check if we've exceeded max initialization attempts
    if (this.initializationAttempts >= this.maxInitializationAttempts) {
      logger.error(
        'SegmentationManager',
        `Max initialization attempts (${this.maxInitializationAttempts}) exceeded. Last error: ${this.lastError}`
      );
      return 'disabled';
    }

    this.isInitializing = true;
    this.initializationAttempts++;
    logger.info(
      'SegmentationManager',
      `Starting initialization (attempt ${this.initializationAttempts}/${this.maxInitializationAttempts})...`
    );

    // Store the initialization promise to prevent concurrent initializations
    this.initializationPromise = this.performInitialization();

    try {
      const mode = await this.initializationPromise;
      return mode;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async performInitialization(): Promise<SegmentationMode> {
    const canUseWorker =
      SegmentationManager.supportsWorker() &&
      SegmentationManager.supportsOffscreenCanvas() &&
      SegmentationManager.supportsImageBitmap();

    logger.info('SegmentationManager', `Worker support: ${canUseWorker}`, {
      Worker: SegmentationManager.supportsWorker(),
      OffscreenCanvas: SegmentationManager.supportsOffscreenCanvas(),
      ImageBitmap: SegmentationManager.supportsImageBitmap(),
    });

    if (canUseWorker) {
      try {
        const workerInitialized = await this.initializeWorker();

        // Check if manager was disposed while we were waiting for initialization
        if (!this.isInitializing && this.mode === 'disabled') {
          logger.warn('SegmentationManager', 'Manager was disposed during initialization');
          // Clean up the worker that was just created
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
          return this.mode; // returns 'disabled'
        }

        if (workerInitialized) {
          this.mode = 'worker';
          this.isInitializing = false;
          this.lastError = null;
          this.initializationAttempts = 0; // Reset on success
          logger.info('SegmentationManager', 'Worker mode initialized successfully');
          return this.mode;
        } else {
          this.lastError = 'Worker initialization returned false';
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.lastError = errorMsg;
        logger.warn('SegmentationManager', 'Worker initialization failed:', e);
      }
    } else {
      this.lastError = 'Worker features not supported by browser';
    }

    // Fallback to main thread (or disabled if no fallback available)
    this.mode = 'main-thread';
    this.isInitializing = false;
    logger.info('SegmentationManager', 'Falling back to main-thread mode');
    return this.mode;
  }

  // =============================================================================
  // Worker Initialization
  // =============================================================================

  private async initializeWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      // CRITICAL: Use direct URL string, NOT Vite's ?worker import
      // The worker file lives in public/workers/ and is served as-is
      const workerUrl = '/workers/segmentation.worker.js';

      logger.info('SegmentationManager', `Creating classic worker from: ${workerUrl}`);

      try {
        // Explicitly create as CLASSIC worker (not module)
        this.worker = new Worker(workerUrl, { type: 'classic' });
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
              const callback = this.pendingCallbacks.get(id)!;
              this.pendingCallbacks.delete(id);

              // Update performance metrics
              if (fps !== undefined) this.currentFps = fps;
              if (latency !== undefined) this.currentLatency = latency;

              callback({
                mask: mask || null,
                autoFrameTransform,
                fps: this.currentFps,
                latency: this.currentLatency,
              });
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
