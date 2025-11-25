import WebcamApp from './components/WebcamApp';
import { ToastProvider } from './hooks/useToast';
import { ToastContainer } from './components/ToastContainer';

function App() {
  // You can add theme switching logic here if desired
  // For example, by adding/removing the 'dark' class on the <html> element.
  return (
    <ToastProvider>
      <div className="h-screen w-full overflow-hidden">
        <WebcamApp />
      </div>
      <ToastContainer />
    </ToastProvider>
  );
}

export default App;
