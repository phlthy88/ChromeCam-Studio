// hooks/useToast.tsx
import { useContext } from 'react';
import { ToastContext } from '../contexts/ToastContext';

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Provide a fallback implementation to prevent crashes
    console.warn('useToast must be used within a ToastProvider. Using fallback implementation.');
    return {
      toasts: [],
      showToast: () => {},
      dismissToast: () => {},
    };
  }
  return context;
};

export default useToast;
