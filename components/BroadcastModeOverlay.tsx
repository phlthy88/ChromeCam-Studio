import React from 'react';

export interface BroadcastModeOverlayProps {
  onExit: () => void;
}

/**
 * Overlay shown in broadcast mode
 * - Invisible by default
 * - Shows exit button on hover
 */
export const BroadcastModeOverlay: React.FC<BroadcastModeOverlayProps> = ({ onExit }) => {
  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* Exit hint - appears on hover */}
      <div className="absolute top-6 right-6 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
        <button
          onClick={onExit}
          className="
            bg-black/80 text-white px-6 py-3 rounded-full
            backdrop-blur-md border border-white/30
            font-medium shadow-2xl
            hover:bg-black/90 hover:scale-105
            active:scale-95
            transition-all duration-200
          "
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span>Exit Broadcast Mode</span>
            <kbd className="ml-2 px-2 py-0.5 text-xs bg-white/20 rounded border border-white/30">
              ESC
            </kbd>
          </div>
        </button>
      </div>

      {/* Optional: Broadcast indicator (bottom-left corner) */}
      <div className="absolute bottom-6 left-6 opacity-80 pointer-events-none">
        <div className="flex items-center gap-2 bg-red-500/90 text-white px-4 py-2 rounded-full backdrop-blur-sm">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
          <span className="text-sm font-medium">BROADCAST MODE</span>
        </div>
      </div>
    </div>
  );
};
