import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import ControlsPanel from './ControlsPanel';
import VideoPanel from './VideoPanel';
import { CameraSettings, DEFAULT_SETTINGS, GRID_OVERLAYS } from './settings';
import { useTheme } from '../hooks/useTheme';
import { useSystemAccentColor } from '../hooks/useSystemAccentColor';
import type { ExtendedMediaTrackCapabilities } from '../types/media.d.ts';

/**
 * Main Application Component
 */
const WebcamApp: React.FC = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [capabilities, setCapabilities] = useState<ExtendedMediaTrackCapabilities | null>(null);
  const [detectedCapabilities, setDetectedCapabilities] = useState<import('./settings').DetectedCapabilities | null>(null);
  const [processedAudioStream, setProcessedAudioStream] = useState<MediaStream | null>(null);
  const { theme, setTheme } = useTheme();

  // Initialize dynamic color theming from ChromeOS/system
  useSystemAccentColor();

  // Handle settings change
  const handleSettingsChange = useCallback(
    (newSettings: CameraSettings) => {
      console.log('[WebcamApp] handleSettingsChange called with:', newSettings);
      setSettings(newSettings);
    },
    []
  );

  // Handle keyboard shortcut events from VideoPanel
  useEffect(() => {
    const handleToggleMirror = () => {
      setSettings((prev) => ({ ...prev, mirror: !prev.mirror }));
    };

    const handleCycleGrid = () => {
      setSettings((prev) => {
        const gridIds = GRID_OVERLAYS.map((g) => g.id);
        const currentIndex = gridIds.indexOf(prev.gridOverlay);
        const nextIndex = (currentIndex + 1) % gridIds.length;
        return {
          ...prev,
          gridOverlay: gridIds[nextIndex] ?? 'none',
        };
      });
    };

    window.addEventListener('chromecam-toggle-mirror', handleToggleMirror);
    window.addEventListener('chromecam-cycle-grid', handleCycleGrid);

    return () => {
      window.removeEventListener('chromecam-toggle-mirror', handleToggleMirror);
      window.removeEventListener('chromecam-cycle-grid', handleCycleGrid);
    };
  }, []);

  // Responsive Sidebar Logic
  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  useEffect(() => {
    const getDevices = async () => {
      try {
        console.log('[WebcamApp] Requesting camera permissions...');
        // Request permissions to get device labels
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('[WebcamApp] Permissions granted, enumerating devices...');
        // Close the temporary stream
        stream.getTracks().forEach((track) => track.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        console.log('[WebcamApp] Found devices:', allDevices);

        // Get video devices
        const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
        console.log('[WebcamApp] Video devices:', videoDevices);
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          const firstDeviceId = videoDevices[0]?.deviceId;
          console.log('[WebcamApp] Selecting first device:', firstDeviceId);
          if (firstDeviceId) {
            setSelectedDeviceId((currentId) => currentId ?? firstDeviceId);
          }
        } else {
          console.warn('[WebcamApp] No video devices found');
        }

        // Get audio devices
        const audioInputs = allDevices.filter((device) => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
      } catch (err) {
        console.error('[WebcamApp] Error getting devices:', err);
        // Still try to enumerate without permissions
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
          setDevices(videoDevices);
          if (videoDevices.length > 0) {
            setSelectedDeviceId(videoDevices[0]?.deviceId || null);
          }
        } catch (enumErr) {
          console.error('[WebcamApp] Failed to enumerate devices:', enumErr);
        }
      }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-background text-on-background font-sans overflow-hidden p-1 sm:p-2 md:p-3 gap-2 sm:gap-3">
      {/* Header - Floating on Desktop, standard on Mobile */}
      <div className="rounded-xl overflow-hidden shadow-elevation-0 shrink-0">
        <Header
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onDeviceChange={setSelectedDeviceId}
          onToggleSidebar={toggleSidebar}
          theme={theme}
          onThemeChange={setTheme}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          audioDevices={audioDevices}
          processedAudioStream={processedAudioStream}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex flex-1 overflow-hidden relative gap-2 sm:gap-3">
        {/* Mobile/Tablet Scrim - Softer blur and transparency */}
        <div
          className={`
                        fixed inset-0 z-20 lg:hidden
                        bg-scrim/25 backdrop-blur-[2px]
                        transition-opacity duration-medium2 ease-standard
                        ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                    `}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />

        <div className="flex flex-col lg:flex-row flex-1 h-full relative w-full gap-2 sm:gap-3">
          {/* Sidebar / Settings Panel - Responsive for mobile/tablet/desktop */}
          <aside
            className={`
                            z-30 flex-shrink-0
                            bg-surface-low
                            text-on-surface
                            transition-all duration-long1 ease-emphasized

                            /* Shape: Gentler rounded corners */
                            rounded-t-2xl sm:rounded-t-3xl lg:rounded-xl

                            /* Mobile: Bottom Sheet - taller on tablets for more content */
                            fixed bottom-0 left-0 right-0
                            h-[70vh] sm:h-[65vh] md:h-[60vh] w-full
                            shadow-elevation-2
                            ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full'}

                            /* Desktop: Side Panel with responsive width */
                            lg:relative lg:h-full lg:w-72 xl:w-80 2xl:w-96
                            lg:translate-y-0 lg:shadow-elevation-1
                            border border-outline-variant/10
                        `}
          >
            <div className="h-full overflow-hidden flex flex-col rounded-t-2xl sm:rounded-t-3xl lg:rounded-xl">
              <ControlsPanel
                settings={settings}
                onSettingsChange={handleSettingsChange}
                onCloseMobile={() => setIsSidebarOpen(false)}
                capabilities={capabilities}
                detectedCapabilities={detectedCapabilities}
              />
            </div>
          </aside>

          {/* Video Panel - Responsive height when sidebar open */}
          <div
            className={`
                            bg-black rounded-lg sm:rounded-xl overflow-hidden relative w-full
                            shadow-elevation-1 ring-1 ring-outline-variant/5
                            transition-all duration-long1 ease-emphasized

                            /* Mobile/Tablet: Responsive shrink when sheet open */
                            ${isSidebarOpen ? 'h-[30vh] sm:h-[35vh] md:h-[40vh] flex-none' : 'h-full flex-1'}
                            lg:h-full lg:flex-1
                        `}
          >
            <VideoPanel
              deviceId={selectedDeviceId}
              settings={settings}
              onCapabilitiesChange={setCapabilities}
              onDetectedCapabilitiesChange={setDetectedCapabilities}
              onProcessedAudioStream={setProcessedAudioStream}
            />
          </div>
        </div>
      </main>

    </div>
  );
};

export default WebcamApp;
