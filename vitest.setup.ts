import '@testing-library/jest-dom/vitest';

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

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
