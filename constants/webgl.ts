/**
 * WebGL and rendering constants
 */

// WebGL initialization
export const WEBGL_STABILIZATION_DELAY_MS = 500;
export const WEBGL_INIT_TIMEOUT_MS = 30000;
export const WEBGL_CONTEXT_RETRY_DELAY_MS = 500; // Base delay, will use exponential backoff
export const WEBGL_MAX_RETRIES = 5; // Increased from 3 for better reliability

// Performance thresholds
export const PAN_CHANGE_THRESHOLD = 0.5;
export const ZOOM_CHANGE_THRESHOLD = 0.01;
