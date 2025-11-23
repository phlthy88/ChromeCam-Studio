import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI component */
  fallback?: ReactNode;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Allow retry after error */
  allowRetry?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary - React Error Boundary for graceful crash recovery
 *
 * Wraps components to catch JavaScript errors and display a fallback UI
 * instead of crashing the entire application.
 *
 * Features:
 * - Catches errors in child components
 * - Displays user-friendly error message
 * - Allows retry/reload functionality
 * - Logs errors for debugging
 * - Customizable fallback UI
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error, info) => logToService(error, info)}
 *   allowRetry={true}
 * >
 *   <VideoPanel {...props} />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error details
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, allowRetry = true } = this.props;

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-surface-container p-6 rounded-xl">
          <div className="text-center max-w-md">
            {/* Error Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-container flex items-center justify-center">
              <svg
                className="w-8 h-8 text-on-error-container"
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
            </div>

            {/* Error Title */}
            <h2 className="text-xl font-semibold text-on-surface mb-2">Something went wrong</h2>

            {/* Error Description */}
            <p className="text-on-surface-variant mb-4">
              The camera encountered an unexpected error. This might be due to a hardware issue or
              browser incompatibility.
            </p>

            {/* Error Details (collapsible) */}
            {error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm text-on-surface-variant hover:text-on-surface">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-surface-container-highest rounded-lg text-xs text-error overflow-auto max-h-32">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              {allowRetry && (
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 bg-primary text-on-primary rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
                >
                  Try Again
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-full font-medium hover:bg-surface-container-highest active:scale-95 transition-all"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * CameraErrorBoundary - Specialized error boundary for camera/video components
 *
 * Provides camera-specific error handling and recovery options.
 */
export class CameraErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[CameraErrorBoundary] Camera error:', error);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRefreshPermissions = async (): Promise<void> => {
    try {
      // Request camera permissions again
      await navigator.mediaDevices.getUserMedia({ video: true });
      this.handleRetry();
    } catch (_e) {
      // Ignore permission errors
    }
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      const isCameraError =
        error?.message.includes('NotAllowed') ||
        error?.message.includes('NotFound') ||
        error?.message.includes('NotReadable') ||
        error?.message.includes('OverConstrained');

      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-black p-6">
          <div className="text-center max-w-md">
            {/* Camera Icon */}
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-surface-container flex items-center justify-center">
              <svg
                className="w-10 h-10 text-on-surface-variant"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-on-surface mb-2">Camera Error</h2>

            <p className="text-on-surface-variant mb-6">
              {isCameraError
                ? 'Unable to access the camera. Please check your permissions and try again.'
                : 'The camera stream encountered an error. This could be a temporary issue.'}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full px-4 py-3 bg-primary text-on-primary rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
              >
                Reload Camera
              </button>

              {isCameraError && (
                <button
                  onClick={this.handleRefreshPermissions}
                  className="w-full px-4 py-2 bg-surface-container text-on-surface rounded-full font-medium hover:bg-surface-container-high active:scale-95 transition-all"
                >
                  Request Permissions
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
