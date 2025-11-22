
import React from 'react';
import VUMeter from './ui/VUMeter';

interface HeaderProps {
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    onDeviceChange: (deviceId: string) => void;
    onToggleSidebar?: () => void;
    isSidebarOpen?: boolean;
}

const Header: React.FC<HeaderProps> = ({ devices, selectedDeviceId, onDeviceChange, onToggleSidebar }) => {
    return (
        <header 
            className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-between px-6 pt-[env(titlebar-area-height,16px)] pb-2 shrink-0 z-40 relative"
            style={{ minHeight: '64px' }}
        >
            <div className="flex items-center gap-4 w-full">
                
                {/* Mobile Menu Icon */}
                <button 
                    onClick={onToggleSidebar}
                    className="lg:hidden p-3 -ml-3 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200"
                    aria-label="Toggle Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                {/* App Title - Material Headline Small */}
                <h1 className="text-xl lg:text-2xl font-normal tracking-tight text-slate-800 dark:text-slate-100">
                    Webcam Studio
                </h1>
                
                <div className="ml-auto flex items-center gap-3">
                    {/* Microphone VU Meter */}
                    <VUMeter />

                    {/* Camera Selector - Material Pill */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <select
                            value={selectedDeviceId || ''}
                            onChange={(e) => onDeviceChange(e.target.value)}
                            className="
                                appearance-none
                                bg-slate-200 dark:bg-slate-800 
                                hover:bg-slate-300 dark:hover:bg-slate-700
                                text-slate-900 dark:text-slate-100 
                                text-sm font-medium
                                rounded-full py-2.5 pl-10 pr-8 
                                border-none outline-none focus:ring-2 focus:ring-indigo-500 
                                transition-all cursor-pointer
                                min-w-[160px] max-w-[240px] truncate
                            "
                            aria-label="Select Camera"
                        >
                            {devices.length > 0 ? (
                                devices.map((device, index) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Camera ${index + 1}`}
                                    </option>
                                ))
                            ) : (
                                <option disabled>No cameras found</option>
                            )}
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
