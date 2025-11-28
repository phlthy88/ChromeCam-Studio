/**
 * Segmentation Worker - MediaPipe SelfieSegmentation
 *
 * CRITICAL: This file MUST live in public/workers/ to bypass Vite's module system.
 * Do NOT move this to src/ or use any TypeScript import syntax.
 *
 * Uses MediaPipe SelfieSegmentation model which:
 *  - Loads its own dependencies (WASM, TFLite models)
 *  - Works correctly in a classic worker via importScripts
 */

// =============================================================================
// Dependency Loading
// =============================================================================

const MEDIAPIPE_SELFIE_SEGMENTATION_VERSION = '0.1.1675465747';

const CDN_URLS = {
  selfie: `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${MEDIAPIPE_SELFIE_SEGMENTATION_VERSION}/selfie_segmentation.js`,
};

const LOCAL_URLS = {
  selfie: '/mediapipe/selfie_segmentation.js',
};

try {
  console.log(`[Worker] Loading MediaPipe SelfieSegmentation from local path: ${LOCAL_URLS.selfie}`);
  importScripts(LOCAL_URLS.selfie);
  console.log(`[Worker] MediaPipe SelfieSegmentation loaded successfully.`);
} catch (e) {
  console.warn(
    `[Worker] Failed to load from local path. Attempting CDN fallback: ${CDN_URLS.selfie}`
  );
  try {
    importScripts(CDN_URLS.selfie);
    console.log('[Worker] MediaPipe SelfieSegmentation loaded successfully from CDN.');
  } catch (cdnError) {
    console.error('[Worker] CRITICAL: Failed to load SelfieSegmentation from both local and CDN.');
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: 'Failed to load MediaPipe SelfieSegmentation library.',
    });
    self.close();
    throw cdnError;
  }
}


// =============================================================================
// Worker State
// =============================================================================

let segmenter = null;
let isInitialized = false;
let autoFrameEnabled = false;
let processingFrame = false;

// Performance metrics
let frameCount = 0;
let lastFpsTimestamp = performance.now();
const fpsHistory = [];
const latencyHistory = [];
const historySize = 30; // Average over 30 frames
// =============================================================================

// Store a mapping from message ID to its callback and start time
const processingState = new Map();

// =============================================================================
// Result Handling
// =============================================================================
function onSegmentationResults(results) {
  const { image, segmentationMask } = results;
  const id = processingState.get(image)?.id;

  if (id === undefined) {
    console.warn('[Worker] Received segmentation result for an unknown image');
    return;
  }

  const { startTime, autoFrame } = processingState.get(image);
  processingState.delete(image); // Clean up the state for this image

  // Calculate performance
  const endTime = performance.now();
  const latency = endTime - startTime;
  latencyHistory.push(latency);
  if (latencyHistory.length > historySize) latencyHistory.shift();

  frameCount++;
  const elapsed = performance.now() - lastFpsTimestamp;
  if (elapsed >= 1000) {
    const fps = (frameCount / elapsed) * 1000;
    fpsHistory.push(fps);
    if (fpsHistory.length > historySize) fpsHistory.shift();
    frameCount = 0;
    lastFpsTimestamp = performance.now();
  }

  const avgFps = calculateAverage(fpsHistory);
  const avgLatency = calculateAverage(latencyHistory);

  let autoFrameTransform = null;
  if (autoFrame && segmentationMask) {
    // This is a placeholder for a more sophisticated auto-frame calculation
    // that would analyze the segmentation mask.
    // autoFrameTransform = calculateAutoFrameTransform(segmentation);
  }

  const response = {
    type: 'mask',
    id,
    mask: segmentationMask,
    timestamp: endTime,
    autoFrameTransform,
    fps: avgFps,
    latency: avgLatency
  };

  if (segmentationMask) {
    self.postMessage(response, [segmentationMask]);
  } else {
    self.postMessage(response);
  }
}


// =============================================================================
// Segmenter Initialization
// =============================================================================

async function initSegmenter() {
  try {
    console.log('[Worker] Initializing MediaPipe SelfieSegmentation...');

    if (!self.SelfieSegmentation) {
      throw new Error('SelfieSegmentation not found on global scope.');
    }

    segmenter = new self.SelfieSegmentation({
      locateFile: (file) => `/mediapipe/${file}`,
    });

    segmenter.setOptions({
      modelSelection: 1, // 0 for general, 1 for landscape
    });

    segmenter.onResults(onSegmentationResults);

    console.log('[Worker] MediaPipe SelfieSegmentation is initializing...');
    await segmenter.initialize();

    isInitialized = true;
    console.log('[Worker] MediaPipe SelfieSegmentation initialized successfully!');
    self.postMessage({ type: 'init-complete', success: true });
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
    const err = error;
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: err.message || String(err),
    });
  }
}

// =============================================================================
// Performance Calculation
// =============================================================================

function calculateAverage(history) {
  if (history.length === 0) return 0;
  const sum = history.reduce((a, b) => a + b, 0);
  return sum / history.length;
}

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(id, imageBitmap, autoFrame) {
  if (!isInitialized || !segmenter) {
    console.warn('[Worker] Not initialized, skipping frame');
    if (imageBitmap) imageBitmap.close();
    return;
  }

  if (processingFrame) {
    console.warn('[Worker] Still processing previous frame, dropping new frame.');
    if (imageBitmap) imageBitmap.close();
    return;
  }

  processingFrame = true;
  const startTime = performance.now();

  // Store state associated with this image processing request
  processingState.set(imageBitmap, { id, startTime, autoFrame });

  try {
    await segmenter.send({ image: imageBitmap });
  } catch (error) {
    console.error('[Worker] Error during segmentation processing:', error);
    processingState.delete(imageBitmap); // Clean up on error
    self.postMessage({ type: 'error', id, error: String(error) });
  } finally {
    // The result will be handled in onSegmentationResults
    // We can now allow the next frame to be processed.
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
      if (!msg || msg.id === undefined || !msg.image) {
        console.error('[Worker] Invalid process message:', msg);
        if(msg.image) msg.image.close();
        return;
      }
      await processFrame(msg.id, msg.image, msg.autoFrame);
      break;

    case 'close':
      console.log('[Worker] Closing...');
      if (segmenter) {
        await segmenter.close();
        segmenter = null;
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

console.log('[Worker] Segmentation worker loaded (MediaPipe SelfieSegmentation)');
