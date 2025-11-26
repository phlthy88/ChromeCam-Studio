import { useEffect } from 'react';
import WebcamApp from './components/WebcamApp';
import { ToastProvider } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { segmentationManager } from './utils/segmentationManager';

function App() {
  // Clean up segmentation worker on app unmount
  useEffect(() => {
    return () => {
      segmentationManager.dispose();
    };
  }, []);

  // You can add theme switching logic here if desired
  // For example, by adding/removing the 'dark' class on the <html> element.
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('App-level error:', error);
        console.error('Component stack:', errorInfo.componentStack);
      }}
      allowRetry={true}
    >
      <ToastProvider>
        <div className="h-screen w-full overflow-hidden">
          <WebcamApp />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
