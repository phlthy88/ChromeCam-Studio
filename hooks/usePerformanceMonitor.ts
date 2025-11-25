import { useEffect, useRef, useState } from 'react';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage?: number;
  audioProcessingTime?: number;
}

export const usePerformanceMonitor = (enabled: boolean = true) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const updateMetrics = () => {
      const now = performance.now();
      const deltaTime = now - lastTimeRef.current;
      frameCountRef.current++;

      // Keep last 60 frame times for averaging
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Update metrics every second
      if (deltaTime >= 1000) {
        const avgFrameTime =
          frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        const fps = 1000 / avgFrameTime;

        setMetrics({
          fps: Math.round(fps * 10) / 10,
          frameTime: Math.round(avgFrameTime * 100) / 100,
          memoryUsage: (performance as unknown as { memory: { usedJSHeapSize: number } })?.memory
            ?.usedJSHeapSize,
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      requestAnimationFrame(updateMetrics);
    };

    const animationId = requestAnimationFrame(updateMetrics);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enabled]);

  return metrics;
};
