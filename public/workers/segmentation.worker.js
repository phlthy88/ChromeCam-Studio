/**
 * Segmentation Worker - TensorFlow.js BodyPix
 *
 * CRITICAL: This file MUST live in public/workers/ to bypass Vite's module system.
 * Do NOT move this to src/ or use any TypeScript import syntax.
 *
 * Uses TensorFlow.js BodyPix model which:
 * - Loads models via HTTP fetch (not importScripts)
 * - Uses pure WebGL (no WASM dependencies)
 * - Works correctly in both classic and module workers
 */

// =============================================================================
// Load TensorFlow.js and BodyPix - MUST be separate importScripts calls
// =============================================================================

try {
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
  console.log('[Worker] TensorFlow.js loaded successfully');
} catch (e) {
  console.error('[Worker] Failed to load TensorFlow.js:', e);
  throw e;
}

console.log('[Worker] Loading BodyPix from CDN...');
try {
  importScripts(
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.js'
  );
  console.log('[Worker] BodyPix loaded successfully');
} catch (e) {
  console.error('[Worker] Failed to load BodyPix:', e);
  throw e;
}

console.log('[Worker] TensorFlow.js and BodyPix loaded via importScripts');
console.log('[Worker] TensorFlow.js available:', !!self.tf);
console.log('[Worker] BodyPix available:', !!self.BodyPix);
console.log(
  '[Worker] Checking self keys:',
  Object.keys(self).filter((k) => k.includes('body') || k.includes('Body') || k.includes('tf'))
);
console.log(
  '[Worker] All globals after importScripts:',
  Object.keys(self).filter((k) => k.includes('body') || k.includes('Body') || k.includes('tf'))
);

// Debug: Check for common issues
if (!self.tf) {
  console.error('[Worker] TensorFlow.js not found! Available globals:', Object.keys(self));
}
if (!self['body-pix']) {
  console.error('[Worker] BodyPix not found! Available globals:', Object.keys(self));
}

// =============================================================================
// Worker State
// =============================================================================

let net = null;
let isInitialized = false;
let autoFrameEnabled = false;
let processingFrame = false;

// =============================================================================
// Auto-Frame Transform Calculation
// =============================================================================

function calculateAutoFrameTransform(segmentation) {
  const { width, height, data } = segmentation;

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  // Sample every 8th pixel for performance
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const idx = y * width + x;
      // data[idx] is a confidence value between 0 and 1
      if (data[idx] > 0.5) {
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

async function segmentationToMask(segmentation) {
  const { width, height, data } = segmentation;

  // Validate input data
  if (!width || !height || !data || data.length === 0) {
    console.error('[Worker] Invalid segmentation data:', {
      width,
      height,
      dataLength: data?.length,
    });
    return null;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i++) {
    // data[i] is a confidence value between 0 and 1
    const isPerson = data[i] > 0.5; // Use threshold for person detection
    const value = isPerson ? 255 : 0;
    const offset = i * 4;
    rgba[offset] = value; // R
    rgba[offset + 1] = value; // G
    rgba[offset + 2] = value; // B
    rgba[offset + 3] = 255; // A (fully opaque)
  }

  try {
    const imageData = new ImageData(rgba, width, height);
    return await createImageBitmap(imageData);
  } catch (error) {
    console.error('[Worker] Error creating ImageBitmap in segmentationToMask:', error);
    // Return a default mask or handle the error appropriately
    return null; // Or a default ImageBitmap
  }
}

// =============================================================================
// Segmenter Initialization
// =============================================================================

async function initSegmenter() {
  try {
    console.log('[Worker] Initializing TensorFlow.js...');

    // Configure TensorFlow.js for WebGL backend
    console.log('[Worker] Setting backend to webgl...');
    await tf.setBackend('webgl');
    console.log('[Worker] Waiting for TensorFlow.js to be ready...');
    await tf.ready();
    console.log('[Worker] TensorFlow.js ready, backend:', tf.getBackend());

    console.log('[Worker] Loading BodyPix model...');
    console.log('[Worker] Checking BodyPix global:', !!self.BodyPix);
    console.log('[Worker] Checking BodyPix.load:', typeof self.BodyPix?.load);

    // Debug: Check if BodyPix is accessible
    if (!self.BodyPix) {
      console.error('[Worker] BodyPix global not found. Available globals:', Object.keys(self));
      throw new Error(
        'BodyPix global not found. Available globals: ' + Object.keys(self).join(', ')
      );
    }

    if (typeof self.BodyPix.load !== 'function') {
      throw new Error(
        'BodyPix.load is not a function. Available methods: ' + Object.keys(self.BodyPix).join(', ')
      );
    }

    // Load BodyPix with MobileNetV1 architecture
    // This downloads ~7MB model on first use, cached thereafter
    console.log('[Worker] Starting BodyPix.load() - this may take 10-30 seconds on first load...');
    const loadStartTime = performance.now();

    net = await self.BodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
    });

    const loadTime = ((performance.now() - loadStartTime) / 1000).toFixed(2);
    isInitialized = true;
    console.log(`[Worker] BodyPix model loaded successfully in ${loadTime}s!`);

    self.postMessage({ type: 'init-complete', success: true });
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
    console.error('[Worker] Error stack:', error.stack);
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: error.message || String(error),
    });
  }
}

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(imageBitmap, autoFrame) {
  if (!isInitialized || !net) {
    console.warn('[Worker] Not initialized, skipping frame');
    return;
  }

  // Validate input imageBitmap
  if (!imageBitmap || !imageBitmap.width || !imageBitmap.height) {
    console.error('[Worker] Invalid imageBitmap in processFrame:', {
      imageBitmapExists: !!imageBitmap,
      width: imageBitmap?.width,
      height: imageBitmap?.height,
    });
    if (imageBitmap) {
      imageBitmap.close();
    }
    return;
  }

  if (processingFrame) {
    // Drop frame if still processing previous
    imageBitmap.close();
    return;
  }

  processingFrame = true;
  autoFrameEnabled = autoFrame;

  try {
    // Create OffscreenCanvas to process the ImageBitmap
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }
    ctx.drawImage(imageBitmap, 0, 0);

    // Run segmentation
    const segmentation = await net.segmentPerson(canvas, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7,
      scoreThreshold: 0.3,
    });

    // Validate segmentation result
    if (!segmentation || !segmentation.data) {
      throw new Error('Invalid segmentation result received');
    }

    // Create mask bitmap for transfer
    const maskBitmap = await segmentationToMask(segmentation);
    if (!maskBitmap) {
      console.warn('[Worker] segmentationToMask returned null, skipping frame');
      return;
    }

    // Calculate auto-frame transform if enabled
    let autoFrameTransform = null;
    if (autoFrameEnabled) {
      autoFrameTransform = calculateAutoFrameTransform(segmentation);
    }

    // Build response
    const response = {
      type: 'mask',
      mask: maskBitmap,
      timestamp: performance.now(),
    };

    if (autoFrameTransform) {
      response.autoFrameTransform = autoFrameTransform;
    }

    // Transfer the mask bitmap to main thread (zero-copy)
    self.postMessage(response, [maskBitmap]);
  } catch (error) {
    console.error('[Worker] Processing failed:', error);
    self.postMessage({ type: 'error', error: String(error) });
  } finally {
    imageBitmap.close();
    processingFrame = false;
  }
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async function (e) {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      await initSegmenter();
      break;

    case 'process':
      // Validate message data before processing
      if (!msg || !msg.image) {
        console.error('[Worker] Invalid process message:', msg);
        return;
      }
      await processFrame(msg.image, msg.autoFrame);
      break;

    case 'close':
      console.log('[Worker] Closing...');
      if (net) {
        net.dispose();
        net = null;
      }
      isInitialized = false;
      self.close();
      break;

    default:
      console.warn('[Worker] Unknown message type:', msg.type);
  }
};

// =============================================================================
// Worker Ready Signal
// =============================================================================

console.log('[Worker] Segmentation worker loaded (TensorFlow.js BodyPix)');
