import { useCallback, useEffect, useRef, useState } from 'react';
import OBSWebSocket, { OBSWebSocketError } from 'obs-websocket-js';

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

  // Initialize OBS instance
  useEffect(() => {
    obsRef.current = new OBSWebSocket();

    return () => {
      if (obsRef.current) {
        obsRef.current.disconnect();
      }
    };
  }, []);

  // Helper to update state safely
  const updateState = useCallback((updates: Partial<OBSConnection>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const connect = useCallback(
    async (address: string = 'localhost:4455', password?: string) => {
      if (!obsRef.current) return;

      updateState({ connecting: true, error: null });

      try {
        // Attempt connection
        const { obsWebSocketVersion } = await obsRef.current.connect(
          `ws://${address}`,
          password
        );
        console.log(`Connected to OBS (Version: ${obsWebSocketVersion})`);

        // Fetch initial state
        const [
          scenesResponse,
          sceneResponse,
          streamStatus,
          recordStatus,
          virtualCamStatus,
        ] = await Promise.all([
          obsRef.current.call('GetSceneList'),
          obsRef.current.call('GetCurrentProgramScene'),
          obsRef.current.call('GetStreamStatus'),
          obsRef.current.call('GetRecordStatus'),
          obsRef.current.call('GetVirtualCamStatus'),
        ]);

        // Set up event listeners for real-time updates
        obsRef.current.on('CurrentProgramSceneChanged', (data) => {
          updateState({ currentScene: data.sceneName });
        });

        obsRef.current.on('RecordStateChanged', (data) => {
          updateState({ isRecording: data.outputActive });
        });

        obsRef.current.on('StreamStateChanged', (data) => {
          updateState({ isStreaming: data.outputActive });
        });

        obsRef.current.on('VirtualCamStateChanged', (data) => {
          updateState({ isVirtualCamActive: data.outputActive });
        });

        obsRef.current.on('ConnectionClosed', () => {
          updateState({
            connected: false,
            connecting: false,
            error: 'Connection closed by OBS',
          });
        });

        // Update full state
        updateState({
          connected: true,
          connecting: false,
          scenes: scenesResponse.scenes.map((s) => s.sceneName as string).reverse(), // OBS sends them reversed usually
          currentScene: sceneResponse.currentProgramSceneName,
          isStreaming: streamStatus.outputActive,
          isRecording: recordStatus.outputActive,
          isVirtualCamActive: virtualCamStatus.outputActive,
        });
      } catch (error) {
        const e = error as OBSWebSocketError;
        console.error('OBS Connection failed:', e);
        updateState({
          connecting: false,
          error:
            e.message ||
            'Failed to connect. Ensure OBS WebSocket Server is enabled (Tools -> WebSocket Server Settings).',
        });
      }
    },
    [updateState]
  );

  const disconnect = useCallback(async () => {
    if (obsRef.current) {
      await obsRef.current.disconnect();
      updateState({ connected: false, error: null });
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
