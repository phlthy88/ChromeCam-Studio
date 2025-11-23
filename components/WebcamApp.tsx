import React, { useState, useEffect } from 'react';
import Header from './Header';
import ControlsPanel from './ControlsPanel';
import VideoPanel from './VideoPanel';
import { CameraSettings, DEFAULT_SETTINGS, GRID_OVERLAYS } from './settings';
import { useTheme } from '../hooks/useTheme';
import { useSystemAccentColor } from '../hooks/useSystemAccentColor';

/**
 * Main Application Container
 *
 * Material 3 Refactor with ChromeOS Dynamic Theming:
 * - Softer appearance with reduced blur and contrast
 * - Dynamic color theming from system accent colors
 * - Uses "Large" shape (16px) for gentler rounded corners
 * - Proper spacing to simulate floating panels
 */
const WebcamApp: React.FC = () => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [capabilities, setCapabilities] = useState<MediaTrackCapabilities | null>(null);
    const { theme, setTheme } = useTheme();

    // Initialize dynamic color theming from ChromeOS/system
    useSystemAccentColor();

    // Handle keyboard shortcut events from VideoPanel
    useEffect(() => {
        const handleToggleMirror = () => {
            setSettings(prev => ({ ...prev, mirror: !prev.mirror }));
        };

        const handleCycleGrid = () => {
            setSettings(prev => {
                const gridIds = GRID_OVERLAYS.map(g => g.id);
                const currentIndex = gridIds.indexOf(prev.gridOverlay);
                const nextIndex = (currentIndex + 1) % gridIds.length;
                return { ...prev, gridOverlay: gridIds[nextIndex] ?? 'none' };
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
                // Request permissions to get device labels
                await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => {});
                const allDevices = await navigator.mediaDevices.enumerateDevices();

                // Get video devices
                const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                if (videoDevices.length > 0) {
                    setSelectedDeviceId(currentId => currentId ?? videoDevices[0]?.deviceId ?? null);
                }

                // Get audio devices
                const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
                setAudioDevices(audioInputs);
            } catch (err) {
                console.error("Error enumerating devices: ", err);
            }
        };
        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, []);

    return (
        <div className="flex flex-col h-full w-full bg-background text-on-background font-sans overflow-hidden md:p-3 gap-3">
            {/* Header - Floating on Desktop, standard on Mobile */}
            <div className="rounded-xl overflow-hidden shadow-elevation-0 shrink-0">
                <Header
                    devices={devices}
                    selectedDeviceId={selectedDeviceId}
                    onDeviceChange={setSelectedDeviceId}
                    onToggleSidebar={toggleSidebar}
                    isSidebarOpen={isSidebarOpen}
                    theme={theme}
                    onThemeChange={setTheme}
                />
            </div>

            {/* Main Content Area */}
            <main className="flex flex-1 overflow-hidden relative gap-3">

                {/* Mobile Scrim - Softer blur and transparency */}
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

                <div className="flex flex-col lg:flex-row flex-1 h-full relative w-full gap-3">

                    {/* Sidebar / Settings Panel - Softer appearance */}
                    <aside
                        className={`
                            z-30 flex-shrink-0
                            bg-surface-low
                            text-on-surface
                            transition-all duration-long1 ease-emphasized

                            /* Shape: Gentler rounded corners */
                            rounded-t-2xl lg:rounded-xl

                            /* Mobile: Bottom Sheet with softer shadow */
                            fixed bottom-0 left-0 right-0
                            h-[75vh] w-full
                            shadow-elevation-2
                            ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full'}

                            /* Desktop: Side Panel */
                            lg:relative lg:h-full lg:w-80 xl:w-96
                            lg:translate-y-0 lg:shadow-elevation-1
                            border border-outline-variant/10
                        `}
                    >
                        <div className="h-full overflow-hidden flex flex-col rounded-t-2xl lg:rounded-xl">
                            <ControlsPanel
                                settings={settings}
                                onSettingsChange={setSettings}
                                onCloseMobile={() => setIsSidebarOpen(false)}
                                capabilities={capabilities}
                                audioDevices={audioDevices}
                            />
                        </div>
                    </aside>

                    {/* Video Panel - Softer border and shadow */}
                    <div
                        className={`
                            bg-black rounded-xl overflow-hidden relative w-full
                            shadow-elevation-1 ring-1 ring-outline-variant/5
                            transition-all duration-long1 ease-emphasized

                            /* Mobile: Shrink when sheet open */
                            ${isSidebarOpen ? 'h-[25vh] flex-none' : 'h-full flex-1'}
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
