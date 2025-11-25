// Define types for messages
export type WorkerMessage =
  | { type: 'init'; config: { modelType: 'general' | 'landscape' } }
  | { type: 'process'; image: ImageBitmap; timestamp: number }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'init-complete'; success: boolean; error?: string }
  | { type: 'mask'; mask: ImageBitmap; timestamp: number }
  | { type: 'error'; error: string };

// WASM file location configuration
const LOCATE_FILE = (file: string) => {
  // All files are served from the same directory as the worker
  // which we assume is /mediapipe/
  return `/mediapipe/${file}`;
};

interface SegmentationResults {
  segmentationMask: ImageBitmap;
}

interface SelfieSegmentationConstructor {
  new (config: { locateFile: (file: string) => string }): SelfieSegmentation;
}

interface SelfieSegmentation {
  setOptions(options: { modelSelection: number; selfieMode: boolean }): void;
  onResults(callback: (results: SegmentationResults) => void): void;
  initialize(): Promise<void>;
  send(data: { image: ImageBitmap }): Promise<void>;
  close(): Promise<void>;
}

// Internal state
let segmenter: SelfieSegmentation | null = null;
let isInitialized = false;

// Load the MediaPipe script
async function loadMediaPipe() {
  if (typeof (self as DedicatedWorkerGlobalScope).SelfieSegmentation === 'undefined') {
    // Import the local script
    importScripts('/mediapipe/selfie_segmentation.js');
  }
}

// Initialize the segmenter
async function initSegmenter(modelType: 'general' | 'landscape' = 'general') {
  try {
    await loadMediaPipe();

    const SelfieSegmentationConstructor = (self as DedicatedWorkerGlobalScope & { SelfieSegmentation: SelfieSegmentationConstructor }).SelfieSegmentation;
    if (!SelfieSegmentationConstructor) {
      throw new Error('SelfieSegmentation is not available');
    }

    const selfieSegmentation = new SelfieSegmentationConstructor({
      locateFile: LOCATE_FILE,
    });

    selfieSegmentation.setOptions({
      modelSelection: modelType === 'landscape' ? 1 : 0,
      selfieMode: false, // We handle mirroring in the renderer
    });

    selfieSegmentation.onResults((results) => {
      if (results.segmentationMask) {
        // Convert mask to ImageBitmap for zero-copy transfer
        createImageBitmap(results.segmentationMask)
          .then((maskBitmap) => {
            self.postMessage(
              {
                type: 'mask',
                mask: maskBitmap,
                timestamp: performance.now(),
              } as WorkerResponse,
              { transfer: [maskBitmap] }
            );
          })
          .catch((err) => {
            console.error('Worker: Failed to create mask bitmap', err);
          });
      }
    });

    await selfieSegmentation.initialize();
    segmenter = selfieSegmentation;
    isInitialized = true;

    self.postMessage({ type: 'init-complete', success: true });
  } catch (error) {
    console.error('Worker: Initialization failed', error);
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Process a frame
async function processFrame(image: ImageBitmap) {
  if (!isInitialized || !segmenter) return;

  try {
    await segmenter.send({ image });
    // ImageBitmap must be closed to avoid leaks
    image.close();
  } catch (error) {
    console.error('Worker: Processing failed', error);
    self.postMessage({ type: 'error', error: String(error) });
  }
}

// Message handler
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      await initSegmenter(msg.config.modelType);
      break;
    case 'process':
      await processFrame(msg.image);
      break;
    case 'close':
      if (segmenter) {
        await segmenter.close();
        segmenter = null;
      }
      isInitialized = false;
      self.close();
      break;
  }
};
