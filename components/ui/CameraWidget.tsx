import React, { useEffect, useRef, useState } from 'react';

interface CameraWidgetProps {
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    onDeviceChange: (deviceId: string) => void;
}

/**
 * Camera Selection Widget
 *
 * Matches the style of MicrophoneWidget for consistency.
 * Provides a button that opens a dropdown panel for camera selection.
 */
const CameraWidget: React.FC<CameraWidgetProps> = ({
    devices,
    selectedDeviceId,
    onDeviceChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Get the currently selected device
    const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId);
    const selectedLabel = selectedDevice?.label || 'No Camera';

    // Get a short label for the button (first part before parenthesis or first 20 chars)
    const getShortLabel = (label: string) => {
        const parenIndex = label.indexOf('(');
        if (parenIndex > 0) {
            return label.substring(0, parenIndex).trim();
        }
        return label.length > 20 ? label.substring(0, 20) + '...' : label;
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Main Widget Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="
                    flex items-center gap-2
                    px-3 py-2
                    bg-surface-container rounded-full
                    border border-outline-variant
                    hover:bg-surface-container-high
                    transition-all duration-short2 ease-standard
                "
                title={`Current camera: ${selectedLabel}`}
            >
                {/* Camera Icon */}
                <svg
                    className="w-4 h-4 text-on-surface shrink-0"
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

                {/* Camera Label (short version) */}
                <span className="text-on-surface md-label-large hidden sm:inline">
                    {getShortLabel(selectedLabel)}
                </span>

                {/* Chevron */}
                <svg
                    className={`w-4 h-4 text-on-surface-variant transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div
                    className="
                        absolute right-0 top-full mt-2
                        w-80 max-h-[80vh] overflow-y-auto
                        bg-surface-container rounded-xl
                        border border-outline-variant
                        shadow-elevation-3
                        z-[200]
                        p-4
                    "
                >
                    <div className="space-y-3">
                        <h3 className="md-label-large text-on-surface mb-3">Select Camera</h3>

                        {devices.length === 0 ? (
                            <div className="text-on-surface-variant md-body-medium py-4 text-center">
                                No cameras found
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {devices.map((device, index) => {
                                    const isSelected = device.deviceId === selectedDeviceId;
                                    const label = device.label || `Camera ${index + 1}`;

                                    return (
                                        <button
                                            key={device.deviceId}
                                            onClick={() => {
                                                onDeviceChange(device.deviceId);
                                                setIsOpen(false);
                                            }}
                                            className={`
                                                w-full text-left px-4 py-3 rounded-lg
                                                transition-all duration-short2 ease-standard
                                                ${isSelected
                                                    ? 'bg-primary-container text-on-primary-container'
                                                    : 'bg-surface-container-highest hover:bg-surface-high text-on-surface'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Selection indicator */}
                                                <div className="shrink-0">
                                                    {isSelected ? (
                                                        <svg
                                                            className="w-5 h-5"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <circle cx="12" cy="12" r="8" />
                                                        </svg>
                                                    ) : (
                                                        <svg
                                                            className="w-5 h-5 text-outline"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={2}
                                                        >
                                                            <circle cx="12" cy="12" r="8" />
                                                        </svg>
                                                    )}
                                                </div>

                                                {/* Device label */}
                                                <span className="md-body-medium flex-1 break-words">
                                                    {label}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Request permission button if no devices */}
                        {devices.length === 0 && (
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.mediaDevices.getUserMedia({ video: true });
                                        window.location.reload();
                                    } catch (err) {
                                        console.error('Failed to get camera permission:', err);
                                    }
                                }}
                                className="
                                    w-full px-4 py-2 mt-2
                                    bg-primary text-on-primary
                                    rounded-full md-label-large
                                    hover:bg-primary/90
                                    transition-all duration-short2 ease-standard
                                "
                            >
                                Allow Camera Access
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CameraWidget;
