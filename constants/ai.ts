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
