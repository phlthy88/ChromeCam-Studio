// workers/segmentation.worker.ts
import { SelfieSegmentation, type Results } from '@mediapipe/selfie_segmentation';

let segmenter: SelfieSegmentation | null = null;
let isInitialized = false;
let processingFrame = false;
let inputCanvas: OffscreenCanvas | null = null;
let inputCtx: OffscreenCanvasRenderingContext2D | null = null;
let outputCanvas: OffscreenCanvas | null = null;
let outputCtx: OffscreenCanvasRenderingContext2D | null = null;

// Performance State
const historySize = 30;
const fpsHistory: number[] = [];
const processingState = new Map<ImageBitmap, { id: number; startTime: number; autoFrame: boolean }>();

async function initSegmenter() {
  try {
    segmenter = new SelfieSegmentation({
      locateFile: (file) => `/mediapipe/${file}`,
    });
    segmenter.setOptions({ modelSelection: 1 }); // Landscape
    segmenter.onResults(onResults);
    await segmenter.initialize();
    isInitialized = true;
    self.postMessage({ type: 'init-complete', success: true });
  } catch (err) {
    self.postMessage({ type: 'init-complete', success: false, error: String(err) });
  }
}

function onResults(results: Results) {
  const entry = processingState.entries().next();
  if (entry.done) return;
  const [inputBitmap, state] = entry.value;
  processingState.delete(inputBitmap);

  const now = performance.now();
  fpsHistory.push(1000 / (now - state.startTime));
  if (fpsHistory.length > historySize) fpsHistory.shift();
  const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;

  // Normalize Mask
  const { width, height } = results.image;
  if (!outputCanvas || outputCanvas.width !== width || outputCanvas.height !== height) {
    outputCanvas = new OffscreenCanvas(width, height);
    outputCtx = outputCanvas.getContext('2d', { alpha: false });
  }

  let finalMask: ImageBitmap | null = null;
  if (outputCtx && outputCanvas) {
    outputCtx.clearRect(0, 0, width, height);
    outputCtx.drawImage(results.segmentationMask, 0, 0);
    finalMask = outputCanvas.transferToImageBitmap();
  }

  self.postMessage({
    type: 'mask',
    id: state.id,
    mask: finalMask,
    fps: avgFps,
    latency: now - state.startTime
  }, finalMask ? [finalMask] : []);

  inputBitmap.close();
}

async function processFrame(id: number, bitmap: ImageBitmap, autoFrame: boolean) {
  if (!isInitialized || !segmenter || processingFrame) {
    bitmap.close();
    return;
  }
  processingFrame = true;
  processingState.set(bitmap, { id, startTime: performance.now(), autoFrame });

  try {
    if (!inputCanvas || inputCanvas.width !== bitmap.width) {
      inputCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      inputCtx = inputCanvas.getContext('2d', { alpha: false });
    }
    inputCtx?.drawImage(bitmap, 0, 0);
    // @ts-ignore
    await segmenter.send({ image: inputCanvas });
  } catch (error) {
    processingState.delete(bitmap);
    bitmap.close();
  } finally {
    processingFrame = false;
  }
}

self.onmessage = async (e) => {
  if (e.data.type === 'init') await initSegmenter();
  if (e.data.image) await processFrame(e.data.id, e.data.image, e.data.autoFrame);
  if (e.data.type === 'close') self.close();
};
