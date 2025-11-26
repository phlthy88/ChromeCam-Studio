// contexts/ToastContext.ts
import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    console.warn('useToast must be used within a ToastProvider. Using fallback implementation.');
    return {
      toasts: [],
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return context;
};
