
import React, { useState, useEffect } from 'react';
import Header from './Header';
import ControlsPanel from './ControlsPanel';
import VideoPanel from './VideoPanel';
import { CameraSettings, DEFAULT_SETTINGS } from './settings';

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
                    // Continue to enumeration anyway - might get devices without labels
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
        <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
            <Header
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                onDeviceChange={setSelectedDeviceId}
                onToggleSidebar={toggleSidebar}
                isSidebarOpen={isSidebarOpen}
            />
            <main className="flex flex-1 overflow-hidden relative p-2 lg:p-4 gap-4">
                
                {/* Mobile Backdrop (Transparent, used for click-to-dismiss) */}
                <div 
                    className={`
                        absolute inset-0 bg-transparent z-20 lg:hidden
                        transition-all duration-300 ease-in-out
                        ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}
                    `}
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                ></div>

                <div className="flex flex-col lg:flex-row flex-1 h-full relative w-full gap-4">
                    
                    {/* Controls Panel - Bottom Sheet on Mobile, Sidebar on Desktop */}
                    <aside 
                        className={`
                            z-30 flex-shrink-0 
                            bg-slate-100 dark:bg-slate-900 
                            shadow-[0_-8px_30px_rgba(0,0,0,0.12)] lg:shadow-none
                            transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]
                            
                            /* Mobile Styles: Bottom Sheet */
                            fixed bottom-0 left-0 right-0 
                            h-[65vh] w-full 
                            rounded-t-3xl 
                            ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full'}

                            /* Desktop Styles: Side Drawer */
                            lg:relative lg:h-full lg:w-80 xl:w-96 
                            lg:rounded-3xl lg:translate-y-0
                            lg:${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:hidden'}
                        `}
                    >
                        <div className="h-full overflow-y-auto custom-scrollbar">
                            <ControlsPanel 
                                settings={settings}
                                onSettingsChange={setSettings}
                                onCloseMobile={() => setIsSidebarOpen(false)}
                                capabilities={capabilities}
                            />
                        </div>
                    </aside>

                    {/* Video Panel - Material You Surface */}
                    <div 
                        className={`
                            bg-black rounded-3xl overflow-hidden relative w-full shadow-inner ring-1 ring-black/5 dark:ring-white/10
                            transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]
                            
                            /* Mobile Layout: Shrink to top when settings open */
                            ${isSidebarOpen ? 'h-[33vh] flex-none' : 'h-full flex-1'}
                            
                            /* Desktop Layout: Always full height */
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
