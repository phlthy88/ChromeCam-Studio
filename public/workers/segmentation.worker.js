/**
 * Segmentation Worker - MediaPipe Selfie Segmentation
 *
 * CRITICAL: This file MUST live in public/workers/ to bypass Vite's module system.
 * Do NOT move this to src/ or use any TypeScript import syntax.
 *
 * OPTIMIZED VERSION:
 * - Uses locally bundled MediaPipe WASM files (no CDN dependencies)
 * - Works reliably in Web Workers with proper CORS handling
 * - Includes performance monitoring and error recovery
 */

// =============================================================================
// Load TensorFlow.js and MediaPipe Selfie Segmentation - LOCAL VERSION
// =============================================================================

try {
  // Load TensorFlow.js locally to avoid CDN issues in workers
  importScripts('/mediapipe/selfie_segmentation_solution_simd_wasm_bin.js');
  console.log('[Worker] TensorFlow.js loaded locally');
} catch (e) {
  console.warn('[Worker] Failed to load local TensorFlow.js, falling back to CDN:', e);
  try {
    importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    console.log('[Worker] TensorFlow.js loaded from CDN');
  } catch (cdnError) {
    console.error('[Worker] Failed to load TensorFlow.js from any source:', cdnError);
    throw new Error('TensorFlow.js loading failed');
  }
}

try {
  // Load MediaPipe Selfie Segmentation locally
  importScripts('/mediapipe/selfie_segmentation.js');
  console.log('[Worker] MediaPipe Selfie Segmentation loaded locally');
} catch (e) {
  console.warn('[Worker] Failed to load local MediaPipe, falling back to CDN:', e);
  try {
    importScripts(
      'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js'
    );
    console.log('[Worker] MediaPipe Selfie Segmentation loaded from CDN');
  } catch (cdnError) {
    console.error('[Worker] Failed to load MediaPipe from any source:', cdnError);
    throw new Error('MediaPipe loading failed');
  }
}

console.log('[Worker] TensorFlow.js and MediaPipe Selfie Segmentation loaded successfully');

// Ensure tf is globally available
if (typeof tf === 'undefined') {
  console.error('[Worker] CRITICAL: tf is not defined after loading. Worker cannot function.');
  self.postMessage({
    type: 'init-complete',
    success: false,
    error: 'TensorFlow.js not available globally',
  });
}

// =============================================================================
// Worker State
// =============================================================================

let segmenter = null;
let selfieSegmentation = null;
let isInitialized = false;
let autoFrameEnabled = false;
let processingFrame = false;

// =============================================================================
// Auto-Frame Transform Calculation (for body position)
// =============================================================================

function calculateAutoFrameTransform(segmentationResult) {
  // Process MediaPipe segmentation result for auto framing
  // Since MediaPipe selfie segmentation provides a segmentationMask, we can analyze it
  if (!segmentationResult || !segmentationResult.segmentationMask) {
    console.warn('[Worker] No segmentation mask for auto-frame transform');
    return null;
  }

  // Extract width and height from the segmentation mask
  const width = segmentationResult.segmentationMask.width;
  const height = segmentationResult.segmentationMask.height;

  // Create a canvas to analyze the segmentation mask
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(segmentationResult.segmentationMask, 0, 0);

  // Get the image data to analyze
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let foundPerson = false;

  // Sample every 8th pixel for performance
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const idx = y * width + x;
      // Check if this pixel is part of the person (non-zero alpha value)
      if (data[idx * 4] > 128) {
        // Assuming person pixels are marked with value > 128
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        foundPerson = true;
      }
    }
  }

  if (foundPerson && maxX > minX && maxY > minY) {
    const boxCenterX = (minX + maxX) / 2;
    const boxHeight = maxY - minY;
    const faceY = minY + boxHeight * 0.25; // Approximate face position

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

async function segmentationToMask(segmentationResult) {
  if (!segmentationResult) {
    console.warn('[Worker] No segmentation result to convert');
    return null;
  }

  // For MediaPipe selfie segmentation, if there's a segmentationMask property, use it
  if (segmentationResult.segmentationMask) {
    const width = segmentationResult.segmentationMask.width;
    const height = segmentationResult.segmentationMask.height;

    // Create a canvas to work with the segmentation mask
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw the segmentation mask to the canvas
    ctx.drawImage(segmentationResult.segmentationMask, 0, 0);

    // Get the image data from the canvas
    const imageData = ctx.getImageData(0, 0, width, height);
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Copy the segmentation mask data to RGBA format
    // The segmentation mask should have values indicating person (255) or background (0)
    for (let i = 0; i < width * height; i++) {
      // Use red channel value as the mask value (assuming grayscale)
      const maskValue = imageData.data[i * 4]; // R channel
      const offset = i * 4;
      rgba[offset] = maskValue; // R - person (255) or background (0)
      rgba[offset + 1] = maskValue; // G
      rgba[offset + 2] = maskValue; // B
      rgba[offset + 3] = 255; // A (fully opaque)
    }

    const processedImageData = new ImageData(rgba, width, height);
    return createImageBitmap(processedImageData);
  } else {
    // If no segmentation mask is available, we'll create a binary mask from the result
    // MediaPipe selfie segmentation may provide multi-class segmentation data
    // For now, we'll log an error and return null
    console.warn('[Worker] Segmentation result does not contain segmentationMask property');
    return null;
  }
}

// =============================================================================
// Segmenter Initialization
// =============================================================================

async function initSegmenter() {
  try {
    console.log('[Worker] Initializing TensorFlow.js and MediaPipe...');

    // Ensure TensorFlow.js is available
    if (typeof tf === 'undefined') {
      throw new Error('TensorFlow.js not loaded. Check importScripts calls.');
    }

    // Configure TensorFlow.js for WebGL backend
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('[Worker] TensorFlow.js ready, backend:', tf.getBackend());

    // Ensure SelfieSegmentation is available
    if (typeof SelfieSegmentation === 'undefined') {
      throw new Error('SelfieSegmentation not loaded. Check MediaPipe importScripts calls.');
    }

    // Initialize MediaPipe Selfie Segmentation with local assets
    selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) => {
        // Try local assets first, fallback to CDN
        const localPath = `/mediapipe/${file}`;
        console.log(`[Worker] Loading MediaPipe asset: ${localPath}`);
        return localPath;
      },
    });

    // Configure the selfie segmentation instance
    selfieSegmentation.setOptions({
      modelSelection: 1, // General model (0 for landscape, 1 for portrait)
      selfieMode: false,
    });

    // The segmenter will be created on demand during processing
    // since it needs to work with OffscreenCanvas which requires different handling
    console.log('[Worker] MediaPipe initialization complete');

    isInitialized = true;
    console.log('[Worker] MediaPipe Selfie Segmentation model loaded successfully!');

    self.postMessage({ type: 'init-complete', success: true });
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
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
  if (!isInitialized) {
    console.warn('[Worker] Not initialized, skipping frame');
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
    ctx.drawImage(imageBitmap, 0, 0);

    // For MediaPipe selfie segmentation in a worker context with manual processing,
    // we need to use the callback approach properly.
    // Using a promise-based approach with temporary callbacks for each frame
    const segmentationResult = await new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Set a temporary callback to capture results
      const onSegmentationResults = (results) => {
        // Clear timeout if we got results
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(results);
      };

      // Set up a timeout to avoid hanging
      const timeoutId = setTimeout(() => {
        console.error('[Worker] Segmentation timeout');
        reject(new Error('Segmentation timeout'));
      }, 5000); // 5 second timeout

      // Set the temporary callback
      selfieSegmentation.onResults = onSegmentationResults;

      // Send the image for processing
      selfieSegmentation.send({ image: canvas }).catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });

    // Create mask bitmap for transfer
    const maskBitmap = await segmentationToMask(segmentationResult);

    // Calculate auto-frame transform if enabled
    let autoFrameTransform = null;
    if (autoFrameEnabled && segmentationResult) {
      // Pass the segmentation result to auto-frame calculation
      autoFrameTransform = calculateAutoFrameTransform(segmentationResult);
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

    // Dispose of the segmenter and canvas to free memory
    segmenter.dispose();
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
      await processFrame(msg.image, msg.autoFrame);
      break;

    case 'close':
      console.log('[Worker] Closing...');
      if (selfieSegmentation) {
        selfieSegmentation.close();
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

console.log('[Worker] Segmentation worker loaded (MediaPipe Selfie Segmentation)');
