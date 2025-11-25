import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Toast, ToastContextType, ToastType } from '../hooks/useToast';

const ToastContext = React.createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const toast: Toast = { id, message, type, duration };

      setToasts((prev) => {
        // Limit to 5 toasts max
        const newToasts = [...prev, toast];
        if (newToasts.length > 5) {
          const removed = newToasts.shift();
          if (removed) {
            const timeout = timeoutRefs.current.get(removed.id);
            if (timeout) {
              clearTimeout(timeout);
              timeoutRefs.current.delete(removed.id);
            }
          }
        }
        return newToasts;
      });

      if (duration > 0) {
        const timeout = setTimeout(() => {
          dismissToast(id);
        }, duration);
        timeoutRefs.current.set(id, timeout);
      }
    },
    [dismissToast]
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    const refs = timeoutRefs.current;
    return () => {
      refs.forEach((timeout) => clearTimeout(timeout));
      refs.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
};