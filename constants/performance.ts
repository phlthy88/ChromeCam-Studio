export const PERFORMANCE = {
  // Inference
  INFERENCE_INTERVAL_MS: 66, // ~15fps for AI processing
  AI_TIMEOUT_MS: 5000,

  // Animation & interpolation
  AUTO_FRAME_LERP_SPEED: 0.05, // Smooth interpolation speed for auto-framing
  PAN_CHANGE_THRESHOLD: 0.5, // Minimum pan change to trigger transform update
  ZOOM_CHANGE_THRESHOLD: 0.01, // Minimum zoom change to trigger transform update

  // Frame rate limits
  PERFORMANCE_MODE_SKIP: 3,
  BALANCED_MODE_SKIP: 2,
  QUALITY_MODE_SKIP: 1,

  // Performance thresholds
  LOW_FPS_THRESHOLD: 30,
  CRITICAL_FPS_THRESHOLD: 20,

  // Cache limits
  MAX_LOG_ENTRIES: 1000,
  FRAME_SKIP_RESET: 1000,

  // WebGL timing
  WEBGL_STABILIZATION_DELAY_MS: 500,
  WEBGL_INIT_TIMEOUT_MS: 30000,
  WEBGL_CONTEXT_RETRY_DELAY_MS: 1000,
  WEBGL_MAX_RETRIES: 3,
} as const;
