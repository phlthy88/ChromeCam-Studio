/**
 * Segmentation Worker - TensorFlow.js Body Segmentation
 * 
 * CRITICAL: This file MUST live in public/workers/ to bypass Vite's module system.
 * Do NOT move this to src/ or use any TypeScript import syntax.
 * 
 * Uses TensorFlow.js Body Segmentation model which:
 * - Loads models via HTTP fetch (not importScripts)
 * - Uses pure WebGL (no WASM dependencies)
 * - Works correctly in both classic and module workers
 * - More modern and actively maintained than BodyPix
 */

// =============================================================================
// Load TensorFlow.js and Body Segmentation - MUST be separate importScripts calls
// =============================================================================

importScripts('/mediapipe/tf.min.js');
importScripts('/mediapipe/body-pix.min.js');

console.log('[Worker] TensorFlow.js and Body Segmentation loaded via importScripts');

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
      // Check if this pixel is part of the person (boolean or confidence > 0.5)
      const isPerson = typeof data[idx] === 'boolean' ? data[idx] : data[idx] > 0.5;
      
      if (isPerson) {
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
  // Body-segmentation returns a different format than BodyPix
  // It provides a width, height, and an array of boolean values
  const { width, height, data } = segmentation;
  
  // Convert to binary mask (person = 255, background = 0)
  const rgba = new Uint8ClampedArray(width * height * 4);
  
  for (let i = 0; i < data.length; i++) {
    // data is an array of booleans for body-pix, or confidence values for body-segmentation
    const isPerson = typeof data[i] === 'boolean' ? data[i] : data[i] > 0.5;
    const value = isPerson ? 255 : 0;
    const offset = i * 4;
    rgba[offset] = value;     // R
    rgba[offset + 1] = value; // G
    rgba[offset + 2] = value; // B
    rgba[offset + 3] = 255;   // A (fully opaque)
  }
  
  const imageData = new ImageData(rgba, width, height);
  return createImageBitmap(imageData);
}

// =============================================================================
// Segmenter Initialization
// =============================================================================

async function initSegmenter() {
  try {
    console.log('[Worker] Initializing TensorFlow.js...');
    
    // Configure TensorFlow.js for WebGL backend
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('[Worker] TensorFlow.js ready, backend:', tf.getBackend());
    
    console.log('[Worker] Loading Body Segmentation model...');
    
    // Load body segmentation model
    // This downloads model on first use, cached thereafter
    net = await bodySegmentation.createSegmenter(
      bodySegmentation.SupportedModels.BodyPix,
      {
        runtime: 'tfjs',
        modelType: 'general',
        enableSmoothing: true
      }
    );
    
    isInitialized = true;
    console.log('[Worker] Body Segmentation model loaded successfully!');
    
    self.postMessage({ type: 'init-complete', success: true });
    
  } catch (error) {
    console.error('[Worker] Initialization failed:', error);
    self.postMessage({
      type: 'init-complete',
      success: false,
      error: error.message || String(error)
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
    
    // Run segmentation using body-segmentation API
    const segmentation = await net.segmentPeople(canvas, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7
    });
    
    // For simplicity, use the first person if multiple are detected
    const personSegmentation = segmentation.length > 0 ? segmentation[0] : null;
    
    if (!personSegmentation) {
      console.warn('[Worker] No person detected in frame');
      processingFrame = false;
      imageBitmap.close();
      return;
    }
    
    // Create mask bitmap for transfer
    const maskBitmap = await segmentationToMask(personSegmentation);
    
    // Calculate auto-frame transform if enabled
    let autoFrameTransform = null;
    if (autoFrameEnabled) {
      autoFrameTransform = calculateAutoFrameTransform(personSegmentation);
    }
    
    // Build response
    const response = {
      type: 'mask',
      mask: maskBitmap,
      timestamp: performance.now()
    };
    
    if (autoFrameTransform) {
      response.autoFrameTransform = autoFrameTransform;
    }
    
    // Send result back to main thread
    self.postMessage(response, [maskBitmap]);

  } catch (error) {
    console.error('[Worker] Segmentation failed:', error);
    self.postMessage({
      type: 'error',
      error: error.message || String(error),
      timestamp: performance.now()
    });
  } finally {
    processingFrame = false;
    imageBitmap.close();
  }
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async function(e) {
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

console.log('[Worker] Segmentation worker loaded (TensorFlow.js Body Segmentation)');
