import React from 'react';
import { useToast } from '../hooks/useToast';
import { ToastType } from '../contexts/ToastContext';

// Internal Toast Container Component that receives props directly
const ToastContainerInternal: React.FC<{
  toasts: { id: string; message: string; type: ToastType }[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-tertiary-container text-on-tertiary-container border-tertiary/30';
      case 'error':
        return 'bg-error-container text-on-error-container border-error/30';
      case 'warning':
        return 'bg-secondary-container text-on-secondary-container border-secondary/30';
      case 'info':
      default:
        return 'bg-surface-container-high text-on-surface border-outline-variant/30';
    }
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return (
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'warning':
        return (
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
                        pointer-events-auto
                        flex items-center gap-3 px-4 py-3
                        rounded-full border shadow-elevation-2
                        backdrop-blur-sm
                        animate-in slide-in-from-bottom-4 fade-in duration-300
                        ${getToastStyles(toast.type)}
                    `}
          onClick={() => onDismiss(toast.id)}
          role="alert"
        >
          {getIcon(toast.type)}
          <span className="md-body-medium whitespace-nowrap">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

// Public Toast Container Component that uses the hook
export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();
  return <ToastContainerInternal toasts={toasts} onDismiss={dismissToast} />;
};
