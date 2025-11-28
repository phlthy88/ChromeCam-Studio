import { useState, useEffect, useCallback } from 'react';
import { logger } from '../utils/logger';

export interface UseBroadcastModeReturn {
  /** Whether broadcast mode is active */
  isBroadcastMode: boolean;
  /** Enter broadcast mode */
  enterBroadcastMode: () => void;
  /** Exit broadcast mode */
  exitBroadcastMode: () => void;
  /** Toggle broadcast mode */
  toggleBroadcastMode: () => void;
}

/**
 * Hook to manage broadcast mode state
 *
 * Broadcast mode:
 * - Hides all UI overlays for clean feed
 * - Routes audio to system output (tab audio)
 * - Shows exit hint on hover
 * - Exits on ESC key
 */
export function useBroadcastMode(): UseBroadcastModeReturn {
  const [isBroadcastMode, setIsBroadcastMode] = useState(false);

  const enterBroadcastMode = useCallback(() => {
    setIsBroadcastMode(true);
    logger.info('useBroadcastMode', 'Entered broadcast mode');

    // Optional: Show toast notification
    window.dispatchEvent(
      new CustomEvent('chromecam-toast', {
        detail: {
          message: 'Broadcast mode active. Press ESC to exit.',
          type: 'info',
          duration: 3000,
        },
      })
    );
  }, []);

  const exitBroadcastMode = useCallback(() => {
    setIsBroadcastMode(false);
    logger.info('useBroadcastMode', 'Exited broadcast mode');
  }, []);

  const toggleBroadcastMode = useCallback(() => {
    if (isBroadcastMode) {
      exitBroadcastMode();
    } else {
      enterBroadcastMode();
    }
  }, [isBroadcastMode, enterBroadcastMode, exitBroadcastMode]);

  // Listen for custom event from control panel
  useEffect(() => {
    const handleEnter = () => enterBroadcastMode();
    window.addEventListener('chromecam-enter-broadcast', handleEnter);
    return () => window.removeEventListener('chromecam-enter-broadcast', handleEnter);
  }, [enterBroadcastMode]);

  // ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBroadcastMode) {
        exitBroadcastMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBroadcastMode, exitBroadcastMode]);

  return {
    isBroadcastMode,
    enterBroadcastMode,
    exitBroadcastMode,
    toggleBroadcastMode,
  };
}
