/**
 * Segmentation Manager
 *
 * Manages the Web Worker lifecycle and provides a clean API for AI segmentation.
 * Uses Vite's native worker import for type safety and proper bundling.
 *
 * @module SegmentationManager
 */

import SegmentationWorker from '../workers/segmentation.worker?worker';

import type { FaceLandmarks } from '../types/face';
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

// =============================================================================
// Manager Class
// =============================================================================

class SegmentationManager {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (val: SegmentationResult) => void;
    reject: (err: Error) => void;
    timeout: number
  }>();

  // Performance metrics
  private metrics = {
    avgFps: 0,
    avgLatency: 0,
    frameCount: 0,
    minFps: 60,
    maxFps: 0
  };

  // Face landmarks callback (placeholder as new worker doesn't support it yet)
  private _onFaceLandmarks?: (landmarks: FaceLandmarks) => void;
  private referenceCount = 0;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      this.worker = new SegmentationWorker();
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = (e) => console.error('Worker error:', e);

      // Initialize the worker
      this.worker.postMessage({ type: 'init' });
    } catch (e) {
      console.error('Failed to create worker', e);
    }
  }

  private handleMessage(e: MessageEvent) {
    const { type, id, mask, success, error, fps, latency } = e.data;

    if (type === 'init-complete') {
        if (success) {
            console.log('[SegmentationManager] Worker Initialized');
        } else {
            console.error('[SegmentationManager] Worker Init Failed:', error);
        }
        return;
    }

    if (type === 'mask') {
        const p = this.pending.get(id);
        if (p) {
            clearTimeout(p.timeout);
            this.pending.delete(id);

            // Update metrics
            if (fps) {
                this.metrics.avgFps = fps; // The worker returns rolling average
                this.metrics.frameCount++;
                this.metrics.minFps = Math.min(this.metrics.minFps, fps);
                this.metrics.maxFps = Math.max(this.metrics.maxFps, fps);
            }
            if (latency) {
                this.metrics.avgLatency = latency;
            }

            p.resolve({
                mask: mask,
                fps,
                latency,
                // New worker doesn't support autoFrame yet, return undefined
                autoFrameTransform: undefined
            });
        } else {
            // Late response?
            if (mask && typeof mask.close === 'function') mask.close();
        }
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  async initialize(): Promise<SegmentationMode> {
    if (this.worker) return 'worker';
    // Try to re-init
    this.initializeWorker();
    return this.worker ? 'worker' : 'disabled';
  }

  isWorkerReady(): boolean {
    return !!this.worker;
  }

  async processFrame(frame: ImageBitmap, autoFrame: boolean = false): Promise<SegmentationResult> {
     if (!this.worker) return { mask: null, error: 'No worker' };

     const id = this.nextId++;
     return new Promise((resolve, reject) => {
         const timeout = window.setTimeout(() => {
             this.pending.delete(id);
             reject(new Error('Timeout'));
         }, 1000); // 1s timeout

         this.pending.set(id, { resolve, reject, timeout });

         // Send to worker
         this.worker!.postMessage({ id, image: frame, autoFrame }, [frame]);
     });
  }

  // Backward compatibility wrapper
  async segment(video: HTMLVideoElement, autoFrame: boolean = false): Promise<SegmentationResult> {
      try {
          const bitmap = await createImageBitmap(video);
          return await this.processFrame(bitmap, autoFrame);
      } catch (e) {
          return { mask: null, error: String(e) };
      }
  }

  dispose() {
      if (this.worker) {
          this.worker.postMessage({ type: 'close' });
          this.worker.terminate();
          this.worker = null;
      }
      this.pending.forEach(p => p.reject(new Error('Disposed')));
      this.pending.clear();
  }

  getPerformanceMetrics() {
      return this.metrics;
  }

  // Helper for metrics
  getMetrics() {
      return this.metrics;
  }

  // =============================================================================
  // Resource Management
  // =============================================================================

  acquire(): void {
    this.referenceCount++;
  }

  release(): void {
    this.referenceCount--;
    if (this.referenceCount <= 0) {
      this.disposeIfUnused();
    }
  }

  disposeIfUnused(): void {
    // Optional: Keep worker alive for performance
  }

  setFaceLandmarksCallback(callback: (landmarks: FaceLandmarks) => void): void {
    this._onFaceLandmarks = callback;
  }

  getFaceLandmarksCallback(): ((landmarks: FaceLandmarks) => void) | undefined {
    return this._onFaceLandmarks;
  }

  // InitializeModel stub for compatibility
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initializeModel(_model: string): Promise<void> {
      // already initialized in constructor/init
      return Promise.resolve();
  }
}

export const segmentationManager = new SegmentationManager();
export { SegmentationManager };
