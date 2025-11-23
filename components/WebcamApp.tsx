import React, { useState, useEffect } from 'react';
import Header from './Header';
import ControlsPanel from './ControlsPanel';
import VideoPanel from './VideoPanel';
import { CameraSettings, DEFAULT_SETTINGS, GRID_OVERLAYS } from './settings';
import { useTheme } from '../hooks/useTheme';

/**
 * Main Application Container
 *
 * Material 3 Refactor:
 * - Uses "Extra Large" shape (28px) for main containers
 * - Distinct background color vs surface container colors
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
        <div className="flex flex-col h-full w-full bg-background text-on-background font-sans overflow-hidden md:p-4 gap-4">
            {/* Header - Floating on Desktop, standard on Mobile */}
            <div className="rounded-2xl overflow-hidden shadow-elevation-0 shrink-0">
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
            <main className="flex flex-1 overflow-hidden relative gap-4">

                {/* Mobile Scrim */}
                <div
                    className={`
                        fixed inset-0 z-20 lg:hidden
                        bg-scrim/40 backdrop-blur-sm
                        transition-opacity duration-medium2 ease-standard
                        ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                    `}
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                />

                <div className="flex flex-col lg:flex-row flex-1 h-full relative w-full gap-4">

                    {/* Sidebar / Settings Panel */}
                    <aside
                        className={`
                            z-30 flex-shrink-0
                            bg-surface-container-low
                            text-on-surface
                            transition-all duration-long1 ease-emphasized

                            /* Shape: Top rounded on mobile, Full rounded on desktop */
                            rounded-t-[28px] lg:rounded-[28px]

                            /* Mobile: Bottom Sheet */
                            fixed bottom-0 left-0 right-0
                            h-[75vh] w-full
                            shadow-elevation-3
                            ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full'}

                            /* Desktop: Side Panel */
                            lg:relative lg:h-full lg:w-80 xl:w-96
                            lg:translate-y-0 lg:shadow-none
                            border border-outline-variant/20
                        `}
                    >
                        <div className="h-full overflow-hidden flex flex-col">
                            <ControlsPanel
                                settings={settings}
                                onSettingsChange={setSettings}
                                onCloseMobile={() => setIsSidebarOpen(false)}
                                capabilities={capabilities}
                                audioDevices={audioDevices}
                            />
                        </div>
                    </aside>

                    {/* Video Panel */}
                    <div
                        className={`
                            bg-black rounded-[28px] overflow-hidden relative w-full
                            shadow-elevation-1 ring-1 ring-outline/10
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
