/**
 * ChromeCam Studio - Custom Hooks
 *
 * Extracted from the monolithic VideoPanel component for better:
 * - Testability (each hook can be tested in isolation)
 * - Maintainability (changes to recording won't affect rendering)
 * - Performance (granular re-renders only where needed)
 * - Debugging (errors are contained to specific functionality)
 */

export { useWakeLock } from './useWakeLock';
export { useCameraStream } from './useCameraStream';
export type {
  HardwareCapabilities,
  UseCameraStreamOptions,
  UseCameraStreamReturn,
} from './useCameraStream';
export { useBodySegmentation } from './useBodySegmentation';
export type {
  AutoFrameTransform,
  UseBodySegmentationOptions,
  UseBodySegmentationReturn,
} from './useBodySegmentation';
export { useFaceTracking } from './useFaceTracking';
export { useProOverlays } from './useProOverlays';
export type { ProOverlaySettings, UseProOverlaysReturn } from './useProOverlays';
export { useVideoRenderer } from './useVideoRenderer';
export type { UseVideoRendererOptions, UseVideoRendererReturn } from './useVideoRenderer';
export { useMediaRecorder } from './useMediaRecorder';
export type { UseMediaRecorderOptions, UseMediaRecorderReturn } from './useMediaRecorder';
export { useSystemAccentColor } from './useSystemAccentColor';
export { useBroadcastMode } from './useBroadcastMode';
export type { UseBroadcastModeReturn } from './useBroadcastMode';
export { useTheme } from './useTheme';
export { useToast } from '../contexts/ToastContext';
export { ToastProvider } from './useToast';
export { ToastContainer } from '../components/ToastContainer';
export type { Toast, ToastType } from '../contexts/ToastContext';
export { useAutoLowLight } from './useAutoLowLight';
export type {
  LowLightAnalysis,
  UseAutoLowLightOptions,
  UseAutoLowLightReturn,
} from './useAutoLowLight';
export { useWebGLRenderer } from './useWebGLRenderer';
export type { UseWebGLRendererOptions, UseWebGLRendererReturn } from './useWebGLRenderer';
export { useAudioProcessor } from './useAudioProcessor';
export type { UseAudioProcessorOptions, UseAudioProcessorReturn } from './useAudioProcessor';
export { useVirtualCamera } from './useVirtualCamera';
export { useOBSIntegration } from './useOBSIntegration';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { usePerformanceMonitor } from './usePerformanceMonitor';
export { usePresets } from './usePresets';
