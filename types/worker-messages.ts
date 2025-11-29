/**
 * Shared type definitions for Web Worker communication
 * Used by both main thread (segmentationManager) and worker thread
 */

// ============================================================================
// Request Messages (Main Thread → Worker)
// ============================================================================

export interface WorkerSegmentRequest {
  type: 'segment';
  videoFrame: ImageBitmap;
  config: {
    model: 'general' | 'landscape';
    threshold: number;
    enableAutoFrame?: boolean;
  };
  timestamp: number;
}

export interface WorkerInitRequest {
  type: 'init';
  modelType: 'general' | 'landscape';
}

export interface WorkerDisposeRequest {
  type: 'dispose';
}

// ============================================================================
// Response Messages (Worker → Main Thread)
// ============================================================================

export interface WorkerSegmentResponse {
  type: 'result';
  mask: ImageData;
  latency: number;
  fps: number;
  autoFrame?: {
    panX: number;
    panY: number;
    zoom: number;
    faceDetected: boolean;
  };
  timestamp: number;
}

export interface WorkerInitResponse {
  type: 'initialized';
  modelType: 'general' | 'landscape';
  success: boolean;
}

export interface WorkerError {
  type: 'error';
  message: string;
  stack?: string;
  timestamp: number;
}

export interface WorkerReady {
  type: 'ready';
  version: string;
}

// ============================================================================
// Union Types
// ============================================================================

export type WorkerRequest = 
  | WorkerSegmentRequest 
  | WorkerInitRequest 
  | WorkerDisposeRequest;

export type WorkerResponse = 
  | WorkerSegmentResponse 
  | WorkerInitResponse 
  | WorkerError 
  | WorkerReady;

export type WorkerMessage = WorkerRequest | WorkerResponse;

// ============================================================================
// Configuration Types
// ============================================================================

export interface SegmentationConfig {
  model: 'general' | 'landscape';
  threshold: number;
  enableAutoFrame: boolean;
}

// ============================================================================
// Performance Metrics
// ============================================================================

export interface PerformanceMetrics {
  avgLatency: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  frameCount: number;
}