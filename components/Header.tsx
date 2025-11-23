import React, { useState, useEffect } from 'react';
import VUMeter from './ui/VUMeter';
import { Theme } from '../hooks/useTheme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface HeaderProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onDeviceChange: (deviceId: string) => void;
  onToggleSidebar?: () => void;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  audioEnabled?: boolean;
  processedAudioStream?: MediaStream | null;
}

/**
 * Material 3 Top App Bar
 *
 * Follows M3 specification:
 * - Surface color with proper elevation
 * - M3 typography (Headline Small for title)
 * - Icon buttons with state layers
 * - Proper spacing and alignment
 * - PWA install button with beforeinstallprompt support
 */
const Header: React.FC<HeaderProps> = ({
  devices,
  selectedDeviceId,
  onDeviceChange,
  onToggleSidebar,
  theme,
  onThemeChange,
  audioEnabled,
  processedAudioStream,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };
  return (
    <header
      className="
                bg-surface text-on-surface
                flex items-center justify-between
                px-4 lg:px-5
                pt-[env(titlebar-area-height,10px)] pb-2.5
                shrink-0 z-40 relative
            "
      style={{ minHeight: '56px' }}
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
        <h1 className="md-headline-small text-on-surface">Webcam Studio</h1>

        <div className="ml-auto flex items-center gap-3">
          {/* Theme Toggle Button - Softer interaction states */}
          {onThemeChange && (
            <button
              onClick={() => {
                const nextTheme =
                  theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
                onThemeChange(nextTheme);
              }}
              className="
                                p-2
                                rounded-lg
                                text-on-surface-variant
                                hover:bg-on-surface/[0.05]
                                active:bg-on-surface/[0.08]
                                transition-colors duration-short2 ease-standard
                                focus:outline-none focus-visible:bg-on-surface/[0.08]
                            "
              title={`Theme: ${theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : 'Auto'}`}
              aria-label={`Current theme: ${theme || 'Auto'}. Click to change.`}
            >
              {theme === 'light' && (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              )}
              {theme === 'dark' && (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
              {theme === 'system' && (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          )}

          {/* PWA Install Button */}
          {deferredPrompt && !isInstalled && (
            <button
              onClick={handleInstall}
              className="
                                hidden sm:flex items-center gap-2
                                bg-primary-container text-on-primary-container
                                px-4 py-2 rounded-full
                                md-label-large
                                hover:bg-primary-container/90
                                active:bg-primary-container/80
                                transition-all duration-short2 ease-standard
                                shadow-elevation-1
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                            "
              aria-label="Install ChromeCam Studio"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Install
            </button>
          )}

          {/* VU Meter - only show when audio is enabled */}
          {audioEnabled && <VUMeter audioStream={processedAudioStream || undefined} />}

          {/* Camera Status */}
          {devices.length === 0 && (
            <button
              onClick={async () => {
                try {
                  await navigator.mediaDevices.getUserMedia({ video: true });
                  window.location.reload(); // Reload to re-enumerate devices
                } catch (err) {
                  console.error('Failed to get camera permission:', err);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-error-container hover:bg-error-container/80 text-on-error-container rounded-full text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Allow Camera
            </button>
          )}

          {/* OBS Status - Show if OBS integration is available */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container text-on-surface-container rounded-full text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            OBS Ready
          </div>

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
                                bg-surface-container-highest
                                hover:bg-surface-high
                                text-on-surface
                                md-label-large
                                font-medium
                                rounded-xl
                                py-2 pl-9 pr-8
                                border border-outline-variant/40
                                outline-none
                                focus:border-primary/60 focus:ring-1 focus:ring-primary/15
                                transition-all duration-short2 ease-standard
                                cursor-pointer
                                min-w-[140px] max-w-[200px] truncate
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
