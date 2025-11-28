import { WebGLVideoRenderer } from '../utils/webglVideoRenderer';
import { logger } from '../utils/logger';
import { CameraSettings } from '../components/settings';

let renderer: WebGLVideoRenderer | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;

// Define message types for type safety
type WorkerMessage = 
  | { type: 'init'; payload: { canvas: OffscreenCanvas } }
  | { type: 'render'; payload: RenderPayload }
  | { type: 'resize'; payload: { width: number; height: number } }
  | { type: 'cleanup'; payload?: never };

interface RenderPayload {
  videoBitmap: ImageBitmap;
  maskBitmap: ImageBitmap | null;
  settings: CameraSettings;
}

// Handle messages from the main thread
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      if (payload && 'canvas' in payload) {
        await initialize(payload.canvas);
      }
      break;
      
    case 'render':
      if (isInitialized && payload && 'videoBitmap' in payload) {
        renderFrame(payload);
      }
      break;
      
    case 'resize':
      if (canvas && payload && 'width' in payload) {
        canvas.width = payload.width;
        canvas.height = payload.height;
      }
      break;
      
    case 'cleanup':
      cleanup();
      break;
  }
};

async function initialize(offscreenCanvas: OffscreenCanvas) {
  try {
    canvas = offscreenCanvas;
    renderer = new WebGLVideoRenderer();
    
    if (renderer.initialize(canvas)) {
      isInitialized = true;
      self.postMessage({ type: 'init-success' });
      logger.info('RenderWorker', 'Initialized successfully');
    } else {
      self.postMessage({ type: 'init-error', error: 'Failed to initialize WebGL renderer' });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('RenderWorker', 'Initialization error', error);
    self.postMessage({ type: 'init-error', error: errorMessage });
  }
}

function renderFrame({ videoBitmap, maskBitmap, settings }: RenderPayload) {
  try {
    if (!renderer) {
       videoBitmap.close();
       if (maskBitmap) maskBitmap.close();
       return;
    }

    // Debug log every 60 frames or so to avoid spamming
    if (Math.random() < 0.01) {
        logger.debug('RenderWorker', `Rendering frame: ${videoBitmap.width}x${videoBitmap.height}`);
    }

    // Render the frame using the shared renderer logic
    // Note: We pass null for bgImage for now as we need to handle image bitmap transfer for that too
    renderer.render(
      videoBitmap,
      maskBitmap,
      null, // TODO: Handle background image transfer
      settings
    );

    // Important: Commit the frame to the context if it's an OffscreenCanvas
    // In some browsers/contexts, explicit commit or ensuring the gl context flushes is needed.
    // WebGL automatically presents the buffer when drawing is done, but let's ensure we aren't missing anything.
    
    // Cleanup bitmaps to avoid memory leaks
    videoBitmap.close();
    if (maskBitmap) maskBitmap.close();

  } catch (error) {
    logger.error('RenderWorker', 'Render error', error);
  }
}

function cleanup() {
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  isInitialized = false;
  canvas = null;
}
