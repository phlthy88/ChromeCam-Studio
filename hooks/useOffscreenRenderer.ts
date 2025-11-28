import { useEffect, useRef, useState } from 'react';
import { CameraSettings } from '../components/settings';
import { logger } from '../utils/logger';

interface UseOffscreenRendererOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: CameraSettings;
  segmentationMaskRef: React.RefObject<ImageData | null>;
  isAiActive: boolean;
}

/**
 * Hook to manage OffscreenCanvas rendering via Web Worker
 */
export function useOffscreenRenderer({
  videoRef,
  canvasRef,
  settings,
  segmentationMaskRef,
  isAiActive,
}: UseOffscreenRendererOptions) {
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const frameIdRef = useRef<number>(0);
  const isProcessingRef = useRef(false);

  // Initialize worker
  useEffect(() => {
    // Check for OffscreenCanvas support
    if (typeof OffscreenCanvas === 'undefined') {
      logger.warn('useOffscreenRenderer', 'OffscreenCanvas not supported, falling back to main thread');
      return;
    }

    // Create worker
    const worker = new Worker(new URL('../workers/render.worker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    // Handle worker messages
    worker.onmessage = (e) => {
      const { type, error } = e.data;
      if (type === 'init-success') {
        setIsWorkerReady(true);
        logger.info('useOffscreenRenderer', 'Render worker initialized');
      } else if (type === 'init-error') {
        logger.error('useOffscreenRenderer', 'Render worker failed to initialize', error);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      setIsWorkerReady(false);
      cancelAnimationFrame(frameIdRef.current);
    };
  }, []);

  // Initialize canvas transfer
  useEffect(() => {
    if (!workerRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Check if canvas is already transferred (detached)
    // We can check this by seeing if we can get a context (it will fail or return null if detached, but getting context here might interfere with transfer)
    // A safer way is to track it via ref or try/catch
    
    try {
      // Transfer control to offscreen
      // Note: transferControlToOffscreen throws if the canvas has already been transferred
      // or if a context has already been acquired.
      const offscreen = canvas.transferControlToOffscreen();
      
      workerRef.current.postMessage(
        { type: 'init', payload: { canvas: offscreen } },
        [offscreen]
      );
      logger.info('useOffscreenRenderer', 'Canvas control transferred to worker');
    } catch (e) {
      // Canvas might already be transferred or not support transfer
      // or a context was already created on it by the main thread renderer
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes('Cannot get context from a canvas that has transferred its control to offscreen')) {
         logger.warn('useOffscreenRenderer', 'Canvas already transferred, skipping transfer');
      } else if (errorMessage.includes('OffscreenCanvas is not implemented')) {
         logger.warn('useOffscreenRenderer', 'OffscreenCanvas not supported by this browser');
      } else {
         logger.warn('useOffscreenRenderer', 'Failed to transfer canvas control (context likely already exists)', errorMessage);
      }
    }
  }, [isWorkerReady]); // Only run once when worker is ready

  // Render loop
  useEffect(() => {
    if (!isWorkerReady || !workerRef.current || !videoRef.current) return;

    const renderLoop = async () => {
      const video = videoRef.current;
      const worker = workerRef.current;

      if (!video || video.paused || video.ended || !worker) {
        frameIdRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      // Skip if previous frame is still processing (basic flow control)
      if (isProcessingRef.current) {
        frameIdRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      isProcessingRef.current = true;

      try {
        // Create bitmap from video
        const videoBitmap = await createImageBitmap(video);
        
        // Prepare mask bitmap if available
        let maskBitmap: ImageBitmap | null = null;
        if (isAiActive && segmentationMaskRef.current) {
           maskBitmap = await createImageBitmap(segmentationMaskRef.current);
        }

        // Send to worker
        // We transfer ownership of bitmaps to avoid copy overhead
        const transferables: Transferable[] = [videoBitmap];
        if (maskBitmap) transferables.push(maskBitmap);

        worker.postMessage(
          {
            type: 'render',
            payload: {
              videoBitmap,
              maskBitmap,
              settings
            }
          },
          transferables
        );

      } catch (e) {
        logger.error('useOffscreenRenderer', 'Frame capture error', e);
      } finally {
        isProcessingRef.current = false;
        frameIdRef.current = requestAnimationFrame(renderLoop);
      }
    };

    frameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
    };
  }, [isWorkerReady, settings, isAiActive]); // Dependencies for loop restart

  return { isWorkerReady };
}
