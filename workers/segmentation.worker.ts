/**
 * Body Segmentation Web Worker
 *
 * This worker handles MediaPipe body segmentation off the main thread.
 *
 * Key considerations:
 * - Uses OffscreenCanvas for GPU-accelerated rendering
 * - Handles MediaPipe initialization within the worker context
 * - Communicates via postMessage with ImageBitmap transfers for zero-copy
 *
 * CDN Loading Strategy:
 * MediaPipe CDN scripts can be problematic in worker contexts due to CORS.
 * Options:
 * 1. Bundle WASM files locally (recommended for production)
 * 2. Use importScripts() with CORS-enabled CDN
 * 3. Proxy model loading through main thread
 *
 * This implementation uses option 2 with fallback detection.
 */

/// <reference lib="webworker" />

// Declare worker globals
declare const importScripts: (...urls: string[]) => void;

// Face mesh types
interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

// Worker message types
interface WorkerMessageInit {
  type: 'init';
  modelPath?: string;
}

interface WorkerMessageSegment {
  type: 'segment';
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
}

interface WorkerMessageTerminate {
  type: 'terminate';
}

type WorkerMessage = WorkerMessageInit | WorkerMessageSegment | WorkerMessageTerminate;

// Response types
interface WorkerResponseReady {
  type: 'ready';
  success: boolean;
  error?: string;
}

interface WorkerResponseMask {
  type: 'mask';
  maskData: Uint8ClampedArray;
  width: number;
  height: number;
}

interface WorkerResponseError {
  type: 'error';
  message: string;
}

type WorkerResponse = WorkerResponseReady | WorkerResponseMask | WorkerResponseError;

// Global state
let segmenter: unknown = null;
let faceMesh: unknown = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let isInitialized = false;

// MediaPipe constants
const FOREGROUND_COLOR = { r: 255, g: 255, b: 255, a: 255 };
const BACKGROUND_COLOR = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Initialize MediaPipe segmenter
 *
 * Note: This requires MediaPipe scripts to be loaded.
 * In production, bundle these locally to avoid CDN issues.
 */
async function initializeSegmenter(modelPath?: string): Promise<boolean> {
  try {
    // Check if we're in a worker context that supports required APIs
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas not supported in this worker context');
    }

    // Try to load MediaPipe
    // In production, use locally bundled scripts
    const cdnPath = modelPath || '/mediapipe/';

    // Attempt to import MediaPipe scripts
    // Note: This may fail due to CORS - see fallback in main thread
    try {
      importScripts(
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core',
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter',
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl',
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation',
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection'
      );
    } catch (e) {
      console.warn('[Worker] Failed to load TensorFlow scripts:', e);
      // Try alternative loading method
      throw new Error('CDN script loading failed - use main thread fallback');
    }

    // Access the globally loaded bodySegmentation
    const bodySegmentation = (self as unknown as { bodySegmentation: unknown }).bodySegmentation;
    if (!bodySegmentation) {
      throw new Error('bodySegmentation not available after script load');
    }

    // Create segmenter
    const model = (
      bodySegmentation as { SupportedModels: { MediaPipeSelfieSegmentation: unknown } }
    ).SupportedModels.MediaPipeSelfieSegmentation;
    const segmenterConfig = {
      runtime: 'mediapipe' as const,
      solutionPath: cdnPath,
      modelType: 'general' as const,
    };

    segmenter = await (
      bodySegmentation as { createSegmenter: (model: unknown, config: unknown) => Promise<unknown> }
    ).createSegmenter(model, segmenterConfig);

    // Initialize Face Mesh
    try {
      const faceLandmarksDetection = (self as unknown as { faceLandmarksDetection: unknown })
        .faceLandmarksDetection;
      if (faceLandmarksDetection) {
        const faceModel = (
          faceLandmarksDetection as { SupportedModels: { MediaPipeFaceMesh: unknown } }
        ).SupportedModels.MediaPipeFaceMesh;
        faceMesh = await (
          faceLandmarksDetection as {
            createDetector: (model: unknown, config: unknown) => Promise<unknown>;
          }
        ).createDetector(faceModel, {
          runtime: 'mediapipe',
          refineLandmarks: true,
          solutionPath: cdnPath,
        });
        console.log('[Worker] Face mesh initialized');
      }
    } catch (e) {
      console.warn('[Worker] Face mesh initialization failed:', e);
    }

    // Create offscreen canvas for processing
    offscreenCanvas = new OffscreenCanvas(640, 480);
    ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    isInitialized = true;
    return true;
  } catch (e) {
    console.error('[Worker] Initialization failed:', e);
    return false;
  }
}

/**
 * Process a video frame and return the segmentation mask
 */
async function processFrame(
  imageBitmap: ImageBitmap,
  width: number,
  height: number
): Promise<Uint8ClampedArray | null> {
  if (!segmenter || !offscreenCanvas || !ctx) {
    return null;
  }

  try {
    // Resize canvas if needed
    if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
    }

    // Draw the frame to the canvas
    ctx.drawImage(imageBitmap, 0, 0, width, height);

    // Run segmentation
    const bodySegmentation = (self as unknown as { bodySegmentation: unknown }).bodySegmentation;
    const segmentation = await (
      segmenter as { segmentPeople: (source: OffscreenCanvas) => Promise<unknown[]> }
    ).segmentPeople(offscreenCanvas);

    // Convert to binary mask
    const mask = await (
      bodySegmentation as {
        toBinaryMask: (seg: unknown[], fg: unknown, bg: unknown) => Promise<ImageData>;
      }
    ).toBinaryMask(segmentation, FOREGROUND_COLOR, BACKGROUND_COLOR);

    // Run face detection if available
    if (faceMesh) {
      try {
        const faces = await (
          faceMesh as { estimateFaces: (source: OffscreenCanvas) => Promise<unknown[]> }
        ).estimateFaces(offscreenCanvas);
        if (faces.length > 0) {
          const face = faces[0] as { keypoints: FaceLandmark[] };
          // Post face landmarks
          self.postMessage({
            type: 'face-landmarks',
            data: face.keypoints,
          });
        }
      } catch (e) {
        console.warn('[Worker] Face detection error:', e);
      }
    }

    // Clean up the ImageBitmap
    imageBitmap.close();

    return mask.data;
  } catch (e) {
    console.error('[Worker] Segmentation error:', e);
    imageBitmap.close();
    return null;
  }
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'init': {
      const success = await initializeSegmenter(message.modelPath);
      const response: WorkerResponseReady = {
        type: 'ready',
        success,
        error: success ? undefined : 'Failed to initialize segmenter',
      };
      self.postMessage(response);
      break;
    }

    case 'segment': {
      if (!isInitialized) {
        const errorResponse: WorkerResponseError = {
          type: 'error',
          message: 'Worker not initialized',
        };
        self.postMessage(errorResponse);
        return;
      }

      const maskData = await processFrame(message.imageBitmap, message.width, message.height);

      if (maskData) {
        const response: WorkerResponseMask = {
          type: 'mask',
          maskData,
          width: message.width,
          height: message.height,
        };
        // Transfer the array buffer for zero-copy performance
        // Using type assertion for worker context postMessage signature
        (
          self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void }
        ).postMessage(response, [maskData.buffer] as Transferable[]);
      } else {
        const errorResponse: WorkerResponseError = {
          type: 'error',
          message: 'Segmentation failed',
        };
        self.postMessage(errorResponse);
      }
      break;
    }

    case 'terminate': {
      segmenter = null;
      offscreenCanvas = null;
      ctx = null;
      isInitialized = false;
      self.close();
      break;
    }
  }
};

// Export for type checking (worker files don't actually export)
export type { WorkerMessage, WorkerResponse };
