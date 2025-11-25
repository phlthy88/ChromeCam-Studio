import { useCallback, useEffect, useState } from 'react';
import type { CameraSettings } from '../components/settings';

const PRESETS_STORAGE_KEY = 'chromecam-presets';
const MAX_USER_PRESETS = 20;

export interface CameraPreset {
  id: string;
  name: string;
  icon?: string;
  settings: Partial<CameraSettings>;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    isBuiltIn: boolean;
  };
}

const builtInPresets: CameraPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    icon: '🎥',
    settings: {
      brightness: 1.1,
      contrast: 1.2,
      saturation: 1.1,
      sharpness: 0.8,
      blur: 0,
      portraitLighting: 20,
      faceSmoothing: 30,
      vignette: 10,
      softwareSharpness: 20,
      activeFilter: 'none',
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mirror: false,
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isBuiltIn: true,
    },
  },
  {
    id: 'lowlight',
    name: 'Low Light',
    icon: '🌙',
    settings: {
      brightness: 1.3,
      contrast: 1.4,
      saturation: 0.9,
      sharpness: 1.0,
      blur: 0,
      portraitLighting: 40,
      faceSmoothing: 50,
      vignette: 5,
      softwareSharpness: 30,
      activeFilter: 'none',
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mirror: false,
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isBuiltIn: true,
    },
  },
  {
    id: 'greenscreen',
    name: 'Green Screen',
    icon: '🎬',
    settings: {
      brightness: 1.0,
      contrast: 1.1,
      saturation: 1.0,
      sharpness: 0.7,
      blur: 0,
      portraitLighting: 10,
      faceSmoothing: 20,
      vignette: 0,
      softwareSharpness: 15,
      activeFilter: 'none',
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mirror: false,
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isBuiltIn: true,
    },
  },
  {
    id: 'presentation',
    name: 'Presentation',
    icon: '📊',
    settings: {
      brightness: 1.2,
      contrast: 1.3,
      saturation: 0.8,
      sharpness: 0.9,
      blur: 0,
      portraitLighting: 15,
      faceSmoothing: 25,
      vignette: 8,
      softwareSharpness: 25,
      activeFilter: 'none',
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mirror: false,
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isBuiltIn: true,
    },
  },
  {
    id: 'podcast',
    name: 'Podcast',
    icon: '🎙️',
    settings: {
      brightness: 1.1,
      contrast: 1.2,
      saturation: 0.9,
      sharpness: 0.8,
      blur: 0,
      portraitLighting: 25,
      faceSmoothing: 35,
      vignette: 12,
      softwareSharpness: 20,
      activeFilter: 'none',
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
      mirror: false,
    },
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isBuiltIn: true,
    },
  },
];

export const usePresets = () => {
  const [userPresets, setUserPresets] = useState<CameraPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  interface StoredPreset {
  id: string;
  name: string;
  icon?: string;
  settings: Partial<CameraSettings>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    isBuiltIn: boolean;
  };
}

// ...

// Load presets from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredPreset[];
        // Convert date strings back to Date objects
        const presets = parsed.map((p) => ({
          ...p,
          metadata: {
            ...p.metadata,
            createdAt: new Date(p.metadata.createdAt),
            updatedAt: new Date(p.metadata.updatedAt),
          },
        }));
        setUserPresets(presets);
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }, []);

  // Save presets to localStorage
  const savePresets = useCallback((presets: CameraPreset[]) => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('Failed to save presets:', error);
    }
  }, []);

  const getAllPresets = useCallback(() => {
    return [...builtInPresets, ...userPresets];
  }, [userPresets]);

  const loadPreset = useCallback(
    (presetId: string, currentSettings: CameraSettings): CameraSettings | null => {
      const allPresets = getAllPresets();
      const preset = allPresets.find((p) => p.id === presetId);
      if (!preset) {
        console.warn('[Presets] Preset not found:', presetId);
        return null;
      }

      // Merge preset settings with current settings
      const newSettings = {
        ...currentSettings,
        ...preset.settings,
      };

      setActivePresetId(presetId);
      return newSettings;
    },
    [getAllPresets]
  );

  const savePreset = useCallback(
    (name: string, settings: CameraSettings) => {
      if (userPresets.length >= MAX_USER_PRESETS) {
        throw new Error(`Maximum ${MAX_USER_PRESETS} user presets allowed`);
      }

      const id = `user-${Date.now()}`;
      const newPreset: CameraPreset = {
        id,
        name,
        settings: { ...settings },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          isBuiltIn: false,
        },
      };

      const updatedPresets = [...userPresets, newPreset];
      setUserPresets(updatedPresets);
      savePresets(updatedPresets);
      setActivePresetId(id);

      return id;
    },
    [userPresets, savePresets]
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      const updatedPresets = userPresets.filter((p) => p.id !== presetId);
      setUserPresets(updatedPresets);
      savePresets(updatedPresets);

      if (activePresetId === presetId) {
        setActivePresetId(null);
      }
    },
    [userPresets, savePresets, activePresetId]
  );

  const updatePreset = useCallback(
    (presetId: string, updates: Partial<Pick<CameraPreset, 'name' | 'settings'>>) => {
      const updatedPresets = userPresets.map((p) =>
        p.id === presetId
          ? {
              ...p,
              ...updates,
              metadata: {
                ...p.metadata,
                updatedAt: new Date(),
              },
            }
          : p
      );
      setUserPresets(updatedPresets);
      savePresets(updatedPresets);
    },
    [userPresets, savePresets]
  );

  return {
    presets: getAllPresets(),
    userPresets,
    activePresetId,
    loadPreset,
    savePreset,
    deletePreset,
    updatePreset,
  };
};
