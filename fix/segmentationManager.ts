/**
 * Segmentation Manager
 * 
 * Manages body segmentation processing via Web Worker or main thread fallback.
 * 
 * CRITICAL: This uses a DIRECT URL to public/workers/segmentation.worker.js
 * DO NOT use Vite's ?worker import syntax - it forces ES modules which break importScripts()
 */

import { logger } from './logger';
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
  private pendingCallbacks: Map<number, (result: SegmentationResult) => void> = new Map();
  private messageId = 0;
  private _onFaceLandmarks?: (landmarks: FaceLandmarks) => void;
  private currentFps = 0;
  private currentLatency = 0;

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
    if (this.isInitializing) {
      logger.warn('SegmentationManager', 'Already initializing, returning current mode');
      return this.mode;
    }

    if (this.mode !== 'disabled') {
      logger.info('SegmentationManager', `Already initialized in ${this.mode} mode`);
      return this.mode;
    }

    this.isInitializing = true;
    logger.info('SegmentationManager', 'Starting initialization...');

    const canUseWorker =
      SegmentationManager.supportsWorker() &&
      SegmentationManager.supportsOffscreenCanvas() &&
      SegmentationManager.supportsImageBitmap();

    logger.info('SegmentationManager', `Worker support: ${canUseWorker}`, {
      Worker: SegmentationManager.supportsWorker(),
      OffscreenCanvas: SegmentationManager.supportsOffscreenCanvas(),
      ImageBitmap: SegmentationManager.supportsImageBitmap()
    });

    if (canUseWorker) {
      try {
        const workerInitialized = await this.initializeWorker();
        if (workerInitialized) {
          this.mode = 'worker';
          this.isInitializing = false;
          logger.info('SegmentationManager', 'Worker mode initialized successfully');
          return this.mode;
        }
      } catch (e) {
        logger.warn('SegmentationManager', 'Worker initialization failed:', e);
      }
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

  private initializeWorker(): Promise<boolean> {
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

      // Timeout for initialization (30 seconds)
      const initTimeout = setTimeout(() => {
        logger.error('SegmentationManager', 'Worker initialization timeout (30s) - falling back to main thread');
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        resolve(false);
      }, 30000);

      // Handle worker messages
      this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const { type, id, mask, autoFrameTransform, success, error, fps, latency } = e.data;

        switch (type) {
          case 'init-complete':
            clearTimeout(initTimeout);
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
                latency: this.currentLatency
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
        clearTimeout(initTimeout);
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

  async processFrame(
    frame: ImageBitmap,
    autoFrame: boolean = false
  ): Promise<SegmentationResult> {
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
      this.worker.postMessage(
        { type: 'process', id, image: frame, autoFrame },
        [frame]
      );

      // Timeout for individual frame processing
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          resolve({ mask: null, error: 'Segmentation timeout' });
        }
      }, 1000);
    });
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
  }

  dispose(): void {
    this.terminateWorker();
    this.mode = 'disabled';
    this.isInitializing = false;
    logger.info('SegmentationManager', 'Disposed');
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const segmentationManager = new SegmentationManager();
export { SegmentationManager };
