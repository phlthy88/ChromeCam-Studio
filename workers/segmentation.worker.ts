// workers/segmentation.worker.ts

// Self-executing function to ensure polyfills are in place before imports
(function() {
  // Ensure necessary functions are available in worker environment
  // This polyfill must run before TensorFlow.js imports to handle environment issues

  // Base64 functions
  if (typeof (self as any).atob === 'undefined') {
    (self as any).atob = (function() {
      // Base64 decoding for worker environment
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      return function(input: string) {
        let str = input.replace(/=+$/, '');
        let output = '';

        if (str.length % 4 === 1) {
          throw new Error('Invalid base64 string');
        }

        for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer) {
          buffer = chars.indexOf(buffer);
          bc = (bc << 6) | buffer;
          bs++;
          if (bs % 4 === 0) {
            output += String.fromCharCode((bc >> 16) & 0xFF, (bc >> 8) & 0xFF, bc & 0xFF);
            bc = 0;
          }
        }

        // Handle remaining bytes
        switch (str.length % 4) {
          case 2:
            output += String.fromCharCode((bc >> 10) & 0xFF);
            break;
          case 3:
            output += String.fromCharCode((bc >> 16) & 0xFF, (bc >> 8) & 0xFF);
            break;
        }

        return output;
      };
    })();
  }

  if (typeof (self as any).btoa === 'undefined') {
    (self as any).btoa = (function() {
      // Base64 encoding for worker environment
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      return function(input: string) {
        let result = '';
        let i = 0;
        const length = input.length;

        while (i < length) {
          const a = i < length ? input.charCodeAt(i++) : 0;
          const b = i < length ? input.charCodeAt(i++) : 0;
          const c = i < length ? input.charCodeAt(i++) : 0;
          const bitmap = (a << 16) | (b << 8) | c;

          result += chars.charAt((bitmap >> 18) & 63) +
                    chars.charAt((bitmap >> 12) & 63) +
                    chars.charAt((bitmap >> 6) & 63) +
                    chars.charAt(bitmap & 63);
        }

        // Replace padding characters based on input length
        const rest = length % 3;
        if (rest === 1) {
          result = result.slice(0, -2) + '==';
        } else if (rest === 2) {
          result = result.slice(0, -1) + '=';
        }

        return result;
      };
    })();
  }

  // TextEncoder and TextDecoder might be needed by TensorFlow
  if (typeof (self as any).TextDecoder === 'undefined') {
    (self as any).TextDecoder = (self as any).TextDecoder || (globalThis as any).TextDecoder;
  }

  if (typeof (self as any).TextEncoder === 'undefined') {
    (self as any).TextEncoder = (self as any).TextEncoder || (globalThis as any).TextEncoder;
  }
})();

// Import TensorFlow libraries directly
// Vite will bundle these into the worker file
import * as tf from '@tensorflow/tfjs';
import * as bodyPix from '@tensorflow-models/body-pix';

// =============================================================================
// Worker State
// =============================================================================

let net: bodyPix.BodyPix | null = null;
let isInitialized = false;
let autoFrameEnabled = false;

// =============================================================================
// Auto-Frame Transform Calculation
// =============================================================================
function calculateAutoFrameTransform(segmentation: bodyPix.SemanticPersonSegmentation) {
  const { width, height, data } = segmentation;
  
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const idx = y * width + x;
      if (data[idx] === 1) {
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
async function segmentationToMask(segmentation: bodyPix.SemanticPersonSegmentation) {
  const { width, height, data } = segmentation;
  const rgba = new Uint8ClampedArray(width * height * 4);
  
  for (let i = 0; i < data.length; i++) {
    const value = data[i] === 1 ? 255 : 0;
    const idx = i * 4;
    rgba[idx] = value;     // R
    rgba[idx + 1] = value; // G
    rgba[idx + 2] = value; // B
    rgba[idx + 3] = 255;   // A (always opaque)
  }
  
  const imageData = new ImageData(rgba, width, height);
  return createImageBitmap(imageData);
}

// =============================================================================
// Network Initialization
// =============================================================================

async function initSegmenter() {
  try {
    console.log('[Worker] Setting up TensorFlow.js...');
    
    // Initialize backend
    try {
      await tf.setBackend('webgl');
    } catch (e) {
      console.warn('[Worker] WebGL backend failed, falling back to CPU', e);
      await tf.setBackend('cpu');
    }
    
    await tf.ready();
    console.log('[Worker] TensorFlow.js ready with backend:', tf.getBackend());

    console.log('[Worker] Loading BodyPix model...');
    
    // Load model locally from the bundle
    net = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    });

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

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(imageBitmap: ImageBitmap, autoFrame: boolean) {
  if (!isInitialized || !net) {
    imageBitmap.close();
    return;
  }

  try {
    autoFrameEnabled = autoFrame;
    
    // BodyPix expects an HTMLCanvasElement, HTMLImageElement, or ImageData
    // In a worker, we use OffscreenCanvas
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get OffscreenCanvas context');
    
    ctx.drawImage(imageBitmap, 0, 0);
    
    // Run segmentation
    // CASTING: BodyPix types don't officially support OffscreenCanvas yet, but it works.
    const segmentation = await net.segmentPerson(canvas as any, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7
    });

    // Convert to mask
    const maskBitmap = await segmentationToMask(segmentation);
    
    // Calculate auto-frame
    let autoFrameTransform = undefined;
    if (autoFrameEnabled) {
        autoFrameTransform = calculateAutoFrameTransform(segmentation);
    }

    const response: any = {
      type: 'mask',
      mask: maskBitmap,
      timestamp: performance.now(),
    };
    
    if (autoFrameTransform) {
      response.autoFrameTransform = autoFrameTransform;
    }
    
    self.postMessage(response, [maskBitmap]);
    imageBitmap.close();
    
  } catch (error) {
    console.error('[Worker] Processing failed:', error);
    imageBitmap.close();
    self.postMessage({ type: 'error', error: String(error) });
  }
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async function(e: MessageEvent) {
  const msg = e.data;
  switch (msg.type) {
    case 'init': await initSegmenter(); break;
    case 'process': await processFrame(msg.image, msg.autoFrame); break;
    case 'close': 
      if (net) { net.dispose(); net = null; }
      isInitialized = false;
      self.close();
      break;
  }
};
