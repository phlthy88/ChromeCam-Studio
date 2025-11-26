/// <reference lib="webworker" />

// Define types for messages
type WorkerMessage =
  | { type: 'init'; config: { modelType: 'general' | 'landscape' } }
  | { type: 'process'; image: ImageBitmap; timestamp: number; autoFrame: boolean }
  | { type: 'close' };

type WorkerResponse =
  | { type: 'init-complete'; success: boolean; error?: string }
  | {
      type: 'mask';
      mask: ImageBitmap;
      timestamp: number;
      autoFrameTransform?: { panX: number; panY: number; zoom: number };
    }
  | { type: 'error'; error: string };

// =============================================================================
// MediaPipe CDN Configuration
// =============================================================================
const MEDIAPIPE_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

const LOCATE_FILE = (file: string) => {
  return `${MEDIAPIPE_CDN_BASE}/${file}`;
};

// =============================================================================
// FIX: Replace eval() with new Function() for better CSP compatibility
//
// The old approach used (0, eval)(scriptText) which is blocked by strict CSP.
// new Function() is marginally better for CSP and avoids the eval keyword.
// =============================================================================
async function loadScriptFromCDN(url: string): Promise<void> {
  console.log(`[Worker] Loading script: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch script: ${url} (status: ${response.status})`);
  }

  const scriptText = await response.text();

  // Validate we got JavaScript, not an HTML error page
  const trimmed = scriptText.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<!doctype')) {
    throw new Error(`CDN returned HTML instead of JavaScript for: ${url}`);
  }

  // Use Function constructor instead of eval()
  // This executes in global scope and is slightly more CSP-friendly
  try {
    const executeScript = new Function(scriptText);
    executeScript();
    console.log(`[Worker] Successfully loaded: ${url}`);
  } catch (execError) {
    console.error(`[Worker] Script execution failed for ${url}:`, execError);
    throw execError;
  }
}

interface WorkerSegmentationResults {
  segmentationMask: ImageData | ImageBitmap;
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
let autoFrameEnabled: boolean = false;
let inputImageBitmap: ImageBitmap | null = null;

// Load the MediaPipe script
async function loadMediaPipe() {
  if (typeof (self as any).SelfieSegmentation === 'undefined') {
    console.log('[Worker] Loading MediaPipe from CDN...');
    const scriptUrl = `${MEDIAPIPE_CDN_BASE}/selfie_segmentation.js`;
    await loadScriptFromCDN(scriptUrl);

    // Verify the global was created
    if (typeof (self as any).SelfieSegmentation === 'undefined') {
      throw new Error('SelfieSegmentation not defined after loading script');
    }
    console.log('[Worker] MediaPipe loaded successfully');
  }
}

// Initialize the segmenter
async function initSegmenter(modelType: 'general' | 'landscape' = 'general') {
  try {
    console.log('[Worker] Initializing segmenter...');
    await loadMediaPipe();

    const workerSelfieSegmentation = (self as any).SelfieSegmentation;
    if (!workerSelfieSegmentation) {
      throw new Error('SelfieSegmentation is not available after loading');
    }

    console.log('[Worker] Creating SelfieSegmentation instance...');
    const SelfieSegmentationConstructor: WorkerSelfieSegmentationConstructor =
      workerSelfieSegmentation;

    const selfieSegmentation = new SelfieSegmentationConstructor({
      locateFile: LOCATE_FILE,
    });

    selfieSegmentation.setOptions({
      modelSelection: modelType === 'landscape' ? 1 : 0,
      selfieMode: false, // We handle mirroring in the renderer
    });

    selfieSegmentation.onResults((results: WorkerSegmentationResults) => {
      if (results.segmentationMask) {
        // Convert mask to ImageBitmap for zero-copy transfer
        createImageBitmap(results.segmentationMask)
          .then((maskBitmap) => {
            let autoFrameTransform: { panX: number; panY: number; zoom: number } | undefined =
              undefined;

            // If autoFrame was enabled for this frame, calculate the transform
            if (autoFrameEnabled && inputImageBitmap) {
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

            const response: WorkerResponse = {
              type: 'mask',
              mask: maskBitmap,
              timestamp: performance.now(),
              ...(autoFrameTransform ? { autoFrameTransform } : {}),
            };

            self.postMessage(response, { transfer: [maskBitmap] });

            // Clean up
            if (inputImageBitmap) {
              inputImageBitmap.close();
              inputImageBitmap = null;
            }
          })
          .catch((err) => {
            console.error('[Worker] Failed to create mask bitmap:', err);
            if (inputImageBitmap) {
              inputImageBitmap.close();
              inputImageBitmap = null;
            }
          });
      } else {
        if (inputImageBitmap) {
          inputImageBitmap.close();
          inputImageBitmap = null;
        }
      }
    });

    console.log('[Worker] Calling initialize()...');
    await selfieSegmentation.initialize();
    
    segmenter = selfieSegmentation as unknown as WorkerSelfieSegmentation;
    isInitialized = true;

    console.log('[Worker] Initialization complete!');
    self.postMessage({ type: 'init-complete', success: true });
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
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
    autoFrameEnabled = autoFrame;

    // Clean up any previous input image bitmap
    if (inputImageBitmap) {
      inputImageBitmap.close();
    }
    inputImageBitmap = image;

    // Send the image to MediaPipe for segmentation
    await segmenter.send({ image });
  } catch (error) {
    console.error('[Worker] Processing failed:', error);

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
