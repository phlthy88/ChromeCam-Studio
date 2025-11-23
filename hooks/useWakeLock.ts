import { useEffect, useRef } from 'react';
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
            if (navigator.wakeLock) {
                try {
                    wakeLockRef.current = await navigator.wakeLock.request('screen');
                } catch (err) {
                    console.warn('[WakeLock] Failed to acquire:', err);
                }
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLockRef.current !== null) {
                wakeLockRef.current.release();
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return wakeLockRef;
}

export default useWakeLock;
