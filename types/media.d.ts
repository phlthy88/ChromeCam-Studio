/**
 * Type definitions for extended Media APIs, MediaPipe, and File System Access API
 */

// =============================================================================
// Extended MediaTrackCapabilities for non-standard camera controls
// =============================================================================

/**
 * Range constraint representing min/max/step values for numeric capabilities
 */
export interface MediaSettingsRange {
  min: number;
  max: number;
  step?: number;
}

/**
 * Extended MediaTrackCapabilities including non-standard camera controls
 * These are supported by many cameras but not in the standard TypeScript definitions
 */
export interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  // PTZ (Pan-Tilt-Zoom) controls
  zoom?: MediaSettingsRange;
  pan?: MediaSettingsRange;
  tilt?: MediaSettingsRange;

  // Image adjustment
  brightness?: MediaSettingsRange;
  contrast?: MediaSettingsRange;
  saturation?: MediaSettingsRange;
  sharpness?: MediaSettingsRange;

  // Exposure controls
  exposureMode?: string[];
  exposureTime?: MediaSettingsRange;
  exposureCompensation?: MediaSettingsRange;

  // White balance
  whiteBalanceMode?: string[];
  colorTemperature?: MediaSettingsRange;

  // Focus controls
  focusMode?: string[];
  focusDistance?: MediaSettingsRange;

  // Additional hardware controls
  iso?: MediaSettingsRange;
  backlightCompensation?: boolean;
  powerLineFrequency?: number[];
  torch?: boolean;
}

/**
 * Extended constraint set for applying camera settings
 */
export interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  // PTZ (Pan-Tilt-Zoom) controls - boolean is used to request permission for the capability
  zoom?: ConstrainDouble | boolean;
  pan?: ConstrainDouble | boolean;
  tilt?: ConstrainDouble | boolean;

  // Image adjustment
  brightness?: ConstrainDouble;
  contrast?: ConstrainDouble;
  saturation?: ConstrainDouble;
  sharpness?: ConstrainDouble;

  // Exposure controls
  exposureMode?: ConstrainDOMString;
  exposureTime?: ConstrainDouble;
  exposureCompensation?: ConstrainDouble;

  // White balance
  whiteBalanceMode?: ConstrainDOMString;
  colorTemperature?: ConstrainDouble;

  // Focus controls
  focusMode?: ConstrainDOMString;
  focusDistance?: ConstrainDouble;

  // Additional hardware controls
  iso?: ConstrainDouble;
  backlightCompensation?: ConstrainBoolean;
  powerLineFrequency?: ConstrainDouble;
  torch?: ConstrainBoolean;
}

/**
 * Extended constraints with advanced array
 */
export interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  advanced?: ExtendedMediaTrackConstraintSet[];
}

// =============================================================================
// MediaPipe / TensorFlow Body Segmentation Types
// =============================================================================

/**
 * Color definition for mask processing
 */
export interface SegmentationColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Segmentation result from MediaPipe
 */
export interface Segmentation {
  maskValueToLabel: (value: number) => string;
  mask: {
    toCanvasImageSource: () => CanvasImageSource;
    toImageData: () => ImageData;
    toTensor: () => unknown;
    getUnderlyingType: () => string;
  };
}

/**
 * Supported segmentation models
 */
export interface SupportedModels {
  MediaPipeSelfieSegmentation: string;
  BodyPix: string;
}

/**
 * Segmenter configuration for MediaPipe
 */
export interface SegmenterConfig {
  runtime: 'mediapipe' | 'tfjs';
  solutionPath?: string;
  modelType?: 'general' | 'landscape';
}

/**
 * Body segmenter interface
 */
export interface BodySegmenter {
  segmentPeople(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    config?: { flipHorizontal?: boolean }
  ): Promise<Segmentation[]>;
  dispose(): void;
}

/**
 * Body Segmentation API namespace
 */
export interface BodySegmentationAPI {
  SupportedModels: SupportedModels;
  createSegmenter(
    model: string,
    config: SegmenterConfig
  ): Promise<BodySegmenter>;
  toBinaryMask(
    segmentation: Segmentation[],
    foreground: SegmentationColor,
    background: SegmentationColor,
    drawContour?: boolean,
    foregroundThreshold?: number
  ): Promise<ImageData>;
}

// =============================================================================
// Barcode Detector API (Chrome/Edge feature)
// =============================================================================

/**
 * Detected barcode format types
 */
export type BarcodeFormat =
  | 'aztec'
  | 'code_128'
  | 'code_39'
  | 'code_93'
  | 'codabar'
  | 'data_matrix'
  | 'ean_13'
  | 'ean_8'
  | 'itf'
  | 'pdf417'
  | 'qr_code'
  | 'upc_a'
  | 'upc_e'
  | 'unknown';

/**
 * Corner point of a detected barcode
 */
export interface BarcodeCornerPoint {
  x: number;
  y: number;
}

/**
 * Detected barcode result
 */
export interface DetectedBarcode {
  boundingBox: DOMRectReadOnly;
  cornerPoints: BarcodeCornerPoint[];
  format: BarcodeFormat;
  rawValue: string;
}

/**
 * Options for BarcodeDetector constructor
 */
export interface BarcodeDetectorOptions {
  formats?: BarcodeFormat[];
}

/**
 * BarcodeDetector class interface
 */
export interface BarcodeDetectorClass {
  new (options?: BarcodeDetectorOptions): BarcodeDetector;
  getSupportedFormats(): Promise<BarcodeFormat[]>;
}

/**
 * BarcodeDetector instance interface
 */
export interface BarcodeDetector {
  detect(
    image: ImageBitmapSource
  ): Promise<DetectedBarcode[]>;
}

// =============================================================================
// File System Access API
// =============================================================================

/**
 * File type accept descriptor for save file picker
 */
export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

/**
 * Options for showSaveFilePicker
 */
export interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

/**
 * File system writable file stream
 */
export interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

/**
 * File system file handle
 */
export interface FileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

// =============================================================================
// Wake Lock API
// =============================================================================

/**
 * Wake lock sentinel returned by navigator.wakeLock.request()
 */
export interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
  onrelease: ((this: WakeLockSentinel, ev: Event) => void) | null;
}

/**
 * Wake lock API
 */
export interface WakeLock {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

// =============================================================================
// Global Window augmentation
// =============================================================================

declare global {
  interface Window {
    bodySegmentation?: BodySegmentationAPI;
    BarcodeDetector?: BarcodeDetectorClass;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }

  interface Navigator {
    wakeLock?: WakeLock;
  }
}

export {};
