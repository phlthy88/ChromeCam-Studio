import { SelfieSegmentation, type Results } from '@mediapipe/selfie_segmentation';

// =============================================================================
// Worker State
// =============================================================================

let segmenter: SelfieSegmentation | null = null;
let isInitialized = false;
let processingFrame = false;

// Performance metrics
let frameCount = 0;
let lastFpsTimestamp = performance.now();
const fpsHistory: number[] = [];
const latencyHistory: number[] = [];
const historySize = 30; // Average over 30 frames

interface ProcessingState {
  id: number;
  startTime: number;
  autoFrame: boolean;
}

// Store a mapping from message ID to its callback and start time
const processingState = new Map<ImageBitmap, ProcessingState>();

// =============================================================================
// Result Handling
// =============================================================================

function calculateAverage(history: number[]): number {
  if (history.length === 0) return 0;
  const sum = history.reduce((a, b) => a + b, 0);
  return sum / history.length;
}

function onSegmentationResults(results: Results) {
  const image = results.image as ImageBitmap;
  const state = processingState.get(image);

  if (!state) {
    console.warn('[Worker] Received segmentation result for an unknown image');
    return;
  }

  const { id, startTime, autoFrame } = state;
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
  if (autoFrame && results.segmentationMask) {
    // This is a placeholder for a more sophisticated auto-frame calculation
    // that would analyze the segmentation mask.
    // autoFrameTransform = calculateAutoFrameTransform(segmentation);
  }

  const response = {
    type: 'mask',
    id,
    mask: results.segmentationMask,
    timestamp: endTime,
    autoFrameTransform,
    fps: avgFps,
    latency: avgLatency
  };

  // Transfer the mask if it is an ImageBitmap (which allows zero-copy)
  if (results.segmentationMask instanceof ImageBitmap) {
    self.postMessage(response, [results.segmentationMask]);
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

    segmenter = new SelfieSegmentation({
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
    const err = error as Error;
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: err.message || String(err),
    });
  }
}

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(id: number, imageBitmap: ImageBitmap, autoFrame: boolean = false) {
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
    // Cast to any because the definition expects HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
    await segmenter.send({ image: imageBitmap as any });
  } catch (error) {
    console.error('[Worker] Error during segmentation processing:', error);
    processingState.delete(imageBitmap); // Clean up on error
    self.postMessage({ type: 'error', id, error: String(error) });
    processingFrame = false; // Reset flag on error
  } finally {
    // The result will be handled in onSegmentationResults, but we need to reset processingFrame there?
    // Wait, onSegmentationResults is async callback.
    // MediaPipe processing is usually sequential.
    // We set processingFrame = false in onSegmentationResults? No, existing code didn't.
    // Existing code:
    // finally { processingFrame = false; }
    // But `segmenter.send` awaits the processing?
    // "await segmenter.send" - yes it waits.
    processingFrame = false;
  }
}

// =============================================================================
// Message Handler
// =============================================================================

type WorkerMessage =
  | { type: 'init'; config?: any }
  | { type: 'process'; id: number; image: ImageBitmap; autoFrame: boolean }
  | { type: 'close' };

self.onmessage = async function (e: MessageEvent<WorkerMessage>) {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      await initSegmenter();
      break;

    case 'process':
      if (msg.type === 'process') {
        if (!msg || msg.id === undefined || !msg.image) {
          console.error('[Worker] Invalid process message:', msg);
          // @ts-ignore
          if (msg.image && typeof msg.image.close === 'function') {
            // @ts-ignore
            msg.image.close();
          }
          return;
        }
        await processFrame(msg.id, msg.image, msg.autoFrame);
      }
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
      // @ts-ignore
      console.warn('[Worker] Unknown message type:', msg.type);
  }
};

// =============================================================================
// Worker Ready Signal
// =============================================================================

console.log('[Worker] Segmentation worker loaded (MediaPipe SelfieSegmentation Module)');
