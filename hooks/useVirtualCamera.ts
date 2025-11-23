import { useCallback, useRef, useState } from 'react';

interface VirtualCameraState {
  isActive: boolean;
  stream: MediaStream | null;
  error: string | null;
}

/**
 * useVirtualCamera - Browser-based virtual camera implementation
 *
 * Captures a canvas as a MediaStream for use in WebRTC applications
 * like Zoom, Teams, or Google Meet.
 */
export const useVirtualCamera = () => {
  const [state, setState] = useState<VirtualCameraState>({
    isActive: false,
    stream: null,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);

  const startVirtualCamera = useCallback(
    async (canvas: HTMLCanvasElement, frameRate: number = 30) => {
      try {
        // Stop existing stream if any
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        // Capture the canvas as a MediaStream
        const stream = canvas.captureStream(frameRate);
        streamRef.current = stream;

        setState({
          isActive: true,
          stream,
          error: null,
        });

        return stream;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to start virtual camera';
        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
        throw error;
      }
    },
    []
  );

  const stopVirtualCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setState({
      isActive: false,
      stream: null,
      error: null,
    });
  }, []);

  const getVirtualStream = useCallback(() => {
    return streamRef.current;
  }, []);

  return {
    ...state,
    startVirtualCamera,
    stopVirtualCamera,
    getVirtualStream,
  };
};
