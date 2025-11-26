// workers/segmentation.worker.ts

// Import TensorFlow libraries directly
// Vite will bundle these into the worker file
import * as tf from '@tensorflow/tfjs';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

import {
  BODY_SEGMENTATION_THRESHOLD,
  AUTO_FRAME_CALC_INTERVAL_MS,
  FACE_BOX_Y_OFFSET,
  FRAME_CENTER_POINT,
  AUTOFRAME_TARGET_ZOOM_FACTOR,
  AUTOFRAME_MIN_ZOOM,
  AUTOFRAME_MAX_ZOOM,
} from '../constants/ai';

// =============================================================================
// POLYFILLS for Worker Environment
// =============================================================================

// =============================================================================
// Worker State
// =============================================================================

let net: bodyPix.BodyPix | null = null;
let faceDetector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
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
    console.log('[Worker] Loading Face Mesh model...');

    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig: faceLandmarksDetection.MediaPipeFaceMeshTfjsModelConfig = {
      runtime: 'tfjs',
      refineLandmarks: true, // Enable iris tracking for better eye detection
      maxFaces: 1, // Optimize for single face
    };

    faceDetector = await faceLandmarksDetection.createDetector(model, detectorConfig);

    console.log('[Worker] Face Mesh model loaded successfully');
    return true;
  } catch (error) {
    console.error('[Worker] Face Mesh loading failed:', error);
    return false;
  }
}

// =============================================================================
// Auto-Frame Transform Calculation
// =============================================================================
function calculateAutoFrameTransform(segmentation: bodyPix.SemanticPersonSegmentation) {
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

  console.log(
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
async function segmentationToMask(segmentation: bodyPix.SemanticPersonSegmentation) {
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
  // Prevent double-initialization
  if (isInitializing || isInitialized) {
    console.warn('[Worker] Already initialized or initializing');
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
    console.warn('[Worker] Diagnostic Info:', {
      tfVersion: tf.version.tfjs,
      tfBackend: tf.getBackend(),
      isWorker: typeof WorkerGlobalScope !== 'undefined',
      isModule: typeof importScripts !== 'function',
    });

    console.warn('[Worker] Setting up TensorFlow.js...');

    // Initialize TensorFlow.js first
    await tf.ready();

    // Try WebGL backend, fallback to CPU if not available
    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch (backendError) {
      console.warn('[Worker] WebGL backend failed, falling back to CPU:', backendError);
      await tf.setBackend('cpu');
      await tf.ready();
    }

    console.warn(`[Worker] TensorFlow.js ready with ${tf.getBackend()} backend.`);

    console.warn('[Worker] TensorFlow.js ready with WebGL backend.');
    console.warn('[Worker] Loading BodyPix model...');

    // Load model locally from the bundle
    // Use different configuration to avoid base64 decoding issues
    net = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 4, // Use 4 bytes instead of 2 to avoid quantization issues
    });

    // Initialize face detection
    console.warn('[Worker] Loading Face Mesh model...');
    await initFaceDetector();

    isInitialized = true;
    isInitializing = false;
    console.warn('[Worker] Initialization complete!');

    // Send success message immediately
    self.postMessage({
      type: 'init-complete',
      success: true,
      timestamp: performance.now(),
    });
  } catch (error) {
    isInitializing = false;
    console.error('[Worker] Initialization failed:', error);

    // Send failure message immediately
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: error instanceof Error ? error.message : String(error),
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

    console.log(
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

            console.log(`[Worker] Face detected: ${faceLandmarks.length} landmarks`);

            // Send landmarks to main thread
            self.postMessage({
              type: 'face-landmarks',
              landmarks: faceLandmarks,
              timestamp: performance.now(),
            });
          } else {
            console.log('[Worker] No face detected');
          }
        } else {
          console.log(
            `[Worker] Skipping face detection for high resolution: ${imageBitmap.width}x${imageBitmap.height}`
          );
        }
      } catch (faceError) {
        // Face detection failed, continue without landmarks
        console.warn('[Worker] Face detection error:', faceError);
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
        console.log('[Worker] Auto-frame recalculated');
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
    console.error('[Worker] Processing failed:', error);
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
