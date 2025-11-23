/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GEMINI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global ML libraries loaded via CDN
declare const SelfieSegmentation: new () => {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: unknown) => void) => void;
  send: (input: { image: HTMLVideoElement | HTMLCanvasElement }) => Promise<void>;
  close: () => void;
};

declare const tf: {
  setBackend: (backend: string) => Promise<boolean>;
  ready: () => Promise<void>;
  dispose: (tensor: unknown) => void;
};

declare const bodySegmentation: {
  createSegmenter: (
    model: unknown,
    config: Record<string, unknown>
  ) => Promise<{
    segmentPeople: (
      input: HTMLVideoElement | HTMLCanvasElement
    ) => Promise<Array<{ mask: { toCanvasImageSource: () => HTMLCanvasElement } }>>;
    dispose: () => void;
  }>;
  SupportedModels: {
    MediaPipeSelfieSegmentation: unknown;
  };
};

// Global dev flags injected by Vite
declare const __DEV__: boolean;
declare const __PROD__: boolean;
