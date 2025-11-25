export const CAMERA = {
  // Auto low-light
  TARGET_BRIGHTNESS: 120,
  SMOOTHING_FACTOR: 0.3,
  SAMPLE_INTERVAL: 200,

  // Transform smoothing
  AUTO_FRAME_SPEED: 0.05,

  // Noise reduction
  MIN_NOISE_STRENGTH: 0.5,
  MAX_NOISE_STRENGTH: 2.0,
  DEFAULT_NOISE_STRENGTH: 1.5,
} as const;
