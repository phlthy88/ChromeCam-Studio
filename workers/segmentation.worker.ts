// workers/segmentation.worker.ts

// Import TensorFlow libraries directly
// Vite will bundle these into the worker file
import * as tf from '@tensorflow/tfjs';
import * as bodyPix from '@tensorflow-models/body-pix';

// =============================================================================
// POLYFILLS for Worker Environment
// =============================================================================

// Ensure atob is available for TensorFlow.js base64 decoding
if (typeof atob === 'undefined') {
  // Copy atob from self (worker global) to globalThis
  if (typeof self !== 'undefined' && (self as any).atob) {
    (globalThis as any).atob = (self as any).atob;
  }
}

// =============================================================================
// Worker State
// =============================================================================

let net: bodyPix.BodyPix | null = null;
let isInitialized = false;
let isInitializing = false;
let autoFrameEnabled = false;

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

  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
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
    const faceY = minY + boxHeight * 0.25;

    const centerXPercent = boxCenterX / width;
    const faceYPercent = faceY / height;

    const targetPanX = (0.5 - centerXPercent) * 100;
    const targetPanY = (0.5 - faceYPercent) * 100;

    let targetZoom = (height * 0.6) / boxHeight;
    targetZoom = Math.max(1, Math.min(targetZoom, 2.5));

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

    // Run segmentation
    // CASTING: BodyPix types don't officially support OffscreenCanvas yet, but it works.
    const segmentation = await net.segmentPerson(canvas as unknown as HTMLCanvasElement, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7,
    });

    // Convert to mask
    const maskBitmap = await segmentationToMask(segmentation);

    // Calculate auto-frame
    let autoFrameTransform = undefined;
    if (autoFrameEnabled) {
      autoFrameTransform = calculateAutoFrameTransform(segmentation);
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
