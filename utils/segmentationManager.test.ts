// utils/segmentationManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SegmentationManager } from '../utils/segmentationManager';

// --- Mocks ---

// A simple mock worker class we can control directly.
// The postMessage and terminate methods are spies that we can
// make assertions against.
class MockWorker {
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe('segmentationManager', () => {
  // Before each test, stub the global browser APIs that the
  // manager's static feature detection checks for.
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('OffscreenCanvas', vi.fn());
    vi.stubGlobal('createImageBitmap', vi.fn());
  });

  // After each test, clear all mocks and unstub the globals
  // to ensure a clean slate for the next test.
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('should resolve with "worker" on successful initialization', async () => {
    const manager = new SegmentationManager();

    // The new implementation always returns 'worker' if the worker was created successfully
    const result = await manager.initialize();
    expect(result).toBe('worker');
  });

  it('should fail initialization if worker cannot be created', async () => {
    // Temporarily replace the Worker constructor to throw an error
    vi.stubGlobal('Worker', vi.fn(() => {
      throw new Error('Failed to create worker');
    }));

    try {
      const manager = new SegmentationManager();
      await expect(manager.initialize()).rejects.toThrow('Worker failed to initialize');
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal('Worker', MockWorker);
    }
  });

  it('should initialize model correctly', async () => {
    const mockWorker = new MockWorker();
    vi.stubGlobal('Worker', vi.fn(() => mockWorker));

    const manager = new SegmentationManager();

    // Wait for a short time or use a promise to ensure worker is ready
    setTimeout(() => {
      // Simulate worker ready message
      mockWorker.onmessage?.({ data: { type: 'ready', version: '1.0.0' } });
    }, 0);

    // Test model initialization
    await expect(manager.initializeModel('general')).resolves.not.toThrow();
  });

  it('should dispose worker properly', () => {
    const mockWorker = new MockWorker();
    vi.stubGlobal('Worker', vi.fn(() => mockWorker));

    const manager = new SegmentationManager();
    manager.dispose();

    // Check if terminate was called
    expect(mockWorker.terminate).toHaveBeenCalled();
  });
});
