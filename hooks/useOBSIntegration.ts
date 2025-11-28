import { useCallback, useEffect, useRef, useState } from 'react';
import OBSWebSocket, { OBSWebSocketError, EventTypes } from 'obs-websocket-js';
import { DEFAULT_OBS_WEBSOCKET_URL, OBS_CONNECTION_RETRY_DELAY_MS } from '../constants/network';
import { logger } from '../utils/logger';

// Define simplified types for our UI state
interface OBSConnection {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  scenes: string[];
  currentScene: string | null;
  isRecording: boolean;
  isStreaming: boolean;
  isVirtualCamActive: boolean;
}

/**
 * useOBSIntegration - Real OBS Studio WebSocket integration
 *
 * Provides professional broadcasting controls:
 * - Real-time connection to OBS Studio via WebSocket
 * - Scene switching with live scene list
 * - Recording/streaming/virtual camera toggles
 * - Event-driven status updates
 * - Browser source URL control
 *
 * Usage:
 * 1. Open OBS Studio
 * 2. Go to Tools > WebSocket Server Settings
 * 3. Enable the WebSocket server (note port/password)
 * 4. Call connect('localhost:4455', 'your-password')
 */
export const useOBSIntegration = () => {
  const [state, setState] = useState<OBSConnection>({
    connected: false,
    connecting: false,
    error: null,
    scenes: [],
    currentScene: null,
    isRecording: false,
    isStreaming: false,
    isVirtualCamActive: false,
  });

  const obsRef = useRef<OBSWebSocket | null>(null);
  const virtualCamPollRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize OBS instance
  useEffect(() => {
    obsRef.current = new OBSWebSocket();

    return () => {
      if (obsRef.current) {
        obsRef.current.disconnect();
      }
      if (virtualCamPollRef.current) {
        clearInterval(virtualCamPollRef.current);
      }
    };
  }, []);

  // Helper to update state safely
  const updateState = useCallback((updates: Partial<OBSConnection>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const connect = useCallback(
    async (address: string = DEFAULT_OBS_WEBSOCKET_URL, password?: string) => {
      if (!obsRef.current) return;

      const isMounted = true;
      updateState({ connecting: true, error: null });

      try {
        // Attempt connection
        await obsRef.current.connect(`ws://${address}`, password);

        // Fetch initial state
        const [scenesResponse, sceneResponse, streamStatus, recordStatus, virtualCamStatus] =
          await Promise.all([
            obsRef.current.call('GetSceneList'),
            obsRef.current.call('GetCurrentProgramScene'),
            obsRef.current.call('GetStreamStatus'),
            obsRef.current.call('GetRecordStatus'),
            obsRef.current.call('GetVirtualCamStatus'),
          ]);

        // Set up event listeners for real-time updates
        obsRef.current.on(
          'CurrentProgramSceneChanged',
          (data: EventTypes['CurrentProgramSceneChanged']) => {
            updateState({ currentScene: data.sceneName });
          }
        );

        obsRef.current.on('RecordStateChanged', (data: EventTypes['RecordStateChanged']) => {
          updateState({ isRecording: data.outputActive });
        });

        obsRef.current.on('StreamStateChanged', (data: EventTypes['StreamStateChanged']) => {
          updateState({ isStreaming: data.outputActive });
        });

        // Note: Virtual camera events may not be available in all OBS versions
        // We'll update virtual cam status through polling instead of events
        // obsRef.current.on('VirtualCameraStateChanged', (data: any) => {
        //   updateState({ isVirtualCamActive: data.outputActive });
        // });

        obsRef.current.on('ConnectionClosed', () => {
          updateState({
            connected: false,
            connecting: false,
            error: 'Connection closed by OBS',
          });
          // Stop polling when disconnected
          if (virtualCamPollRef.current) {
            clearInterval(virtualCamPollRef.current);
            virtualCamPollRef.current = null;
          }
        });

        // Start polling virtual camera status every 2 seconds
        virtualCamPollRef.current = setInterval(async () => {
          if (obsRef.current && isMounted) {
            try {
              const virtualCamStatus = await obsRef.current.call('GetVirtualCamStatus');
              if (isMounted) {
                updateState({ isVirtualCamActive: virtualCamStatus.outputActive });
              }
            } catch (_error) {
              // Ignore polling errors, connection will handle them
            }
          }
        }, OBS_CONNECTION_RETRY_DELAY_MS);

        // Update full state
        if (isMounted) {
          updateState({
            connected: true,
            connecting: false,
            scenes: scenesResponse.scenes.map((s) => s.sceneName as string).reverse(), // OBS sends them reversed usually
            currentScene: sceneResponse.currentProgramSceneName,
            isStreaming: streamStatus.outputActive,
            isRecording: recordStatus.outputActive,
            isVirtualCamActive: virtualCamStatus.outputActive,
          });
        }
      } catch (error) {
        const e = error as OBSWebSocketError;
        logger.error('useOBSIntegration', 'OBS Connection failed:', e);
        if (isMounted) {
          updateState({
            connecting: false,
            error:
              e.message ||
              'Failed to connect. Ensure OBS WebSocket Server is enabled (Tools -> WebSocket Server Settings).',
          });
        }
      }
    },
    [updateState]
  );

  const disconnect = useCallback(async () => {
    if (obsRef.current) {
      await obsRef.current.disconnect();
      updateState({ connected: false, error: null });
    }
    // Stop polling when manually disconnected
    if (virtualCamPollRef.current) {
      clearInterval(virtualCamPollRef.current);
      virtualCamPollRef.current = null;
    }
  }, [updateState]);

  // --- Actions ---

  const switchScene = useCallback(async (sceneName: string) => {
    if (!obsRef.current) return;
    await obsRef.current.call('SetCurrentProgramScene', { sceneName });
    // State update happens via event listener
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!obsRef.current) return;
    await obsRef.current.call('ToggleRecord');
  }, []);

  const toggleStreaming = useCallback(async () => {
    if (!obsRef.current) return;
    await obsRef.current.call('ToggleStream');
  }, []);

  const toggleVirtualCam = useCallback(async () => {
    if (!obsRef.current) return;
    await obsRef.current.call('ToggleVirtualCam');
  }, []);

  const setBrowserSourceUrl = useCallback(async (sourceName: string, url: string) => {
    if (!obsRef.current) return;
    try {
      await obsRef.current.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings: { url },
      });
    } catch (e) {
      console.warn(`Could not set URL for source "${sourceName}". Ensure it exists in OBS.`);
      throw e;
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    switchScene,
    toggleRecording,
    toggleStreaming,
    toggleVirtualCam,
    setBrowserSourceUrl,
  };
};
