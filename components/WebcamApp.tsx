import React, { useState, useEffect } from 'react';
import Header from './Header';
import ControlsPanel from './ControlsPanel';
import VideoPanel from './VideoPanel';
import { CameraSettings, DEFAULT_SETTINGS } from './settings';

/**
 * Main Application Container
 *
 * Material 3 Layout:
 * - Desktop: Side panel navigation pattern
 * - Mobile: Bottom sheet pattern with proper scrim
 * - M3 surface colors and elevation
 */
const WebcamApp: React.FC = () => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Store camera capabilities to pass to controls
    const [capabilities, setCapabilities] = useState<MediaTrackCapabilities | null>(null);

    // Responsive Sidebar Logic
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsSidebarOpen(true);
            } else {
                setIsSidebarOpen(false);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Explicitly request permission first
                try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                } catch (permErr) {
                    console.warn("Camera permission might be denied or dismissed", permErr);
                }

                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);

                if (videoDevices.length > 0) {
                    setSelectedDeviceId(currentId => currentId ?? videoDevices[0].deviceId);
                }
            } catch (err) {
                console.error("Error enumerating devices: ", err);
            }
        };

        getDevices();

        // Listen for device changes (plug/unplug)
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, []);

    return (
        <div className="flex flex-col h-full w-full bg-background text-on-background font-sans overflow-hidden">
            {/* Header */}
            <Header
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onDeviceChange={setSelectedDeviceId}
                onToggleSidebar={toggleSidebar}
                isSidebarOpen={isSidebarOpen}
            />

            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden relative p-2 lg:p-4 gap-4">

                {/* Mobile Scrim - M3 spec: dims background when sheet is open */}
                <div
                    className={`
                        fixed inset-0 z-20 lg:hidden
                        bg-scrim/40
                        transition-opacity duration-medium2 ease-standard
                        ${isSidebarOpen
                            ? 'opacity-100 pointer-events-auto'
                            : 'opacity-0 pointer-events-none'
                        }
                    `}
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                />

                <div className="flex flex-col lg:flex-row flex-1 h-full relative w-full gap-4">

                    {/* Controls Panel - Bottom Sheet (Mobile) / Side Panel (Desktop) */}
                    <aside
                        className={`
                            z-30 flex-shrink-0
                            bg-surface
                            transition-transform duration-long1 ease-emphasized

                            /* Mobile: Bottom Sheet */
                            fixed bottom-0 left-0 right-0
                            h-[70vh] w-full
                            rounded-t-xl
                            shadow-elevation-3
                            ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full'}

                            /* Desktop: Side Panel */
                            lg:relative lg:h-full lg:w-80 xl:w-96
                            lg:rounded-md lg:translate-y-0
                            lg:shadow-elevation-1
                        `}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Camera Settings"
                    >
                        <div className="h-full overflow-hidden flex flex-col">
                            <ControlsPanel
                                settings={settings}
                                onSettingsChange={setSettings}
                                onCloseMobile={() => setIsSidebarOpen(false)}
                                capabilities={capabilities}
                            />
                        </div>
                    </aside>

                    {/* Video Panel - M3 Surface Container */}
                    <div
                        className={`
                            bg-inverse-surface rounded-md overflow-hidden relative w-full
                            shadow-inner ring-1 ring-outline-variant/20
                            transition-all duration-long1 ease-emphasized

                            /* Mobile: Shrink when sheet open */
                            ${isSidebarOpen ? 'h-[28vh] flex-none' : 'h-full flex-1'}

                            /* Desktop: Always full */
                            lg:h-full lg:flex-1
                        `}
                    >
                        <VideoPanel
                            deviceId={selectedDeviceId}
                            settings={settings}
                            onCapabilitiesChange={setCapabilities}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default WebcamApp;
