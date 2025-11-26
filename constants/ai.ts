// Body segmentation
export const BODY_SEGMENTATION_THRESHOLD = 0.7;
export const AUTO_FRAME_CALC_INTERVAL_MS = 500;

// Auto-framing
export const FACE_BOX_Y_OFFSET = 0.25;
export const FRAME_CENTER_POINT = 0.5;
export const AUTOFRAME_TARGET_ZOOM_FACTOR = 0.6;
export const AUTOFRAME_MIN_ZOOM = 1.0;
export const AUTOFRAME_MAX_ZOOM = 2.5;

// Face detection
export const MIN_FACE_LANDMARKS = 68;
export const FACE_MESH_LANDMARKS = 478;

// Luminance coefficients (ITU-R BT.709)
export const LUMINANCE_RED_COEFFICIENT = 0.2126;
export const LUMINANCE_GREEN_COEFFICIENT = 0.7152;
export const LUMINANCE_BLUE_COEFFICIENT = 0.0722;

// Model loading timeout (30 seconds)
export const MODEL_LOAD_TIMEOUT_MS = 30000;

// Worker initialization timeout
export const WORKER_INIT_TIMEOUT_MS = 30000;

// Segmentation processing interval (process every 3rd frame for performance)
export const SEGMENTATION_FRAME_SKIP = 3;

// AI inference frame skip factor
export const INFERENCE_FRAME_SKIP_FACTOR = 3;

// Segmentation promise timeout
export const SEGMENTATION_TIMEOUT_MS = 5000;

// Auto-frame throttling interval
export const AUTOFRAME_THROTTLE_MS = 500;

// Face tracking smoothing factor
export const FACE_TRACKING_SMOOTHING = 0.3;

export const AI = {
  // Segmentation
  FOREGROUND_COLOR: { r: 255, g: 255, b: 255, a: 255 },
  BACKGROUND_COLOR: { r: 0, g: 0, b: 0, a: 0 },

  // Model URLs
  TF_CDN: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js',
  MEDIAPIPE_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/',

  // Timeouts
  MODEL_LOAD_TIMEOUT: 30000,
  WORKER_INIT_TIMEOUT: 10000,
} as const;
