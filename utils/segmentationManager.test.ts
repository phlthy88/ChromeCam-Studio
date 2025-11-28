// utils/segmentationManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SegmentationManager } from '../utils/segmentationManager';

// --- Mocks ---

// A simple mock worker class we can control directly.
// The postMessage and terminate methods are spies that we can
// make assertions against.
class MockWorker {
  onmessage: ((event: { data: any }) => void) | null = null;
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
    const mockWorker = new MockWorker();
    const manager = new SegmentationManager(() => mockWorker as unknown as Worker);

    const promise = manager.initialize();

    // The manager should have attached the onmessage handler.
    expect(mockWorker.onmessage).toBeInstanceOf(Function);

    // Simulate the worker sending the success message.
    mockWorker.onmessage?.({ data: { type: 'init-complete', success: true } });

    // The main promise should resolve to 'worker'.
    await expect(promise).resolves.toBe('worker');
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'init',
      config: { modelType: 'general' },
    });
  });

  it('should retry initialization on timeout and eventually succeed', async () => {
    vi.useFakeTimers();
    const mockWorkers: MockWorker[] = [];
    const manager = new SegmentationManager(() => {
      const worker = new MockWorker();
      mockWorkers.push(worker);
      return worker as unknown as Worker;
    });
    manager.configure({ initializationTimeout: 1, baseRetryDelay: 1 });

    const promise = manager.initialize();

    // --- First attempt: Times out ---
    await vi.advanceTimersByTimeAsync(1);
    expect(mockWorkers[0]?.terminate).toHaveBeenCalledTimes(1);

    // --- Second attempt: Succeeds ---
    await vi.advanceTimersByTimeAsync(1); // Backoff delay
    expect(mockWorkers.length).toBe(2);
    mockWorkers[1]?.onmessage?.({ data: { type: 'init-complete', success: true } });

    await expect(promise).resolves.toBe('worker');
    vi.useRealTimers();
  });

  it('should eventually resolve with "main-thread" after all retries fail', async () => {
    vi.useFakeTimers();
    const mockWorkers: MockWorker[] = [];
    const manager = new SegmentationManager(() => {
      const worker = new MockWorker();
      mockWorkers.push(worker);
      return worker as unknown as Worker;
    });
    manager.configure({
      initializationTimeout: 1,
      baseRetryDelay: 1,
      maxInitializationAttempts: 3,
    });

    const promise = manager.initialize();

    // Exhaust all retry attempts.
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('main-thread');
    expect(mockWorkers.length).toBe(3);
    expect(mockWorkers.every((w) => w.terminate.mock.calls.length === 1)).toBe(true);
    vi.useRealTimers();
  });

  it('should handle immediate worker creation failure and still fall back', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const manager = new SegmentationManager(() => {
      attempt++;
      throw new Error(`Factory error on attempt ${attempt}`);
    });
    manager.configure({ baseRetryDelay: 1, maxInitializationAttempts: 3 });

    const promise = manager.initialize();

    // Exhaust all retry attempts.
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('main-thread');
    expect(attempt).toBe(3);
    vi.useRealTimers();
  });
});
