/// <reference types="vite/client" />
import { BodySegmentationAPI, BarcodeDetectorConstructor } from './types/media';
import { TensorFlowLibrary } from './types/tensorflow';

interface ImportMetaEnv {
  readonly GEMINI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global ML libraries loaded via CDN
declare global {
  interface Window {
    bodySegmentation?: BodySegmentationAPI;
    BarcodeDetector?: BarcodeDetectorConstructor;
    tf?: TensorFlowLibrary;
  }
}

// Global dev flags injected by Vite
declare const __DEV__: boolean;
declare const __PROD__: boolean;
