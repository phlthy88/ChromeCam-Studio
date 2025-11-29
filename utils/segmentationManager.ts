/**
 * Segmentation Manager
 *
 * Manages the Web Worker lifecycle and provides a clean API for AI segmentation.
 * Uses Vite's native worker import for type safety and proper bundling.
 *
 * @module SegmentationManager
 */

import SegmentationWorker from '../workers/segmentation.worker?worker';
import { logger } from './logger';

import type { FaceLandmarks } from '../types/face';
import type { SegmentationConfig } from '../types/media';
import type { AutoFrameTransform } from '../hooks/useBodySegmentation';
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerSegmentResponse,
  WorkerError,
  SegmentationConfig as WorkerSegmentationConfig,
  PerformanceMetrics
} from '../types/worker-messages';

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

// =============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: WorkerSegmentationConfig = {
  model: 'general',
  threshold: 0.7,
  enableAutoFrame: false
};

const SEGMENT_TIMEOUT_MS = 5000;

// =============================================================================
// Singleton Manager
// ============================================================================

class SegmentationManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<number, {
    resolve: (value: WorkerSegmentResponse) => void;
    reject: (error: Error) => void;
    timeout: number;
  }>();
  private requestId = 0;
  private _onFaceLandmarks?: (landmarks: FaceLandmarks) => void;
  private currentFps = 0;
  private currentLatency = 0;
  private referenceCount = 0;
  private config = {
    maxInitializationAttempts: 3,
    baseRetryDelay: 1000, // 1 second
    initializationTimeout: 45000, // 45 seconds
  };

  // Performance tracking
  private metrics: PerformanceMetrics = {
    avgLatency: 0,
    avgFps: 0,
    minFps: 60,
    maxFps: 0,
    frameCount: 0
  };

  constructor() {
    this.initializeWorker();
    // Initialize the model right after creating the worker
    this.initializeModel(DEFAULT_CONFIG.model)
      .then(() => {
        console.log('[SegmentationManager] Model initialized successfully');
      })
      .catch(error => {
        console.error('[SegmentationManager] Model initialization failed:', error);
      });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeWorker(): void {
    try {
      // ✅ Type-safe worker import via Vite
      this.worker = new SegmentationWorker();

      this.worker.addEventListener('message', this.handleWorkerMessage);
      this.worker.addEventListener('error', this.handleWorkerError);

      console.log('[SegmentationManager] Worker initialized');
    } catch (error) {
      console.error('[SegmentationManager] Failed to initialize worker:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  private handleWorkerMessage = (event: MessageEvent<WorkerResponse>): void => {
    const { data } = event;

    switch (data.type) {
      case 'ready':
        console.log('[SegmentationManager] Worker ready, version:', data.version);
        break;

      case 'initialized':
        console.log('[SegmentationManager] Model initialized:', data.modelType);
        break;

      case 'result':
        this.handleSegmentResult(data);
        break;

      case 'error':
        this.handleError(data);
        break;

      default:
        console.warn('[SegmentationManager] Unknown message type:', (data as any).type);
    }
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    console.error('[SegmentationManager] Worker error:', event.message);

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(`Worker error: ${event.message}`));
    });
    this.pendingRequests.clear();
  };

  private handleSegmentResult(response: WorkerSegmentResponse): void {
    // Update metrics
    this.metrics.frameCount++;
    this.metrics.avgLatency =
      (this.metrics.avgLatency * (this.metrics.frameCount - 1) + response.latency) /
      this.metrics.frameCount;
    this.metrics.avgFps =
      (this.metrics.avgFps * (this.metrics.frameCount - 1) + response.fps) /
      this.metrics.frameCount;
    this.metrics.minFps = Math.min(this.metrics.minFps, response.fps);
    this.metrics.maxFps = Math.max(this.metrics.maxFps, response.fps);

    // Resolve pending request (match by timestamp if needed)
    // For now, resolve the oldest pending request
    const firstEntry = this.pendingRequests.entries().next();
    if (!firstEntry.done) {
      const [firstKey, firstRequest] = firstEntry.value;
      if (this.worker) {
        clearTimeout(firstRequest.timeout);
        firstRequest.resolve(response);
        this.pendingRequests.delete(firstKey);
      }
    }
  }

  private handleError(error: WorkerError): void {
    console.error('[SegmentationManager] Segmentation error:', error.message);

    // Reject oldest pending request
    const firstEntry = this.pendingRequests.entries().next();
    if (!firstEntry.done) {
      const [firstKey, firstRequest] = firstEntry.value;
      clearTimeout(firstRequest.timeout);
      firstRequest.reject(new Error(error.message));
      this.pendingRequests.delete(firstKey);
    }
  }

  // ==========================================================================
  // Public API for new worker interface
  // ==========================================================================

  /**
   * Initialize the worker and return the mode
   */
  async initialize(): Promise<SegmentationMode> {
    if (this.worker) {
      return 'worker';
    }
    throw new Error('Worker failed to initialize');
  }

  /**
   * Perform body segmentation on a video frame (new worker interface)
   *
   * @param videoFrame - ImageBitmap from video element
   * @param config - Segmentation configuration
   * @returns Promise resolving to segmentation result
   */
  private async segmentWorker(
    videoFrame: ImageBitmap,
    config: Partial<WorkerSegmentationConfig> = {}
  ): Promise<WorkerSegmentResponse> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    const fullConfig: WorkerSegmentationConfig = { ...DEFAULT_CONFIG, ...config };
    const currentRequestId = this.requestId++;

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(currentRequestId);
        reject(new Error('Segmentation timeout'));
      }, SEGMENT_TIMEOUT_MS);

      this.pendingRequests.set(currentRequestId, { resolve, reject, timeout });

      const request: WorkerRequest = {
        type: 'segment',
        videoFrame,
        config: fullConfig,
        timestamp: performance.now()
      };

      // Transfer videoFrame ownership to worker for zero-copy
      this.worker!.postMessage(request, [videoFrame]);
    });
  }

  /**
   * Pre-initialize the segmentation model
   *
   * @param modelType - Model to initialize
   */
  async initializeModel(modelType: 'general' | 'landscape' = 'general'): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Initialization timeout'));
      }, 10000);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          this.worker!.removeEventListener('message', handler);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          this.worker!.removeEventListener('message', handler);
          reject(new Error(event.data.message));
        }
      };

      this.worker!.addEventListener('message', handler);

      const request: WorkerRequest = {
        type: 'init',
        modelType
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      avgLatency: 0,
      avgFps: 0,
      minFps: 60,
      maxFps: 0,
      frameCount: 0
    };
  }

  /**
   * Dispose of the worker and clean up resources
   * Call this when the component unmounts or app closes
   */
  dispose(): void {
    if (this.worker) {
      const request: WorkerRequest = {
        type: 'dispose'
      };
      this.worker.postMessage(request);

      // Terminate after a brief delay to allow cleanup
      setTimeout(() => {
        this.worker?.terminate();
        this.worker = null;
      }, 100);
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('SegmentationManager disposed'));
    });
    this.pendingRequests.clear();

    console.log('[SegmentationManager] Disposed');
  }

  /**
   * Check if manager is disposed
   */
  get disposed(): boolean {
    return !this.worker;
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
    if (!this.worker) {
      return { mask: null, error: 'Worker not available' };
    }

    try {
      // Direct call to the internal segmentation method
      const result = await this.segmentInternal(frame, autoFrame);

      // Transform the result to match the expected SegmentationResult format
      return {
        mask: result.mask,
        autoFrameTransform: result.autoFrame ? {
          panX: result.autoFrame.panX,
          panY: result.autoFrame.panY,
          zoom: result.autoFrame.zoom
        } : undefined,
        fps: result.fps,
        latency: result.latency
      };
    } catch (error) {
      return {
        mask: null,
        error: error instanceof Error ? error.message : 'Segmentation failed'
      };
    }
  }

  // Internal method to actually perform segmentation
  private async segmentInternal(frame: ImageBitmap, autoFrame: boolean = false): Promise<WorkerSegmentResponse> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }
    return await this.segmentWorker(frame, { enableAutoFrame: autoFrame });
  }

  // =============================================================================
  // Segmentation API (for backward compatibility) - Override public method
  // =============================================================================

  async segment(video: HTMLVideoElement, autoFrame: boolean = false): Promise<SegmentationResult> {
    if (!this.worker) {
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

      // Call the internal segmentInternal method with the expected parameters
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
    return 'worker'; // Always return worker mode since we're using the new worker
  }

  isWorkerReady(): boolean {
    return !!this.worker;
  }

  getPerformanceMetrics(): { fps: number; latency: number } {
    return { fps: this.currentFps, latency: this.currentLatency };
  }

  // =============================================================================
  // Resource Management
  // =============================================================================

  terminateWorker(): void {
    this.dispose();
  }

  acquire(): void {
    // Maintain reference counting for compatibility
    this.referenceCount++;
  }

  release(): void {
    this.referenceCount--;
    if (this.referenceCount <= 0) {
      this.disposeIfUnused();
    }
  }

  /**
   * Check if the manager should be disposed based on inactivity
   * Call this periodically or when needed
   */
  disposeIfUnused(): void {
    if (this.referenceCount <= 0 && this.worker) {
      this.dispose();
    }
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const segmentationManager = new SegmentationManager();
export { SegmentationManager };
