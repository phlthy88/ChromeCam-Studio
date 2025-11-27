// workers/segmentation.worker.ts

import {
  BODY_SEGMENTATION_THRESHOLD,
  AUTO_FRAME_CALC_INTERVAL_MS,
  FACE_BOX_Y_OFFSET,
  FRAME_CENTER_POINT,
  AUTOFRAME_TARGET_ZOOM_FACTOR,
  AUTOFRAME_MIN_ZOOM,
  AUTOFRAME_MAX_ZOOM,
} from '../constants/ai';

// Type imports only (these don't emit code)
import type * as tfTypes from '@tensorflow/tfjs';
import type * as bodyPixTypes from '@tensorflow-models/body-pix';
import type * as faceLandmarksTypes from '@tensorflow-models/face-landmarks-detection';

// =============================================================================
// POLYFILLS & SETUP
// =============================================================================

// Robust global polyfill for libraries expecting 'global' or 'window'
if (typeof self !== 'undefined') {
  (self as any).global = self;
}

// Ensure atob is available
if (typeof atob === 'undefined') {
  if (typeof self !== 'undefined' && (self as any).atob) {
    (globalThis as any).atob = (self as any).atob;
  }
}

// Worker-safe logging
const workerLogger = {
  info: (message: string, data?: any) => {
    self.postMessage({ type: 'log', level: 'info', message, data });
  },
  warn: (message: string, data?: any) => {
    self.postMessage({ type: 'log', level: 'warn', message, data });
  },
  error: (message: string, data?: any) => {
    self.postMessage({ type: 'log', level: 'error', message, data });
  },
  debug: (message: string, data?: any) => {
    self.postMessage({ type: 'log', level: 'debug', message, data });
  },
};

// =============================================================================
// Worker State
// =============================================================================

// Modules loaded dynamically
let tf: typeof tfTypes;
let bodyPix: typeof bodyPixTypes;
let faceLandmarksDetection: typeof faceLandmarksTypes;

let net: bodyPixTypes.BodyPix | null = null;
let faceDetector: faceLandmarksTypes.FaceLandmarksDetector | null = null;
let isInitialized = false;
let isInitializing = false;
let autoFrameEnabled = false;

// Auto-frame throttling state
let lastAutoFrameCalc = 0;
const AUTO_FRAME_CALC_INTERVAL = AUTO_FRAME_CALC_INTERVAL_MS;
let cachedAutoFrameTransform: ReturnType<typeof calculateAutoFrameTransform> = null;

// =============================================================================
// Face Detection Initialization
// =============================================================================

async function initFaceDetector(): Promise<boolean> {
  try {
    workerLogger.info('[Worker] Initializing Face Mesh detector...');

    // ✅ Verify we're on CPU backend
    const backend = tf.getBackend();
    if (backend !== 'cpu') {
      workerLogger.warn(`[Worker] Face detection requires CPU backend, current: ${backend}`);
      return false;
    }

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig: faceLandmarksTypes.MediaPipeFaceMeshTfjsModelConfig = {
      runtime: 'tfjs',
      refineLandmarks: false,
      maxFaces: 1,
    };

    faceDetector = await faceLandmarksDetection.createDetector(model, detectorConfig);
    workerLogger.info('[Worker] Face Mesh detector ready');
    return true;
  } catch (error) {
    workerLogger.error('[Worker] Face Mesh initialization failed:', error);
    return false;
  }
}

// =============================================================================
// Auto-Frame Transform Calculation
// =============================================================================
function calculateAutoFrameTransform(segmentation: bodyPixTypes.SemanticPersonSegmentation) {
  const { width, height, data } = segmentation;

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  // 🎯 ADAPTIVE STRIDE: Higher resolutions get more aggressive downsampling
  const pixelCount = width * height;
  let stride = 8; // Default stride

  if (pixelCount > 3840 * 2160) {
    // 8K+
    stride = 32;
  } else if (pixelCount > 2560 * 1440) {
    // 1440p+
    stride = 24;
  } else if (pixelCount > 1920 * 1080) {
    // 1080p+
    stride = 16;
  } else if (pixelCount > 1280 * 720) {
    // 720p+
    stride = 12;
  }
  // 720p and below: use stride = 8

  workerLogger.info(
    `[Worker] Auto-frame: ${width}x${height} (${pixelCount.toLocaleString()}px) using stride ${stride}`
  );

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = y * width + x;
      if (data[idx] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (found && maxY > minY) {
    const boxCenterX = (minX + maxX) / 2;
    const boxHeight = maxY - minY;
    const faceY = minY + boxHeight * FACE_BOX_Y_OFFSET;

    const centerXPercent = boxCenterX / width;
    const faceYPercent = faceY / height;

    const targetPanX = (FRAME_CENTER_POINT - centerXPercent) * 100;
    const targetPanY = (FRAME_CENTER_POINT - faceYPercent) * 100;

    let targetZoom = (height * AUTOFRAME_TARGET_ZOOM_FACTOR) / boxHeight;
    targetZoom = Math.max(AUTOFRAME_MIN_ZOOM, Math.min(targetZoom, AUTOFRAME_MAX_ZOOM));

    return { panX: targetPanX, panY: targetPanY, zoom: targetZoom };
  }

  return null;
}

// =============================================================================
// Convert Segmentation to ImageBitmap Mask
// =============================================================================
async function segmentationToMask(segmentation: bodyPixTypes.SemanticPersonSegmentation) {
  const { width, height, data } = segmentation;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i++) {
    const value = data[i] === 1 ? 255 : 0;
    const idx = i * 4;
    rgba[idx] = value; // R
    rgba[idx + 1] = value; // G
    rgba[idx + 2] = value; // B
    rgba[idx + 3] = 255; // A (always opaque)
  }

  const imageData = new ImageData(rgba, width, height);
  return createImageBitmap(imageData);
}

// =============================================================================
// Network Initialization
// =============================================================================

async function initSegmenter() {
  if (isInitializing || isInitialized) {
    workerLogger.warn('[Worker] Already initialized or initializing');
    self.postMessage({
      type: 'init-complete',
      success: isInitialized,
      error: isInitializing ? 'Already initializing' : undefined,
      timestamp: performance.now(),
    });
    return;
  }

  isInitializing = true;

  try {
    workerLogger.info('[Worker] Starting initialization...');

    // 1. Load Modules Dynamically
    // This prevents the worker from crashing/hanging at startup
    workerLogger.info('[Worker] Loading TensorFlow modules dynamically...');
    const modules = await Promise.all([
      import('@tensorflow/tfjs'),
      import('@tensorflow-models/body-pix'),
      import('@tensorflow-models/face-landmarks-detection')
    ]);

    tf = modules[0];
    bodyPix = modules[1];
    faceLandmarksDetection = modules[2];

    workerLogger.info('[Worker] Modules loaded. Diagnostic Info:', {
      tfVersion: tf.version.tfjs,
      tfBackend: tf.getBackend(),
      isWorker: typeof WorkerGlobalScope !== 'undefined',
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    });

    // 2. Set Backend to CPU
    workerLogger.info('[Worker] Setting TensorFlow.js backend to CPU...');
    await tf.setBackend('cpu');
    await tf.ready();

    const actualBackend = tf.getBackend();
    if (actualBackend !== 'cpu') {
      throw new Error(`Failed to initialize CPU backend. Current: ${actualBackend}`);
    }

    // 3. Load BodyPix with Timeout
    workerLogger.info('[Worker] Loading BodyPix model...');
    const MODEL_LOAD_TIMEOUT = 25000;

    const loadBodyPixWithTimeout = () => {
      return Promise.race([
        bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 4,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('BodyPix model loading timeout after 25s')), MODEL_LOAD_TIMEOUT)
        ),
      ]);
    };

    net = await loadBodyPixWithTimeout();
    workerLogger.info('[Worker] BodyPix model loaded successfully');

    // 4. Load Face Mesh (Optional)
    workerLogger.info('[Worker] Loading Face Mesh model (optional)...');
    try {
      const faceInitSuccess = await Promise.race([
        initFaceDetector(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);

      if (!faceInitSuccess) {
        workerLogger.warn('[Worker] Face Mesh model loading timed out - continuing without face detection');
      }
    } catch (faceError) {
      workerLogger.warn('[Worker] Face Mesh loading failed (non-critical):', faceError);
    }

    isInitialized = true;
    isInitializing = false;
    workerLogger.info('[Worker] ✅ Initialization complete!');

    self.postMessage({
      type: 'init-complete',
      success: true,
      backend: actualBackend,
      faceDetectionAvailable: faceDetector !== null,
      timestamp: performance.now(),
    });
  } catch (error) {
    isInitializing = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    workerLogger.error('[Worker] ❌ Initialization failed:', errorMessage);

    self.postMessage({
      type: 'init-complete',
      success: false,
      error: errorMessage,
      timestamp: performance.now(),
    });
  }
}

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(imageBitmap: ImageBitmap, autoFrame: boolean) {
  if (!isInitialized || !net) {
    imageBitmap.close();
    return;
  }

  try {
    autoFrameEnabled = autoFrame;

    // BodyPix expects an HTMLCanvasElement, HTMLImageElement, or ImageData
    // In a worker, we use OffscreenCanvas
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get OffscreenCanvas context');

    ctx.drawImage(imageBitmap, 0, 0);

    // Run segmentation with adaptive resolution
    // CASTING: BodyPix types don't officially support OffscreenCanvas yet, but it works.
    const pixelCount = imageBitmap.width * imageBitmap.height;
    let internalResolution: 'low' | 'medium' | 'high' | 'full' = 'medium';

    // 🎯 ADAPTIVE INTERNAL RESOLUTION: Reduce processing for high resolutions
    if (pixelCount > 3840 * 2160) {
      // 8K+
      internalResolution = 'low';
    } else if (pixelCount > 2560 * 1440) {
      // 1440p+
      internalResolution = 'low';
    } else if (pixelCount > 1920 * 1080) {
      // 1080p+
      internalResolution = 'medium';
    } else if (pixelCount > 1280 * 720) {
      // 720p+
      internalResolution = 'medium';
    } else {
      internalResolution = 'high'; // Better quality for lower resolutions
    }

    workerLogger.info(
      `[Worker] Segmentation: ${imageBitmap.width}x${imageBitmap.height} using internal resolution '${internalResolution}'`
    );

    const segmentation = await net.segmentPerson(canvas as unknown as HTMLCanvasElement, {
      flipHorizontal: false,
      internalResolution,
      segmentationThreshold: BODY_SEGMENTATION_THRESHOLD,
    });

    // Run face detection (optimized for high resolutions)
    let faceLandmarks: Array<{ x: number; y: number; z: number }> | null = null;

    if (faceDetector) {
      try {
        // 🎯 ADAPTIVE FACE DETECTION: Skip face detection for very high resolutions to maintain performance
        const pixelCount = imageBitmap.width * imageBitmap.height;
        const shouldSkipFaceDetection = pixelCount > 3840 * 2160 && Math.random() < 0.5; // Skip 50% of frames for 8K+

        if (!shouldSkipFaceDetection) {
          const faces = await faceDetector.estimateFaces(canvas as unknown as HTMLCanvasElement, {
            flipHorizontal: false,
          });

          if (faces.length > 0 && faces[0]?.keypoints) {
            // Extract normalized keypoints
            faceLandmarks = faces[0].keypoints.map((kp) => ({
              x: kp.x / imageBitmap.width,
              y: kp.y / imageBitmap.height,
              z: kp.z || 0,
            }));

            workerLogger.info(`[Worker] Face detected: ${faceLandmarks.length} landmarks`);

            // Send landmarks to main thread
            self.postMessage({
              type: 'face-landmarks',
              landmarks: faceLandmarks,
              timestamp: performance.now(),
            });
          } else {
            workerLogger.info('[Worker] No face detected');
          }
        } else {
          workerLogger.info(
            `[Worker] Skipping face detection for high resolution: ${imageBitmap.width}x${imageBitmap.height}`
          );
        }
      } catch (faceError) {
        // Face detection failed, continue without landmarks
        workerLogger.warn('[Worker] Face detection error:', faceError);
      }
    }

    // Convert to mask
    const maskBitmap = await segmentationToMask(segmentation);

    // Calculate auto-frame (throttled to prevent bottleneck)
    let autoFrameTransform = cachedAutoFrameTransform;

    if (autoFrameEnabled) {
      const now = performance.now();
      const shouldRecalculate = now - lastAutoFrameCalc >= AUTO_FRAME_CALC_INTERVAL;

      if (shouldRecalculate) {
        autoFrameTransform = calculateAutoFrameTransform(segmentation);
        cachedAutoFrameTransform = autoFrameTransform;
        lastAutoFrameCalc = now;
        workerLogger.info('[Worker] Auto-frame recalculated');
      }
    }

    const response: {
      type: 'mask';
      mask: ImageBitmap;
      timestamp: number;
      autoFrameTransform?: unknown;
    } = {
      type: 'mask',
      mask: maskBitmap,
      timestamp: performance.now(),
    };

    if (autoFrameTransform) {
      response.autoFrameTransform = autoFrameTransform;
    }

    self.postMessage(response, [maskBitmap]);
    imageBitmap.close();
  } catch (error) {
    workerLogger.error('[Worker] Processing failed:', error);
    imageBitmap.close();
    self.postMessage({ type: 'error', error: String(error) });
  }
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async function (e: MessageEvent) {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      await initSegmenter();
      break;
    case 'process':
      await processFrame(msg.image, msg.autoFrame);
      break;
    case 'close':
      if (net) {
        net.dispose();
        net = null;
      }
      isInitialized = false;
      self.close();
      break;
  }
};
