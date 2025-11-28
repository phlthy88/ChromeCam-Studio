/**
 * TensorFlow.js Loader Utility
 * 
 * Centralized utility to ensure TensorFlow.js is only loaded once
 * and prevent multiple kernel registrations.
 */

import { logger } from './logger';

// Global flag to track TensorFlow.js loading status
let tfLoadingPromise: Promise<void> | null = null;
let tfLoaded = false;

/**
 * Ensures TensorFlow.js is loaded only once across the application
 * @returns Promise that resolves when TensorFlow.js is ready
 */
export async function ensureTfjsLoaded(): Promise<void> {
  // If already loaded, return immediately
  if (tfLoaded) {
    logger.debug('tfLoader', 'TensorFlow.js already loaded, skipping');
    return;
  }

  // If currently loading, wait for the existing promise
  if (tfLoadingPromise) {
    logger.debug('tfLoader', 'TensorFlow.js loading in progress, waiting...');
    return tfLoadingPromise;
  }

  // Create a new loading promise
  tfLoadingPromise = (async () => {
    // Check if TensorFlow.js is already available globally
    if (typeof window !== 'undefined' && (window as any).tf) {
      logger.info('tfLoader', 'TensorFlow.js already available globally');
      tfLoaded = true;
      return;
    }

    logger.info('tfLoader', 'Loading TensorFlow.js...');
    
    // Create script element for TensorFlow.js
    const scriptPromise = new Promise<void>((resolve, reject) => {
      // Check again if tf exists in case it was loaded while we set up the promise
      if ((window as any).tf) {
        logger.debug('tfLoader', 'TensorFlow.js became available during setup');
        tfLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = '/mediapipe/tf.min.js';
      script.crossOrigin = 'anonymous';
      
      script.onload = () => {
        logger.debug('tfLoader', 'TensorFlow.js script loaded, waiting for global availability');
        // Wait briefly to ensure tf is available on the global window
        setTimeout(() => {
          if ((window as any).tf) {
            logger.info('tfLoader', 'TensorFlow.js loaded and available globally');
            tfLoaded = true;
            resolve();
          } else {
            logger.error('tfLoader', 'TensorFlow.js script loaded but global tf not available');
            reject(new Error('TensorFlow.js global not available after loading'));
          }
        }, 100);
      };
      
      script.onerror = (error) => {
        logger.error('tfLoader', 'Failed to load TensorFlow.js script', error);
        reject(new Error('Failed to load TensorFlow.js'));
      };
      
      document.head.appendChild(script);
    });

    try {
      await scriptPromise;
    } catch (error) {
      // Reset state on failure to allow retry
      tfLoadingPromise = null;
      tfLoaded = false;
      throw error;
    }
  })();

  try {
    await tfLoadingPromise;
    // Reset the loading promise after successful completion
    tfLoadingPromise = null;
  } catch (error) {
    // If there was an error, reset everything to allow retries
    tfLoadingPromise = null;
    tfLoaded = false;
    throw error;
  }
}

/**
 * Ensures TensorFlow.js WebGL backend is loaded and ready
 * @returns Promise that resolves when WebGL backend is ready
 */
export async function ensureTfjsWebGLBackend(): Promise<void> {
  await ensureTfjsLoaded();
  
  if (typeof window !== 'undefined' && (window as any).tf) {
    const tf = (window as any).tf;
    
    try {
      // Check if WebGL backend is already ready
      if (tf.getBackend() === 'webgl') {
        logger.debug('tfLoader', 'TensorFlow.js WebGL backend already active');
        return;
      }
      
      logger.info('tfLoader', 'Initializing TensorFlow.js WebGL backend...');
      await tf.setBackend('webgl');
      await tf.ready();
      logger.info('tfLoader', 'TensorFlow.js WebGL backend ready');
    } catch (error) {
      logger.warn('tfLoader', 'WebGL backend initialization failed, falling back to CPU', error);
      try {
        await tf.setBackend('cpu');
        await tf.ready();
        logger.info('tfLoader', 'TensorFlow.js CPU backend ready');
      } catch (cpuError) {
        logger.error('tfLoader', 'Both WebGL and CPU backends failed', cpuError);
        throw cpuError;
      }
    }
  } else {
    throw new Error('TensorFlow.js not available');
  }
}

/**
 * Resets the loader state (for testing purposes)
 */
export function resetTfLoaderState(): void {
  tfLoadingPromise = null;
  tfLoaded = false;
}