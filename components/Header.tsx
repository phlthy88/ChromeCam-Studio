import React from 'react';
import VUMeter from './ui/VUMeter';

interface HeaderProps {
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    onDeviceChange: (deviceId: string) => void;
    onToggleSidebar?: () => void;
    isSidebarOpen?: boolean;
}

/**
 * Material 3 Top App Bar
 *
 * Follows M3 specification:
 * - Surface color with proper elevation
 * - M3 typography (Headline Small for title)
 * - Icon buttons with state layers
 * - Proper spacing and alignment
 */
const Header: React.FC<HeaderProps> = ({
    devices,
    selectedDeviceId,
    onDeviceChange,
    onToggleSidebar
}) => {
    return (
        <header
            className="
                bg-surface text-on-surface
                flex items-center justify-between
                px-4 lg:px-6
                pt-[env(titlebar-area-height,12px)] pb-3
                shrink-0 z-40 relative
                shadow-elevation-0
            "
            style={{ minHeight: '64px' }}
        >
            <div className="flex items-center gap-3 w-full">

                {/* Mobile Menu Button - M3 Icon Button */}
                <button
                    onClick={onToggleSidebar}
                    className="
                        lg:hidden p-3 -ml-2
                        rounded-full
                        text-on-surface-variant
                        hover:bg-on-surface/[0.08]
                        active:bg-on-surface/[0.12]
                        transition-colors duration-short2 ease-standard
                        focus:outline-none focus-visible:bg-on-surface/[0.12]
                    "
                    aria-label="Toggle Settings Panel"
                >
                    <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                {/* App Title - M3 Headline Small */}
                <h1 className="md-headline-small text-on-surface">
                    Webcam Studio
                </h1>

                <div className="ml-auto flex items-center gap-3">
                    {/* VU Meter */}
                    <VUMeter />

                    {/* Camera Selector - M3 Filled Select / Dropdown style */}
                    <div className="relative group">
                        {/* Leading Icon */}
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg
                                className="w-5 h-5 text-on-surface-variant"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </div>

                        <select
                            value={selectedDeviceId || ''}
                            onChange={(e) => onDeviceChange(e.target.value)}
                            className="
                                appearance-none
                                bg-surface-container-high
                                hover:bg-surface-container-highest
                                text-on-surface
                                md-label-large
                                rounded-full
                                py-2.5 pl-10 pr-9
                                border border-outline-variant
                                outline-none
                                focus:border-primary focus:ring-2 focus:ring-primary/20
                                transition-all duration-short2 ease-standard
                                cursor-pointer
                                min-w-[140px] max-w-[220px] truncate
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

                        {/* Trailing Icon (Dropdown Arrow) */}
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <svg
                                className="w-4 h-4 text-on-surface-variant"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
