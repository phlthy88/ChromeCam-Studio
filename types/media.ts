export interface SegmentationConfig {
  modelType: 'general' | 'landscape';
  backend?: 'mediapipe' | 'tfjs-webgl';
}

export interface SegmentationWorkerMessage {
  type: 'init' | 'segment' | 'updateConfig' | 'dispose';
  payload?: {
    imageBitmap?: ImageBitmap;
    config?: SegmentationConfig;
  };
  timestamp: number;
}

export interface SegmentationWorkerResponse {
  type: 'ready' | 'result' | 'performance' | 'error';
  payload?: {
    maskData?: ArrayBuffer;
    width?: number;
    height?: number;
    fps?: number;
    latency?: number;
    error?: string;
  };
  timestamp: number;
}
