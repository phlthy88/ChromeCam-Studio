/**
 * Body Segmentation Web Worker
 *
 * Handles AI inference off the main thread using TensorFlow.js + MediaPipe.
 * Communicates via typed messages for type safety.
 *
 * @module SegmentationWorker
 */

/// <reference lib="webworker" />

import '@tensorflow/tfjs-backend-wasm';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import type {
  WorkerRequest,
  WorkerSegmentRequest,
  WorkerSegmentResponse,
  WorkerInitRequest,
  WorkerInitResponse,
  WorkerError,
  WorkerReady
} from '../types/worker-messages';

// ============================================================================
// Worker Global Scope Declaration
// ============================================================================

declare const self: DedicatedWorkerGlobalScope;

// ============================================================================
// State Management
// ============================================================================

let selfieSegmentation: SelfieSegmentation | null = null;
let isInitializing = false;

// Performance tracking
let frameCount = 0;
let totalLatency = 0;
const fpsHistory: number[] = [];
const MAX_FPS_HISTORY = 30; // Track last 30 frames for rolling average

// Store pending segmentation request
let pendingSegmentation: {
  resolve: (result: any) => void;
  reject: (error: any) => void;
  config: any;
  timestamp: number;
  startTime: number;
} | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the selfie segmentation model
 * @param modelType - 'general' for high accuracy, 'landscape' for speed
 */
async function initializeSegmenter(modelType: 'general' | 'landscape'): Promise<void> {
  if (selfieSegmentation || isInitializing) {
    console.log('[Worker] Selfie segmentation already initialized or initializing');
    return;
  }

  isInitializing = true;
  console.log(`[Worker] Initializing ${modelType} model...`);

  try {
    // Set WASM backend path
    await import('@tensorflow/tfjs-backend-wasm').then(async (wasm) => {
      await wasm.setWasmPaths('/wasm/');
    });

    selfieSegmentation = new SelfieSegmentation({
      locateFile: (file: string) => {
        // Properly construct path to MediaPipe WASM files
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
      },
    });

    // Configure the selfie segmentation
    selfieSegmentation.setOptions({
      modelSelection: modelType === 'general' ? 1 : 0, // 1=general, 0=landscape
    });

    // Register the callback for processing results
    selfieSegmentation.onResults(processSegmentationResult);

    console.log('[Worker] Selfie segmentation initialized successfully');
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

// ============================================================================
// Results Processing
// ============================================================================

/**
 * Process segmentation results from MediaPipe
 */
function processSegmentationResult(results: Results): void {
  if (!pendingSegmentation) {
    // No pending request, ignore the results
    return;
  }

  const { config, timestamp, startTime } = pendingSegmentation;
  const latency = performance.now() - startTime;

  try {
    // Extract segmentation mask from results
    let mask: ImageData | null = null;

    if (results.segmentationMask) {
      // Create temporary canvas to convert the mask to ImageData
      const canvas = new OffscreenCanvas(results.segmentationMask.width, results.segmentationMask.height);
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Draw the segmentation mask to the canvas
        ctx.drawImage(results.segmentationMask, 0, 0);
        
        // Extract ImageData from the canvas
        mask = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        throw new Error('Could not get 2D context for mask processing');
      }
    }

    if (!mask) {
      throw new Error('No segmentation mask generated');
    }

    // Track performance metrics
    frameCount++;
    totalLatency += latency;
    const instantFps = 1000 / latency;
    fpsHistory.push(instantFps);
    if (fpsHistory.length > MAX_FPS_HISTORY) {
      fpsHistory.shift();
    }

    const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;

    // Calculate auto-frame if enabled
    let autoFrame = undefined;
    if (config.enableAutoFrame && mask) {
      autoFrame = calculateAutoFrame(mask);
    }

    const response: WorkerSegmentResponse = {
      type: 'result',
      mask,
      latency,
      fps: avgFps,
      autoFrame,
      timestamp
    };

    // Transfer mask buffer to avoid copying
    self.postMessage(response, [mask.data.buffer]);

    if (pendingSegmentation) {
      // Resolve pending promise
      pendingSegmentation.resolve(response);
      pendingSegmentation = null;
    }

  } catch (error) {
    const errorResponse: WorkerError = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown segmentation error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: performance.now()
    };

    self.postMessage(errorResponse);

    if (pendingSegmentation) {
      // Reject pending promise
      pendingSegmentation.reject(error);
      pendingSegmentation = null;
    }
  }
}

// ============================================================================
// Auto-Frame Calculation
// ============================================================================

/**
 * Calculate optimal frame position based on segmentation mask
 */
function calculateAutoFrame(mask: ImageData): {
  panX: number;
  panY: number;
  zoom: number;
  faceDetected: boolean;
} {
  const { data, width, height } = mask;

  let totalX = 0;
  let totalY = 0;
  let pixelCount = 0;

  // Find center of mass from mask
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha: number = data[i + 3] ?? 0;

      if (alpha > 128) { // Threshold for "person detected"
        totalX += x;
        totalY += y;
        pixelCount++;
      }
    }
  }

  if (pixelCount === 0) {
    // No person detected - return centered
    return {
      panX: 0,
      panY: 0,
      zoom: 1,
      faceDetected: false
    };
  }

  // Calculate center of mass
  const centerX = totalX / pixelCount;
  const centerY = totalY / pixelCount;

  // Convert to normalized coordinates (-1 to 1)
  const panX = (centerX / width - 0.5) * 2;
  const panY = (centerY / height - 0.5) * 2;

  // Calculate bounding box for zoom
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 0) > 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;
  const boxSize = Math.max(boxWidth, boxHeight);

  // Target zoom to frame person with padding
  const PADDING_FACTOR = 1.3;
  const zoom = boxSize > 0 ? (width / boxSize) * PADDING_FACTOR : 1;

  return {
    panX: -panX, // Invert for camera control
    panY: -panY,
    zoom: Math.min(Math.max(zoom, 1), 2.5), // Clamp between 1x and 2.5x
    faceDetected: true
  };
}

// ============================================================================
// Segmentation Processing
// ============================================================================

/**
 * Process a single video frame for segmentation
 */
function processSegmentation(request: WorkerSegmentRequest): Promise<WorkerSegmentResponse> {
  const startTime = performance.now();

  return new Promise((resolve, reject) => {
    // Handle pending request
    if (pendingSegmentation) {
      // Reject the previous request if a new one comes in
      pendingSegmentation.reject(new Error('New segmentation request received'));
    }

    pendingSegmentation = {
      resolve,
      reject,
      config: request.config,
      timestamp: request.timestamp,
      startTime
    };

    try {
      const { videoFrame, config } = request;

      // Lazy initialization if needed
      if (!selfieSegmentation) {
        initializeSegmenter(config.model).catch(error => {
          reject(error);
          if (pendingSegmentation && pendingSegmentation.reject === reject) {
            pendingSegmentation = null;
          }
        });
      }

      if (!selfieSegmentation) {
        throw new Error('Selfie segmentation failed to initialize');
      }

      // Send the video frame to the selfie segmentation process
      // We need to draw the video frame to a canvas first, as MediaPipe expects a canvas element
      const canvas = new OffscreenCanvas(videoFrame.width, videoFrame.height);
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not create offscreen canvas context');
      }
      
      // Draw the video frame to the canvas
      ctx.drawImage(videoFrame, 0, 0);
      
      // Send canvas to MediaPipe
      selfieSegmentation.send({ image: canvas as any }); // Type assertion for OffscreenCanvas
      
    } catch (error) {
      reject(error);
      if (pendingSegmentation && pendingSegmentation.reject === reject) {
        pendingSegmentation = null;
      }
    }
  });
}

// ============================================================================
// Initialization Handler
// ============================================================================

async function handleInit(request: WorkerInitRequest): Promise<void> {
  try {
    await initializeSegmenter(request.modelType);

    const response: WorkerInitResponse = {
      type: 'initialized',
      modelType: request.modelType,
      success: true
    };

    self.postMessage(response);
  } catch (error) {
    const errorResponse: WorkerError = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Initialization failed',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: performance.now()
    };

    self.postMessage(errorResponse);
  }
}

// ============================================================================
// Cleanup Handler
// ============================================================================

function handleDispose(): void {
  try {
    selfieSegmentation?.close();
    selfieSegmentation = null;
    frameCount = 0;
    totalLatency = 0;
    fpsHistory.length = 0;
    pendingSegmentation = null;

    console.log('[Worker] Disposed successfully');
  } catch (error) {
    console.error('[Worker] Disposal error:', error);
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event;

  switch (data.type) {
    case 'segment':
      processSegmentation(data).catch(error => {
        const errorResponse: WorkerError = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Segmentation processing failed',
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: performance.now()
        };
        self.postMessage(errorResponse);
      });
      break;

    case 'init':
      await handleInit(data);
      break;

    case 'dispose':
      handleDispose();
      break;

    default:
      console.warn('[Worker] Unknown message type:', (data as any).type);
  }
};

// ============================================================================
// Worker Ready Signal
// ============================================================================

const readyMessage: WorkerReady = {
  type: 'ready',
  version: '1.0.0'
};

self.postMessage(readyMessage);

// ============================================================================
// Cleanup on Termination
// ============================================================================

self.addEventListener('unload', () => {
  handleDispose();
});

console.log('[Worker] Segmentation worker loaded and ready');