import { useState, useEffect } from 'react';
import { segmentationManager } from '../utils/segmentationManager';
import type { FaceLandmarks } from '../types/face';

/**
 * useFaceTracking - Dedicated hook for consuming face landmarks
 *
 * Decouples face tracking data from the body segmentation logic.
 * Listens to the shared segmentationManager singleton for updates.
 */
export function useFaceTracking() {
  const [faceLandmarks, setFaceLandmarks] = useState<FaceLandmarks | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Subscribe to landmark updates from the shared manager
    segmentationManager.setFaceLandmarksCallback((landmarks) => {
      // Only update state if component is still mounted
      if (isMounted) {
        setFaceLandmarks(landmarks);
      }
    });

    return () => {
      isMounted = false;
      // We don't clear the callback here because segmentationManager is a singleton
      // and other components might still be interested, or it might be re-bound quickly.
    };
  }, []);

  return {
    faceLandmarks,
    hasFace: !!faceLandmarks && faceLandmarks.length > 0
  };
}
