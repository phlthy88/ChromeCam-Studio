/**
 * ChromeCam Studio - Utility Modules
 *
 * Centralized exports for all utility functions and managers.
 */

// Audio utilities
export {
  getAudioContext,
  closeAudioContext,
  isAudioContextSupported,
  calculateRMSVolume,
  getCSSProperty,
  VU_METER_CONFIG,
  VU_METER_COLORS,
} from './audio';

// Segmentation manager (AI processing)
export {
  segmentationManager,
  SegmentationManager,
  type SegmentationResult,
  type SegmentationMode,
} from './segmentationManager';
