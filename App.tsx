import WebcamApp from './components/WebcamApp';
import { ToastProvider } from './contexts/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
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
