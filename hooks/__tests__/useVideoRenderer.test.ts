import { renderHook } from '@testing-library/react';
import { useVideoRenderer } from '../useVideoRenderer';
import type { CameraSettings } from '../../components/settings';
import type { HardwareCapabilities } from '../useCameraStream';

// Mock constants
vi.mock('../../constants/performance', () => ({
  PERFORMANCE: {
    INFERENCE_INTERVAL_MS: 66,
    AI_TIMEOUT_MS: 5000,
    PERFORMANCE_MODE_SKIP: 3,
    BALANCED_MODE_SKIP: 2,
    QUALITY_MODE_SKIP: 1,
    LOW_FPS_THRESHOLD: 30,
    CRITICAL_FPS_THRESHOLD: 20,
    MAX_LOG_ENTRIES: 1000,
    FRAME_SKIP_RESET: 1000,
  },
}));

// Mock WebGL context
const mockWebGLContext = {
  getExtension: vi.fn(),
  createTexture: vi.fn(),
  bindTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  pixelStorei: vi.fn(),
  deleteTexture: vi.fn(),
  activeTexture: vi.fn(),
  createShader: vi.fn(),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn().mockReturnValue(true),
  createProgram: vi.fn(),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn().mockReturnValue(true),
  useProgram: vi.fn(),
  getUniformLocation: vi.fn(),
  uniform1i: vi.fn(),
  uniform2f: vi.fn(),
  uniform3f: vi.fn(),
  getAttribLocation: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  drawArrays: vi.fn(),
  canvas: {
    width: 1280,
    height: 720,
  },
  viewport: vi.fn(),
  clear: vi.fn(),
  clearColor: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  blendFunc: vi.fn(),
  createBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  ARRAY_BUFFER: 34962,
  STATIC_DRAW: 35044,
  TEXTURE_2D: 3553,
  TEXTURE0: 33984,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  CLAMP_TO_EDGE: 33071,
  LINEAR: 9729,
  UNPACK_ALIGNMENT: 3317,
  BLEND: 3042,
  SRC_ALPHA: 770,
  ONE_MINUS_SRC_ALPHA: 771,
  COLOR_BUFFER_BIT: 16384,
};

// Mock HTMLCanvasElement getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType) => {
  if (contextType === 'webgl2' || contextType === 'webgl') {
    return mockWebGLContext;
  }
  if (contextType === '2d') {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
      createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 100 }),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
    };
  }
  return null;
});

const DEFAULT_SETTINGS: CameraSettings = {
  // Light & Color
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  hue: 0,
  sharpness: 0,

  // Exposure (Hardware)
  exposureMode: 'continuous',
  exposureTime: 0,
  exposureCompensation: 0,

  // White Balance (Hardware)
  whiteBalanceMode: 'continuous',
  colorTemperature: 4500,

  // Focus Control (Hardware)
  focusMode: 'continuous',
  focusDistance: 0,

  // Additional Hardware Controls
  iso: 0,
  backlightCompensation: false,
  powerLineFrequency: 'disabled',
  torch: false,

  // Visual Filter Preset
  activeFilter: 'none',

  // Geometry (Digital PTZ)
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  mirror: false,

  // Effects
  blur: 0,
  portraitLighting: 0,
  faceSmoothing: 0,
  vignette: 0,
  softwareSharpness: 0,

  // Beauty Filters
  jawSlimming: 0,
  eyeEnlargement: 0,
  noseSlimming: 0,
  mouthScaling: 0,

  // Cinematic Color Grading (WebGL)
  cinematicLut: 'none',
  cinematicLutIntensity: 0,
  webglEnabled: true,

  // AI/System
  autoFrame: false,
  autoLowLight: false,
  virtualBackground: false,
  virtualBackgroundImage: null,
  qrMode: false,

  // Conferencing / Audio
  enableAudio: false,
  noiseSuppression: true,
  bandwidthSaver: false,
  audioDeviceId: null,
  echoCancellation: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,

  // Audio Processor (Web Audio API)
  audioCompressorEnabled: false,
  audioCompressorThreshold: -24,
  audioCompressorKnee: 12,
  audioCompressorRatio: 4,
  audioCompressorAttack: 0.003,
  audioCompressorRelease: 0.25,
  audioNoiseGateEnabled: false,
  audioNoiseGateThreshold: -50,
  audioNoiseGateAttack: 0.005,
  audioNoiseGateRelease: 0.1,

  // Resolution & Stream
  resolution: '720p',
  customWidth: 1280,
  customHeight: 720,
  frameRate: 30,
  aspectRatioLock: 'none',
  facingMode: 'user',
  performanceMode: 'quality',

  // Recording
  videoCodec: 'vp9',
  audioCodec: 'opus',
  videoBitrate: 8,
  audioBitrate: 128,

  // Overlays
  gridOverlay: 'none',
  showHistogram: false,
  showZebraStripes: false,
  zebraThreshold: 95,
  showFocusPeaking: false,
  focusPeakingColor: 'red',
};

const DEFAULT_HW_CAPS: HardwareCapabilities = {
  zoom: false,
  panX: false,
  panY: false,
  brightness: false,
  contrast: false,
  saturation: false,
};

describe('useVideoRenderer', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    mockCanvas = document.createElement('canvas');
    mockCanvas.width = 1280;
    mockCanvas.height = 720;

    mockVideo = document.createElement('video');
    mockVideo.width = 1280;
    mockVideo.height = 720;
    Object.defineProperty(mockVideo, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(mockVideo, 'currentTime', { value: 1, configurable: true });

    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn((cb) => {
      setTimeout(cb, 16);
      return 1;
    });

    // Mock cancelAnimationFrame
    global.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize without errors', () => {
    const videoRef = { current: mockVideo };
    const canvasRef = { current: mockCanvas };
    const segmentationMaskRef = { current: null };
    const targetTransformRef = { current: { panX: 0, panY: 0, zoom: 1 } };
    const bgImageRef = { current: null };

    const { result } = renderHook(() =>
      useVideoRenderer({
        videoRef,
        canvasRef,
        settings: DEFAULT_SETTINGS,
        hardwareCapabilities: DEFAULT_HW_CAPS,
        segmentationMaskRef,
        targetTransformRef,
        bgImageRef,
        isAiActive: false,
        isCompareActive: false,
        autoGain: 0,
      })
    );

    expect(result.current.maskCanvasRef).toBeDefined();
    expect(result.current.tempCanvasRef).toBeDefined();
    expect(result.current.maskCanvasRef.current).toBeInstanceOf(HTMLCanvasElement);
    expect(result.current.tempCanvasRef.current).toBeInstanceOf(HTMLCanvasElement);
  });

  it('should cleanup animation frame on unmount', () => {
    const videoRef = { current: mockVideo };
    const canvasRef = { current: mockCanvas };
    const segmentationMaskRef = { current: null };
    const targetTransformRef = { current: { panX: 0, panY: 0, zoom: 1 } };
    const bgImageRef = { current: null };

    const { unmount } = renderHook(() =>
      useVideoRenderer({
        videoRef,
        canvasRef,
        settings: DEFAULT_SETTINGS,
        hardwareCapabilities: DEFAULT_HW_CAPS,
        segmentationMaskRef,
        targetTransformRef,
        bgImageRef,
        isAiActive: false,
        isCompareActive: false,
        autoGain: 0,
      })
    );

    unmount();

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('should handle missing video or canvas refs gracefully', () => {
    const videoRef = { current: null };
    const canvasRef = { current: null };
    const segmentationMaskRef = { current: null };
    const targetTransformRef = { current: { panX: 0, panY: 0, zoom: 1 } };
    const bgImageRef = { current: null };

    const { result } = renderHook(() =>
      useVideoRenderer({
        videoRef,
        canvasRef,
        settings: DEFAULT_SETTINGS,
        hardwareCapabilities: DEFAULT_HW_CAPS,
        segmentationMaskRef,
        targetTransformRef,
        bgImageRef,
        isAiActive: false,
        isCompareActive: false,
        autoGain: 0,
      })
    );

    expect(result.current.maskCanvasRef).toBeDefined();
    expect(result.current.tempCanvasRef).toBeDefined();
  });

  it('should handle WebGL context creation failure', () => {
    // Mock getContext to return null for WebGL
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType) => {
      if (contextType === 'webgl2' || contextType === 'webgl') {
        return null;
      }
      return originalGetContext.call(mockCanvas, contextType);
    });

    const videoRef = { current: mockVideo };
    const canvasRef = { current: mockCanvas };
    const segmentationMaskRef = { current: null };
    const targetTransformRef = { current: { panX: 0, panY: 0, zoom: 1 } };
    const bgImageRef = { current: null };

    const { result } = renderHook(() =>
      useVideoRenderer({
        videoRef,
        canvasRef,
        settings: DEFAULT_SETTINGS,
        hardwareCapabilities: DEFAULT_HW_CAPS,
        segmentationMaskRef,
        targetTransformRef,
        bgImageRef,
        isAiActive: false,
        isCompareActive: false,
        autoGain: 0,
      })
    );

    expect(result.current.maskCanvasRef).toBeDefined();
    expect(result.current.tempCanvasRef).toBeDefined();

    // Restore original getContext
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });
});
