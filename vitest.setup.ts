import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';

// Mock global ML libraries that are loaded via CDN
const mockSelfieSegmentation = {
  setOptions: vi.fn(),
  onResults: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
};

Object.defineProperty(window, 'SelfieSegmentation', {
  value: vi.fn(() => mockSelfieSegmentation),
  writable: true,
});

// Mock MediaDevices API
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(),
    enumerateDevices: vi.fn().mockResolvedValue([]),
    getDisplayMedia: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Polyfill OffscreenCanvas for jsdom
if (typeof global.OffscreenCanvas === 'undefined') {
  class OffscreenCanvasMock {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      };
    }
    transferToImageBitmap() {
      return {
        width: this.width,
        height: this.height,
        close: vi.fn(),
      };
    }
  }
  // @ts-ignore
  global.OffscreenCanvas = OffscreenCanvasMock;
}

// Polyfill ImageBitmap since jsdom lacks it
if (typeof global.ImageBitmap === 'undefined') {
  // @ts-ignore
  global.ImageBitmap = class ImageBitmapMock {
    close() {}
  };
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
