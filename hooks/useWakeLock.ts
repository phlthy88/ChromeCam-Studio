import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import type { WakeLockSentinel } from '../types/media.d.ts';

/**
 * useWakeLock - Prevents the screen from going to sleep while the app is active
 *
 * Uses the Screen Wake Lock API to keep the display on during camera operation.
 * Automatically re-acquires the lock when the tab becomes visible again.
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      // Only request wake lock if supported and page is visible
      if (!navigator.wakeLock) {
        return;
      }

      // Check if page is visible before requesting
      if (document.visibilityState !== 'visible') {
        // Don't warn - this is expected if page is backgrounded
        return;
      }

      try {
        // Release existing lock if present
        if (wakeLockRef.current !== null) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }

        wakeLockRef.current = await navigator.wakeLock.request('screen');
        logger.info('useWakeLock', 'Screen wake lock acquired');
      } catch (err) {
        // Only warn for unexpected errors (not visibility-related)
        if (err instanceof Error && err.name === 'NotAllowedError') {
          // Page not visible or user hasn't interacted - this is expected, don't warn
          logger.debug('useWakeLock', 'Wake lock not allowed (page may not be visible)');
        } else {
          logger.warn('useWakeLock', 'Failed to acquire:', err);
        }
      }
    };

    // Initial request only if page is visible
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Page became visible - request wake lock
        requestWakeLock();
      } else if (wakeLockRef.current !== null) {
        // Page hidden - wake lock is automatically released by browser
        // Just clear our reference
        wakeLockRef.current = null;
        logger.info('useWakeLock', 'Screen wake lock released (page hidden)');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLockRef.current !== null) {
        wakeLockRef.current.release().catch(() => {
          // Ignore errors on cleanup
        });
        wakeLockRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return wakeLockRef;
}

export default useWakeLock;
