/// <reference lib="webworker" />

// Define types for messages
export type WorkerMessage =
  | { type: 'init'; config: { modelType: 'general' | 'landscape' } }
  | { type: 'process'; image: ImageBitmap; timestamp: number; autoFrame: boolean }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'init-complete'; success: boolean; error?: string }
  | {
      type: 'mask';
      mask: ImageBitmap;
      timestamp: number;
      autoFrameTransform?: { panX: number; panY: number; zoom: number };
    }
  | { type: 'error'; error: string };

// MediaPipe script URL - references file from /public directory
const selfieSegmentationUrl = '/mediapipe/selfie_segmentation.js';

// WASM file location configuration
const LOCATE_FILE = (file: string) => {
  // All files are served from the same directory as the worker
  // which we assume is /mediapipe/
  return `/mediapipe/${file}`;
};

interface WorkerSegmentationResults {
  segmentationMask: ImageBitmap;
}

interface WorkerSelfieSegmentationConstructor {
  new (config: { locateFile: (file: string) => string }): WorkerSelfieSegmentation;
}

interface WorkerSelfieSegmentation {
  setOptions(options: { modelSelection: 0 | 1; selfieMode: boolean }): void;
  onResults(callback: (results: WorkerSegmentationResults) => void): void;
  initialize(): Promise<void>;
  send(data: { image: ImageBitmap }): Promise<void>;
  close(): Promise<void>;
}

// Internal state
let segmenter: WorkerSelfieSegmentation | null = null;
let isInitialized = false;
let autoFrameEnabled: boolean = false; // Store autoFrame setting for this frame
let inputImageBitmap: ImageBitmap | null = null; // Store the input image for auto frame calculation

// FORCE polyfill because native importScripts throws in module workers
// Do NOT wrap this in an 'if' check.
(self as any).importScripts = function (...urls: string[]) {
  for (const url of urls) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send();
    if (xhr.status === 200) {
      (0, eval)(xhr.responseText);
    } else {
      throw new Error(`Failed to load script: ${url}`);
    }
  }
};

// Load the MediaPipe script
async function loadMediaPipe() {
  if (typeof (self as DedicatedWorkerGlobalScope).SelfieSegmentation === 'undefined') {
    // Fetch and evaluate the script (MediaPipe is UMD, not an ES module)
    const response = await fetch(selfieSegmentationUrl);
    const scriptText = await response.text();
    // Use indirect eval to execute in global scope
    (0, eval)(scriptText);
  }
}

// Initialize the segmenter
async function initSegmenter(modelType: 'general' | 'landscape' = 'general') {
  try {
    await loadMediaPipe();

    const SelfieSegmentationConstructor = (
      self as DedicatedWorkerGlobalScope & {
        SelfieSegmentation: WorkerSelfieSegmentationConstructor;
      }
    ).SelfieSegmentation;
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
            let autoFrameTransform: { panX: number; panY: number; zoom: number } | undefined =
              undefined;

            // If autoFrame was enabled for this frame, calculate the transform using the original input image
            if (autoFrameEnabled && inputImageBitmap) {
              // Create temporary canvas to get ImageData from the input image
              const tempCanvas = new OffscreenCanvas(
                inputImageBitmap.width,
                inputImageBitmap.height
              );
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.drawImage(inputImageBitmap, 0, 0);
                const imageData = tempCtx.getImageData(
                  0,
                  0,
                  inputImageBitmap.width,
                  inputImageBitmap.height
                );
                const transform = calculateAutoFrameTransform(imageData);
                if (transform) {
                  autoFrameTransform = transform;
                }
              }
            }

            // Send the mask along with auto frame transform if needed
            const response: WorkerResponse = {
              type: 'mask',
              mask: maskBitmap,
              timestamp: performance.now(),
              ...(autoFrameTransform ? { autoFrameTransform } : {}),
            };

            self.postMessage(response, { transfer: [maskBitmap] });

            // Clean up the input image bitmap after processing
            if (inputImageBitmap) {
              inputImageBitmap.close();
              inputImageBitmap = null;
            }
          })
          .catch((err) => {
            console.error('Worker: Failed to create mask bitmap', err);

            // Clean up the input image bitmap on error
            if (inputImageBitmap) {
              inputImageBitmap.close();
              inputImageBitmap = null;
            }
          });
      } else {
        // Clean up the input image bitmap if no segmentation results
        if (inputImageBitmap) {
          inputImageBitmap.close();
          inputImageBitmap = null;
        }
      }
    });

    await selfieSegmentation.initialize();
    segmenter = selfieSegmentation as unknown as WorkerSelfieSegmentation;
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

// Calculate auto frame transform from mask data
function calculateAutoFrameTransform(
  maskData: ImageData
): { panX: number; panY: number; zoom: number } | null {
  const width = maskData.width;
  const height = maskData.height;
  const data = maskData.data;
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  let found = false;

  // Sample every 8th pixel for performance
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      if ((data[(y * width + x) * 4] ?? 0) > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (found) {
    const boxCenterX = (minX + maxX) / 2;
    const boxHeight = maxY - minY;
    // Focus on the face/head area (upper ~25% of detected body)
    const faceY = minY + boxHeight * 0.25;
    const centerXPercent = boxCenterX / width;
    const faceYPercent = faceY / height;
    const targetPanX = (0.5 - centerXPercent) * 100;
    const targetPanY = (0.5 - faceYPercent) * 100;
    let targetZoom = (height * 0.6) / boxHeight;
    targetZoom = Math.max(1, Math.min(targetZoom, 2.5));

    return {
      panX: targetPanX,
      panY: targetPanY,
      zoom: targetZoom,
    };
  }

  return null;
}

// Process a frame
async function processFrame(image: ImageBitmap, autoFrame: boolean) {
  if (!isInitialized || !segmenter) return;

  try {
    // Store the autoFrame setting and input image for later use in onResults callback
    autoFrameEnabled = autoFrame;

    // Clean up any previous input image bitmap if it wasn't cleaned up properly
    if (inputImageBitmap) {
      inputImageBitmap.close();
    }
    inputImageBitmap = image;

    // Send the image to MediaPipe for segmentation
    await segmenter.send({ image });
  } catch (error) {
    console.error('Worker: Processing failed', error);

    // Clean up the input image bitmap on error
    if (inputImageBitmap) {
      inputImageBitmap.close();
      inputImageBitmap = null;
    }

    self.postMessage({ type: 'error', error: String(error) });
  }
}

// Message handler
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      await initSegmenter(msg.config.modelType);
      break;
    case 'process':
      await processFrame(msg.image, msg.autoFrame);
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
