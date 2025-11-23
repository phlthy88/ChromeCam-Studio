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

// importScripts is available in classic workers

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
let faceMesh: any = null;
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

    // Import libraries dynamically
    await import('@tensorflow/tfjs-core');
    await import('@tensorflow/tfjs-backend-webgl');
    const bodySegmentation = await import('@tensorflow-models/body-segmentation');
    const { FaceMesh } = await import('@mediapipe/face_mesh');

    console.log('[Worker] Libraries loaded successfully');

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
      console.log('[Worker] Initializing face mesh...');
      if (FaceMesh) {
        console.log('[Worker] Creating face mesh instance...');
        faceMesh = new (FaceMesh as any)({
          locateFile: (file: string) => `${cdnPath}${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log('[Worker] Face mesh initialized successfully');
      } else {
        console.warn('[Worker] FaceMesh not available');
      }
    } catch (e) {
      console.error('[Worker] Face mesh initialization failed:', e);
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
  console.log('[Worker] Processing frame:', width, 'x', height);
  if (!segmenter || !offscreenCanvas || !ctx) {
    console.warn(
      '[Worker] Not initialized - segmenter:',
      !!segmenter,
      'canvas:',
      !!offscreenCanvas,
      'ctx:',
      !!ctx
    );
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
      console.log('[Worker] Running face detection...');
      try {
        // For MediaPipe FaceMesh, use onResults callback
        await new Promise<void>((resolve) => {
          faceMesh.onResults((results: any) => {
            console.log('[Worker] Face detection result:', results);
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
              const landmarks = results.multiFaceLandmarks[0];
              console.log('[Worker] Detected face with', landmarks.length, 'landmarks');
              // Post face landmarks
              self.postMessage({
                type: 'face-landmarks',
                data: landmarks,
              });
            }
            resolve();
          });
          faceMesh.send({ image: offscreenCanvas });
        });
      } catch (e) {
        console.error('[Worker] Face detection error:', e);
      }
    } else {
      console.log('[Worker] Face mesh not available, skipping face detection');
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
