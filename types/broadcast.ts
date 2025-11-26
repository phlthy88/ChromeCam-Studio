/**
 * Broadcast mode types and interfaces
 */

export interface BroadcastModeState {
  isActive: boolean;
  startedAt: number | null;
  platform: 'streamyard' | 'restream' | 'obs' | null;
}

export interface BroadcastModeConfig {
  hideUI: boolean;
  hideCursor: boolean;
  enableAudioMonitoring: boolean;
  showExitHint: boolean;
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastModeConfig = {
  hideUI: true,
  hideCursor: true,
  enableAudioMonitoring: true,
  showExitHint: true,
};
