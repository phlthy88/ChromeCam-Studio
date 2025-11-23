import { useCallback, useEffect, useRef, useState } from 'react';

interface OBSConnection {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  scenes: string[];
  currentScene: string | null;
}

interface OBSWebSocket {
  connect(address: string, password?: string): Promise<void>;
  disconnect(): Promise<void>;
  call(requestType: string, requestData?: any): Promise<any>;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}

/**
 * useOBSIntegration - OBS Studio WebSocket integration
 *
 * Provides control over OBS Studio via WebSocket for scene switching,
 * recording control, and virtual camera management.
 */
export const useOBSIntegration = () => {
  const [connection, setConnection] = useState<OBSConnection>({
    connected: false,
    connecting: false,
    error: null,
    scenes: [],
    currentScene: null,
  });

  const obsRef = useRef<OBSWebSocket | null>(null);

  // Initialize OBS WebSocket (would require obs-websocket-js package)
  useEffect(() => {
    // In production, import obs-websocket-js dynamically
    // For now, create a mock implementation
    const mockOBS: OBSWebSocket = {
      connect: async (address: string, _password?: string) => {
        // Simulate connection
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('OBS connected to', address);
      },
      disconnect: async () => {
        console.log('OBS disconnected');
      },
      call: async (requestType: string, requestData?: any) => {
        console.log('OBS call:', requestType, requestData);
        // Mock responses
        switch (requestType) {
          case 'GetSceneList':
            return {
              scenes: [
                { sceneName: 'Main Scene' },
                { sceneName: 'Camera Only' },
                { sceneName: 'Screen Share' },
              ],
              currentScene: 'Main Scene',
            };
          case 'GetCurrentScene':
            return { name: 'Main Scene' };
          default:
            return {};
        }
      },
      on: (_event: string, _callback: (data: any) => void) => {
        // Mock event listeners
      },
      off: (_event: string, _callback: (data: any) => void) => {
        // Mock event removal
      },
    };

    obsRef.current = mockOBS;
  }, []);

  const connect = useCallback(async (address: string = 'localhost:4455', _password?: string) => {
    if (!obsRef.current) return;

    setConnection((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      await obsRef.current.connect(`ws://${address}`, _password);

      // Get initial scene list
      const sceneData = await obsRef.current.call('GetSceneList');
      const currentSceneData = await obsRef.current.call('GetCurrentScene');

      setConnection({
        connected: true,
        connecting: false,
        error: null,
        scenes: sceneData.scenes?.map((s: any) => s.sceneName) || [],
        currentScene: currentSceneData.name || null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to OBS';
      setConnection((prev) => ({
        ...prev,
        connecting: false,
        error: errorMessage,
      }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!obsRef.current) return;

    try {
      await obsRef.current.disconnect();
    } catch (error) {
      console.error('OBS disconnect error:', error);
    }

    setConnection({
      connected: false,
      connecting: false,
      error: null,
      scenes: [],
      currentScene: null,
    });
  }, []);

  const switchScene = useCallback(
    async (sceneName: string) => {
      if (!obsRef.current || !connection.connected) return;

      try {
        await obsRef.current.call('SetCurrentScene', { 'scene-name': sceneName });
        setConnection((prev) => ({ ...prev, currentScene: sceneName }));
      } catch (error) {
        console.error('Failed to switch scene:', error);
      }
    },
    [connection.connected]
  );

  const startRecording = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StartRecording');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [connection.connected]);

  const stopRecording = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StopRecording');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [connection.connected]);

  const startStreaming = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StartStreaming');
    } catch (error) {
      console.error('Failed to start streaming:', error);
    }
  }, [connection.connected]);

  const stopStreaming = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StopStreaming');
    } catch (error) {
      console.error('Failed to stop streaming:', error);
    }
  }, [connection.connected]);

  const startVirtualCam = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StartVirtualCam');
    } catch (error) {
      console.error('Failed to start virtual camera:', error);
    }
  }, [connection.connected]);

  const stopVirtualCam = useCallback(async () => {
    if (!obsRef.current || !connection.connected) return;

    try {
      await obsRef.current.call('StopVirtualCam');
    } catch (error) {
      console.error('Failed to stop virtual camera:', error);
    }
  }, [connection.connected]);

  const setBrowserSource = useCallback(
    async (sourceName: string, url: string) => {
      if (!obsRef.current || !connection.connected) return;

      try {
        await obsRef.current.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: { url },
        });
      } catch (error) {
        console.error('Failed to set browser source:', error);
      }
    },
    [connection.connected]
  );

  return {
    ...connection,
    connect,
    disconnect,
    switchScene,
    startRecording,
    stopRecording,
    startStreaming,
    stopStreaming,
    startVirtualCam,
    stopVirtualCam,
    setBrowserSource,
  };
};
