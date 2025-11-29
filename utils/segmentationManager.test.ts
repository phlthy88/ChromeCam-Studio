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
    // Use a class or function so it can be 'new'ed
    vi.stubGlobal('Worker', class {
        constructor() { throw new Error('Failed to create worker'); }
    });

    try {
      const manager = new SegmentationManager();
      // Expect 'disabled' return instead of throw
      const result = await manager.initialize();
      expect(result).toBe('disabled');
    } finally {
      // Cleanup handled by afterEach, but we can reset if needed for reliability
    }
  });

  it('should initialize model correctly', async () => {
    const mockWorker = new MockWorker();
    vi.stubGlobal('Worker', function() { return mockWorker; });

    const manager = new SegmentationManager();

    // Wait for a short time or use a promise to ensure worker is ready
    setTimeout(() => {
      // Simulate worker init complete message
      // Note: New manager expects 'init-complete', NOT 'ready'
      if (mockWorker.onmessage) {
          mockWorker.onmessage({ data: { type: 'init-complete', success: true } } as any);
      }
    }, 0);

    // Test model initialization (compatibility method)
    await expect(manager.initializeModel('general')).resolves.not.toThrow();
  });

  it('should dispose worker properly', () => {
    const mockWorker = new MockWorker();
    vi.stubGlobal('Worker', function() { return mockWorker; });

    const manager = new SegmentationManager();
    manager.dispose();

    // Check if terminate was called
    expect(mockWorker.terminate).toHaveBeenCalled();
  });
});
