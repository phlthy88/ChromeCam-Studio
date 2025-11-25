export const PERFORMANCE = {
  // Inference
  INFERENCE_INTERVAL_MS: 66, // ~15fps for AI processing
  AI_TIMEOUT_MS: 5000,

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
} as const;
