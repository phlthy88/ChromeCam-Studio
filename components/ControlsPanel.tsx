import React, { useState, useEffect, useRef } from 'react';
import ControlSection from './ControlSection';
import Slider from './ui/Slider';
import Toggle from './ui/Toggle';
import Chip from './ui/Chip';
import {
  CameraSettings,
  DEFAULT_SETTINGS,
  RESOLUTION_PRESETS,
  FRAME_RATE_PRESETS,
  VIDEO_CODECS,
  AUDIO_CODECS,
  GRID_OVERLAYS,
  type DetectedCapabilities,
} from './settings';
import { useOBSIntegration } from '../hooks';
import { CINEMATIC_LUT_PRESETS } from '../data/cinematicLuts';
import type { ExtendedMediaTrackCapabilities } from '../types/media.d.ts';

interface ControlsPanelProps {
  settings: CameraSettings;
  onSettingsChange: (settings: CameraSettings) => void;
  onCloseMobile?: () => void;
  capabilities?: ExtendedMediaTrackCapabilities | null;
  detectedCapabilities?: DetectedCapabilities | null;
}

// Defined Defaults for Granular Resets
const DEFAULTS_LIGHT = {
  brightness: 100,
  contrast: 100,
  autoLowLight: false,
  exposureMode: 'continuous',
  exposureTime: 0,
  exposureCompensation: 0,
};

const DEFAULTS_COLOR = {
  saturation: 100,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  sharpness: 0,
};

const DEFAULTS_FILTER = {
  activeFilter: 'none',
};

const DEFAULTS_GEOMETRY = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  mirror: false,
};

const DEFAULTS_EFFECTS = {
  blur: 0,
  portraitLighting: 0,
  faceSmoothing: 0,
  vignette: 0,
  softwareSharpness: 0,
  autoFrame: false,
  denoise: false,
  virtualBackground: false,
  virtualBackgroundImage: null,
};

const DEFAULTS_CINEMATIC = {
  cinematicLut: 'none',
  cinematicLutIntensity: 100,
};

const DEFAULTS_AUDIO_PROCESSOR = {
  audioCompressorEnabled: false,
  audioCompressorThreshold: -24,
  audioCompressorKnee: 12,
  audioCompressorRatio: 4,
  audioCompressorAttack: 0.003,
  audioCompressorRelease: 0.25,
  audioNoiseGateEnabled: false,
  audioNoiseGateThreshold: -50,
  audioNoiseGateAttack: 0.005,
  audioNoiseGateRelease: 0.1,
};

const DEFAULTS_CAMERA_HARDWARE = {
  whiteBalanceMode: 'continuous',
  colorTemperature: 4500,
  focusMode: 'continuous',
  focusDistance: 0,
  iso: 0,
  backlightCompensation: false,
  powerLineFrequency: 'disabled',
  torch: false,
};

const DEFAULTS_STREAM = {
  resolution: '720p',
  customWidth: 1280,
  customHeight: 720,
  frameRate: 30,
  aspectRatioLock: 'none',
  facingMode: 'user',
};

const DEFAULTS_RECORDING = {
  videoCodec: 'vp9',
  audioCodec: 'opus',
  videoBitrate: 8,
  audioBitrate: 128,
};

const DEFAULTS_OVERLAYS = {
  gridOverlay: 'none',
  showHistogram: false,
  showZebraStripes: false,
  zebraThreshold: 95,
  showFocusPeaking: false,
  focusPeakingColor: 'red',
};

// Filter definitions for UI display
const AVAILABLE_FILTERS = [
  { id: 'none', name: 'Original', color: 'bg-slate-200 dark:bg-slate-700' },
  { id: 'playa', name: 'Playa', color: 'bg-orange-200 dark:bg-orange-900' },
  { id: 'honey', name: 'Honey', color: 'bg-yellow-200 dark:bg-yellow-900' },
  { id: 'clay', name: 'Clay', color: 'bg-stone-300 dark:bg-stone-800' },
  { id: 'amber', name: 'Amber', color: 'bg-amber-200 dark:bg-amber-900' },
  { id: 'isla', name: 'Isla', color: 'bg-teal-200 dark:bg-teal-900' },
  { id: 'blush', name: 'Blush', color: 'bg-rose-200 dark:bg-rose-900' },
  { id: 'prime', name: 'Prime', color: 'bg-blue-200 dark:bg-blue-900' },
];

const ControlsPanel: React.FC<ControlsPanelProps> = ({
  settings,
  onSettingsChange,
  onCloseMobile,
  capabilities,
  detectedCapabilities,
}) => {
  // OBS Integration
  const { connected, connecting, connect, disconnect, startRecording, startStreaming } =
    useOBSIntegration();
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showCameraInfo, setShowCameraInfo] = useState(false);
  const [supportedCodecs, setSupportedCodecs] = useState<string[]>([]);
  const [isProMode, setIsProMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check supported codecs on mount
  useEffect(() => {
    const checkCodecs = () => {
      const supported: string[] = [];
      VIDEO_CODECS.forEach((codec) => {
        if (MediaRecorder.isTypeSupported(codec.mimeType)) {
          supported.push(codec.id);
        }
      });
      setSupportedCodecs(supported);
    };
    checkCodecs();
  }, []);

  const applyDefaults = () => {
    onSettingsChange({ ...DEFAULT_SETTINGS });
  };

  const update = (key: keyof CameraSettings, value: number | boolean | string | null) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        update('virtualBackgroundImage', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Settings Import/Export
  const exportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `chromecam-settings-${new Date().toISOString().split('T')[0]}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Validate imported settings against expected schema
  const validateImportedSettings = (imported: unknown): Partial<CameraSettings> | null => {
    if (typeof imported !== 'object' || imported === null) {
      return null;
    }

    const validatedSettings: Partial<CameraSettings> = {};
    const importedObj = imported as Record<string, unknown>;

    // Define expected types for each setting
    const expectedTypes: Record<
      keyof CameraSettings,
      'number' | 'boolean' | 'string' | 'string|null'
    > = {
      brightness: 'number',
      contrast: 'number',
      saturation: 'number',
      grayscale: 'number',
      sepia: 'number',
      hue: 'number',
      sharpness: 'number',
      exposureMode: 'string',
      exposureTime: 'number',
      exposureCompensation: 'number',
      whiteBalanceMode: 'string',
      colorTemperature: 'number',
      focusMode: 'string',
      focusDistance: 'number',
      iso: 'number',
      backlightCompensation: 'boolean',
      powerLineFrequency: 'string',
      torch: 'boolean',
      activeFilter: 'string',
      zoom: 'number',
      panX: 'number',
      panY: 'number',
      rotation: 'number',
      mirror: 'boolean',
      blur: 'number',
      portraitLighting: 'number',
      faceSmoothing: 'number',
      vignette: 'number',
      softwareSharpness: 'number',
      cinematicLut: 'string',
      cinematicLutIntensity: 'number',
      jawSlimming: 'number',
      eyeEnlargement: 'number',
      noseSlimming: 'number',
      mouthScaling: 'number',
      autoFrame: 'boolean',
      denoise: 'boolean',
      autoLowLight: 'boolean',
      virtualBackground: 'boolean',
      virtualBackgroundImage: 'string|null',
      qrMode: 'boolean',
      enableAudio: 'boolean',
      noiseSuppression: 'boolean',
      bandwidthSaver: 'boolean',
      audioDeviceId: 'string|null',
      echoCancellation: 'boolean',
      autoGainControl: 'boolean',
      sampleRate: 'number',
      channelCount: 'number',
      audioCompressorEnabled: 'boolean',
      audioCompressorThreshold: 'number',
      audioCompressorKnee: 'number',
      audioCompressorRatio: 'number',
      audioCompressorAttack: 'number',
      audioCompressorRelease: 'number',
      audioNoiseGateEnabled: 'boolean',
      audioNoiseGateThreshold: 'number',
      audioNoiseGateAttack: 'number',
      audioNoiseGateRelease: 'number',
      resolution: 'string',
      customWidth: 'number',
      customHeight: 'number',
      frameRate: 'number',
      aspectRatioLock: 'string',
      facingMode: 'string',
      videoCodec: 'string',
      audioCodec: 'string',
      videoBitrate: 'number',
      audioBitrate: 'number',
      gridOverlay: 'string',
      showHistogram: 'boolean',
      showZebraStripes: 'boolean',
      zebraThreshold: 'number',
      showFocusPeaking: 'boolean',
      focusPeakingColor: 'string',
      webglEnabled: 'boolean',
      performanceMode: 'string',
    };

    // Validate each key
    for (const key of Object.keys(expectedTypes) as Array<keyof CameraSettings>) {
      if (key in importedObj) {
        const value = importedObj[key];
        const expectedType = expectedTypes[key];

        if (expectedType === 'string|null') {
          if (value === null || typeof value === 'string') {
            (validatedSettings as Record<string, unknown>)[key] = value;
          }
        } else if (typeof value === expectedType) {
          (validatedSettings as Record<string, unknown>)[key] = value;
        }
        // Skip invalid values silently - they'll use defaults
      }
    }

    return Object.keys(validatedSettings).length > 0 ? validatedSettings : null;
  };

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          const validated = validateImportedSettings(imported);
          if (validated) {
            onSettingsChange({ ...DEFAULT_SETTINGS, ...validated });
          } else {
            console.error('Invalid settings file format');
            alert(
              'Invalid settings file format. Please ensure you are importing a valid ChromeCam settings file.'
            );
          }
        } catch (err) {
          console.error('Failed to import settings:', err);
          alert('Failed to parse settings file. Please ensure the file is valid JSON.');
        }
      };
      reader.readAsText(file);
    }
  };

  // --- Module Reset Handlers ---
  const resetLight = () => onSettingsChange({ ...settings, ...DEFAULTS_LIGHT });
  const resetColor = () => onSettingsChange({ ...settings, ...DEFAULTS_COLOR });
  const resetFilters = () => onSettingsChange({ ...settings, ...DEFAULTS_FILTER });
  const resetGeometry = () => onSettingsChange({ ...settings, ...DEFAULTS_GEOMETRY });
  const resetEffects = () => onSettingsChange({ ...settings, ...DEFAULTS_EFFECTS });

  const resetCameraHardware = () => onSettingsChange({ ...settings, ...DEFAULTS_CAMERA_HARDWARE });
  const resetStream = () => onSettingsChange({ ...settings, ...DEFAULTS_STREAM });
  const resetRecording = () => onSettingsChange({ ...settings, ...DEFAULTS_RECORDING });
  const resetOverlays = () => onSettingsChange({ ...settings, ...DEFAULTS_OVERLAYS });
  const resetCinematic = () => onSettingsChange({ ...settings, ...DEFAULTS_CINEMATIC });
  const resetAudioProcessor = () => onSettingsChange({ ...settings, ...DEFAULTS_AUDIO_PROCESSOR });

  const handleMasterReset = () => {
    if (resetConfirm) {
      applyDefaults();
      setResetConfirm(false);
    } else {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
    }
  };

  // Capability helpers
  const hasCapability = (cap: string) => {
    if (!capabilities) return false;
    return cap in capabilities && (capabilities as Record<string, unknown>)[cap] !== undefined;
  };

  const getCapabilityRange = (cap: string) => {
    if (!capabilities) return null;
    const val = (capabilities as Record<string, unknown>)[cap];
    if (val && typeof val === 'object' && 'min' in val && 'max' in val) {
      return val as { min: number; max: number; step?: number };
    }
    return null;
  };

  const getCapabilityOptions = (cap: string) => {
    if (!capabilities) return [];
    const val = (capabilities as Record<string, unknown>)[cap];
    if (Array.isArray(val)) return val as string[];
    return [];
  };

  return (
    <div className="flex flex-col h-full bg-surface-low overflow-x-hidden relative">
      {/* Mobile/Tablet Drag Handle - Softer styling */}
      <div
        className="lg:hidden flex justify-center pt-2 sm:pt-2.5 pb-1 cursor-pointer"
        onClick={onCloseMobile}
      >
        <div className="w-10 sm:w-9 h-1.5 sm:h-1 rounded-full bg-outline-variant/60" />
      </div>

      {/* Header & Global Actions - Responsive padding */}
      <div className="px-3 sm:px-4 pt-2 sm:pt-3 pb-2 shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="md-title-medium sm:md-title-large text-on-surface">Settings</h2>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsProMode(!isProMode)}
              className="md-label-small sm:md-label-medium transition-colors duration-short2 ease-standard px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.04]"
              title={isProMode ? 'Switch to Basic Mode' : 'Switch to Pro Mode'}
            >
              {isProMode ? 'Basic' : 'Pro'}
            </button>
            <button
              onClick={handleMasterReset}
              className={`
                                md-label-small sm:md-label-medium transition-colors duration-short2 ease-standard
                                px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg
                                ${
                                  resetConfirm
                                    ? 'text-error bg-error/10'
                                    : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.04]'
                                }
                            `}
            >
              {resetConfirm ? 'Confirm' : 'Reset All'}
            </button>

            {/* Mobile/Tablet Close Button - Touch-friendly */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-2.5 sm:p-2 -mr-1 rounded-lg hover:bg-on-surface/[0.05] active:bg-on-surface/[0.08] text-on-surface-variant transition-colors duration-short2 ease-standard"
              aria-label="Close settings"
            >
              <svg
                className="w-5 h-5 sm:w-5 sm:h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Controls Scroll Area - Responsive spacing */}
      <div className="flex-1 overflow-y-auto md-scrollbar px-2 sm:px-3 pb-6 space-y-2 sm:space-y-3">
        {/* Basic Settings - Always Visible */}
        {/* Camera Hardware */}
        <ControlSection title="Camera Hardware" onReset={resetCameraHardware}>
          <div className="space-y-5">
            <Toggle
              label="Bandwidth Saver"
              enabled={settings.bandwidthSaver}
              onChange={(v) => update('bandwidthSaver', v)}
            />
            <p className="md-body-small text-on-surface-variant mt-2 ml-1">
              Reduces resolution to 480p/24fps to prioritize connection stability.
            </p>
          </div>
        </ControlSection>

        {/* Audio Studio */}
        <ControlSection title="Audio Studio" onReset={resetAudioProcessor}>
          <div className="space-y-5">
            {/* Info Banner */}
            <div className="bg-tertiary-container p-4 rounded-md flex items-start gap-3">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5 text-on-tertiary-container"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <p className="md-body-small text-on-tertiary-container">
                Professional audio processing using Web Audio API. Improve voice quality with
                compression and noise gating.
              </p>
            </div>

            {/* Compressor Section */}
            <div>
              <Toggle
                label="Compressor"
                enabled={settings.audioCompressorEnabled}
                onChange={(v) => update('audioCompressorEnabled', v)}
              />
              <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                Evens out loud and quiet parts of your voice for consistent levels.
              </p>
            </div>

            {settings.audioCompressorEnabled && (
              <div className="pl-4 border-l-2 border-primary/30 space-y-4">
                <Slider
                  label="Threshold (dB)"
                  value={settings.audioCompressorThreshold}
                  min={-60}
                  max={0}
                  step={1}
                  onChange={(v) => update('audioCompressorThreshold', v)}
                />
                <Slider
                  label="Ratio"
                  value={settings.audioCompressorRatio}
                  min={1}
                  max={20}
                  step={0.5}
                  onChange={(v) => update('audioCompressorRatio', v)}
                />
                <Slider
                  label="Knee (dB)"
                  value={settings.audioCompressorKnee}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(v) => update('audioCompressorKnee', v)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <Slider
                    label="Attack (ms)"
                    value={Math.round(settings.audioCompressorAttack * 1000)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => update('audioCompressorAttack', v / 1000)}
                  />
                  <Slider
                    label="Release (ms)"
                    value={Math.round(settings.audioCompressorRelease * 1000)}
                    min={10}
                    max={1000}
                    step={10}
                    onChange={(v) => update('audioCompressorRelease', v / 1000)}
                  />
                </div>
              </div>
            )}

            {/* Noise Gate Section */}
            <div className="pt-4 border-t border-outline-variant">
              <Toggle
                label="Noise Gate"
                enabled={settings.audioNoiseGateEnabled}
                onChange={(v) => update('audioNoiseGateEnabled', v)}
              />
              <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                Silences audio below threshold to eliminate background noise.
              </p>
            </div>

            {settings.audioNoiseGateEnabled && (
              <div className="pl-4 border-l-2 border-primary/30 space-y-4">
                <Slider
                  label="Threshold (dB)"
                  value={settings.audioNoiseGateThreshold}
                  min={-80}
                  max={-20}
                  step={1}
                  onChange={(v) => update('audioNoiseGateThreshold', v)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <Slider
                    label="Attack (ms)"
                    value={Math.round(settings.audioNoiseGateAttack * 1000)}
                    min={0}
                    max={50}
                    step={1}
                    onChange={(v) => update('audioNoiseGateAttack', v / 1000)}
                  />
                  <Slider
                    label="Release (ms)"
                    value={Math.round(settings.audioNoiseGateRelease * 1000)}
                    min={10}
                    max={500}
                    step={10}
                    onChange={(v) => update('audioNoiseGateRelease', v / 1000)}
                  />
                </div>
              </div>
            )}

            {/* Presets */}
            <div className="pt-4 border-t border-outline-variant">
              <label className="md-label-large text-on-surface mb-3 block">Quick Presets</label>
              <div className="flex gap-2 flex-wrap">
                <Chip
                  label="Voice Call"
                  selected={false}
                  onClick={() => {
                    onSettingsChange({
                      ...settings,
                      audioCompressorEnabled: true,
                      audioCompressorThreshold: -24,
                      audioCompressorRatio: 4,
                      audioCompressorKnee: 12,
                      audioCompressorAttack: 0.003,
                      audioCompressorRelease: 0.25,
                      audioNoiseGateEnabled: true,
                      audioNoiseGateThreshold: -50,
                      audioNoiseGateAttack: 0.005,
                      audioNoiseGateRelease: 0.1,
                    });
                  }}
                  variant="filter"
                />
                <Chip
                  label="Podcast"
                  selected={false}
                  onClick={() => {
                    onSettingsChange({
                      ...settings,
                      audioCompressorEnabled: true,
                      audioCompressorThreshold: -18,
                      audioCompressorRatio: 6,
                      audioCompressorKnee: 8,
                      audioCompressorAttack: 0.005,
                      audioCompressorRelease: 0.15,
                      audioNoiseGateEnabled: true,
                      audioNoiseGateThreshold: -45,
                      audioNoiseGateAttack: 0.003,
                      audioNoiseGateRelease: 0.08,
                    });
                  }}
                  variant="filter"
                />
                <Chip
                  label="Streaming"
                  selected={false}
                  onClick={() => {
                    onSettingsChange({
                      ...settings,
                      audioCompressorEnabled: true,
                      audioCompressorThreshold: -20,
                      audioCompressorRatio: 3,
                      audioCompressorKnee: 15,
                      audioCompressorAttack: 0.003,
                      audioCompressorRelease: 0.3,
                      audioNoiseGateEnabled: false,
                      audioNoiseGateThreshold: -55,
                      audioNoiseGateAttack: 0.005,
                      audioNoiseGateRelease: 0.15,
                    });
                  }}
                  variant="filter"
                />
              </div>
            </div>
          </div>
        </ControlSection>

        {/* Lighting */}
        <ControlSection title="Lighting" onReset={resetLight}>
          <div className="space-y-5">
            <Slider
              label="Brightness"
              value={settings.brightness}
              min={0}
              max={200}
              onChange={(v) => update('brightness', v)}
            />
            <Slider
              label="Contrast"
              value={settings.contrast}
              min={0}
              max={200}
              onChange={(v) => update('contrast', v)}
            />
            <Toggle
              label="Auto Low Light Boost"
              enabled={settings.autoLowLight}
              onChange={(v) => update('autoLowLight', v)}
            />

            {/* Hardware Exposure Controls */}
            {capabilities && capabilities.exposureMode && (
              <div className="pt-4 border-t border-outline-variant">
                <label className="md-label-large text-on-surface mb-3 block">Exposure Mode</label>
                <div className="flex gap-2 mb-5">
                  {(['continuous', 'manual'] as const).map(
                    (mode) =>
                      capabilities.exposureMode?.includes(mode) && (
                        <Chip
                          key={mode}
                          label={mode === 'continuous' ? 'Auto' : 'Manual'}
                          selected={settings.exposureMode === mode}
                          onClick={() => update('exposureMode', mode)}
                          variant="filter"
                        />
                      )
                  )}
                </div>

                {settings.exposureMode === 'manual' && capabilities.exposureTime && (
                  <div className="mb-4">
                    <Slider
                      label="Exposure Time"
                      value={settings.exposureTime || capabilities.exposureTime.min}
                      min={capabilities.exposureTime.min}
                      max={capabilities.exposureTime.max}
                      step={capabilities.exposureTime.step}
                      onChange={(v) => update('exposureTime', v)}
                    />
                  </div>
                )}

                {capabilities.exposureCompensation && (
                  <Slider
                    label="Exposure Comp."
                    value={settings.exposureCompensation}
                    min={capabilities.exposureCompensation.min}
                    max={capabilities.exposureCompensation.max}
                    step={capabilities.exposureCompensation.step}
                    onChange={(v) => update('exposureCompensation', v)}
                  />
                )}
              </div>
            )}
          </div>
        </ControlSection>

        {/* Camera Hardware Controls */}
        {(hasCapability('whiteBalanceMode') ||
          hasCapability('focusMode') ||
          hasCapability('iso') ||
          hasCapability('torch')) && (
          <ControlSection title="Camera Hardware" onReset={resetCameraHardware}>
            <div className="space-y-5">
              {/* White Balance */}
              {hasCapability('whiteBalanceMode') && (
                <div>
                  <label className="md-label-large text-on-surface mb-3 block">White Balance</label>
                  <div className="flex gap-2 mb-3">
                    {getCapabilityOptions('whiteBalanceMode').map((mode) => (
                      <Chip
                        key={mode}
                        label={mode === 'continuous' ? 'Auto' : 'Manual'}
                        selected={settings.whiteBalanceMode === mode}
                        onClick={() => update('whiteBalanceMode', mode)}
                        variant="filter"
                      />
                    ))}
                  </div>
                  {settings.whiteBalanceMode === 'manual' &&
                    hasCapability('colorTemperature') &&
                    (() => {
                      const range = getCapabilityRange('colorTemperature');
                      return (
                        range && (
                          <Slider
                            label="Color Temperature (K)"
                            value={settings.colorTemperature}
                            min={range.min}
                            max={range.max}
                            step={range.step || 100}
                            onChange={(v) => update('colorTemperature', v)}
                          />
                        )
                      );
                    })()}
                </div>
              )}

              {/* Focus Control */}
              {hasCapability('focusMode') && (
                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">Focus</label>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {getCapabilityOptions('focusMode').map((mode) => (
                      <Chip
                        key={mode}
                        label={
                          mode === 'continuous'
                            ? 'Auto'
                            : mode === 'single-shot'
                              ? 'One-Shot'
                              : 'Manual'
                        }
                        selected={settings.focusMode === mode}
                        onClick={() => update('focusMode', mode)}
                        variant="filter"
                      />
                    ))}
                  </div>
                  {settings.focusMode === 'manual' &&
                    hasCapability('focusDistance') &&
                    (() => {
                      const range = getCapabilityRange('focusDistance');
                      return (
                        range && (
                          <Slider
                            label="Focus Distance"
                            value={settings.focusDistance}
                            min={range.min}
                            max={range.max}
                            step={range.step || 0.01}
                            onChange={(v) => update('focusDistance', v)}
                          />
                        )
                      );
                    })()}
                </div>
              )}

              {/* ISO / Gain */}
              {hasCapability('iso') &&
                (() => {
                  const range = getCapabilityRange('iso');
                  return (
                    range && (
                      <div className="pt-4 border-t border-outline-variant">
                        <Slider
                          label="ISO / Gain"
                          value={settings.iso || range.min}
                          min={range.min}
                          max={range.max}
                          step={range.step || 1}
                          onChange={(v) => update('iso', v)}
                        />
                      </div>
                    )
                  );
                })()}

              {/* Sharpness */}
              {hasCapability('sharpness') &&
                (() => {
                  const range = getCapabilityRange('sharpness');
                  return (
                    range && (
                      <div className="pt-4 border-t border-outline-variant">
                        <Slider
                          label="Sharpness"
                          value={settings.sharpness || range.min}
                          min={range.min}
                          max={range.max}
                          step={range.step || 1}
                          onChange={(v) => update('sharpness', v)}
                        />
                      </div>
                    )
                  );
                })()}

              {/* Backlight Compensation */}
              {hasCapability('backlightCompensation') && (
                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Backlight Compensation"
                    enabled={settings.backlightCompensation}
                    onChange={(v) => update('backlightCompensation', v)}
                  />
                  <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                    Improves visibility when subject is against bright backgrounds.
                  </p>
                </div>
              )}

              {/* Power Line Frequency */}
              {hasCapability('powerLineFrequency') && (
                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">Anti-Flicker</label>
                  <div className="flex gap-2">
                    {['disabled', '50Hz', '60Hz'].map((freq) => (
                      <Chip
                        key={freq}
                        label={freq === 'disabled' ? 'Off' : freq}
                        selected={settings.powerLineFrequency === freq}
                        onClick={() => update('powerLineFrequency', freq)}
                        variant="filter"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Torch/Flash */}
              {hasCapability('torch') && (
                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Camera Light / Torch"
                    enabled={settings.torch}
                    onChange={(v) => update('torch', v)}
                  />
                </div>
              )}
            </div>
          </ControlSection>
        )}

        {/* Basic Settings - Always Visible */}
        {/* Resolution & Stream */}
        <ControlSection title="Resolution & Stream" onReset={resetStream}>
          <div className="space-y-5">
            {/* Resolution Picker - filtered by camera capabilities */}
            <div>
              <label className="md-label-large text-on-surface mb-3 block">
                Resolution
                {detectedCapabilities?.maxResolution && (
                  <span className="text-outline ml-2 text-sm">
                    (max: {detectedCapabilities.maxResolution.width}x{detectedCapabilities.maxResolution.height})
                  </span>
                )}
              </label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(RESOLUTION_PRESETS)
                  .filter(([id, preset]) => {
                    // Always show custom option
                    if (id === 'custom') return true;
                    // If no capabilities detected, show all
                    if (!detectedCapabilities?.maxResolution) return true;
                    // Filter based on max resolution
                    return (
                      preset.width <= detectedCapabilities.maxResolution.width &&
                      preset.height <= detectedCapabilities.maxResolution.height
                    );
                  })
                  .map(([id, preset]) => (
                    <Chip
                      key={id}
                      label={preset.label}
                      selected={settings.resolution === id}
                      onClick={() => update('resolution', id)}
                      variant="filter"
                    />
                  ))}
              </div>
            </div>

            {/* Custom Resolution */}
            {settings.resolution === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <Slider
                  label="Width"
                  value={settings.customWidth}
                  min={320}
                  max={4096}
                  step={16}
                  onChange={(v) => update('customWidth', v)}
                />
                <Slider
                  label="Height"
                  value={settings.customHeight}
                  min={240}
                  max={2160}
                  step={16}
                  onChange={(v) => update('customHeight', v)}
                />
              </div>
            )}

            {/* Frame Rate - filtered by camera capabilities */}
            <div className="pt-4 border-t border-outline-variant">
              <label className="md-label-large text-on-surface mb-3 block">
                Frame Rate
                {detectedCapabilities?.maxFrameRate && (
                  <span className="text-outline ml-2 text-sm">
                    (max: {detectedCapabilities.maxFrameRate} fps)
                  </span>
                )}
              </label>
              <div className="flex gap-2 flex-wrap">
                {(detectedCapabilities?.supportedFrameRates?.length
                  ? detectedCapabilities.supportedFrameRates
                  : FRAME_RATE_PRESETS
                ).map((fps) => (
                  <Chip
                    key={fps}
                    label={`${fps} fps`}
                    selected={settings.frameRate === fps}
                    onClick={() => update('frameRate', fps)}
                    variant="filter"
                  />
                ))}
              </div>
            </div>

            {/* Aspect Ratio Lock */}
            <div className="pt-4 border-t border-outline-variant">
              <label className="md-label-large text-on-surface mb-3 block">Aspect Ratio</label>
              <div className="flex gap-2">
                {['none', '4:3', '16:9', '1:1'].map((ratio) => (
                  <Chip
                    key={ratio}
                    label={ratio === 'none' ? 'Free' : ratio}
                    selected={settings.aspectRatioLock === ratio}
                    onClick={() => update('aspectRatioLock', ratio)}
                    variant="filter"
                  />
                ))}
              </div>
            </div>

            {/* Facing Mode (Mobile) */}
            <div className="pt-4 border-t border-outline-variant">
              <label className="md-label-large text-on-surface mb-3 block">Camera Direction</label>
              <div className="flex gap-2">
                <Chip
                  label="Front"
                  selected={settings.facingMode === 'user'}
                  onClick={() => update('facingMode', 'user')}
                  variant="filter"
                />
                <Chip
                  label="Back"
                  selected={settings.facingMode === 'environment'}
                  onClick={() => update('facingMode', 'environment')}
                  variant="filter"
                />
              </div>
              <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                Switch between front and rear cameras on mobile devices.
              </p>
            </div>
          </div>
        </ControlSection>

        {/* Color Filters */}
        <ControlSection title="Color Filters" onReset={resetFilters}>
          <div className="flex gap-3 overflow-x-auto pb-2 md-scrollbar snap-x -mx-1 px-1">
            {AVAILABLE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => update('activeFilter', filter.id)}
                className="flex-shrink-0 snap-start flex flex-col items-center gap-2 group"
              >
                <div
                  className={`
                                    w-14 h-14 rounded-full shadow-elevation-1
                                    transition-all duration-short3 ease-emphasized
                                    ${filter.color}
                                    ${
                                      settings.activeFilter === filter.id
                                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container scale-110'
                                        : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'
                                    }
                                `}
                />
                <span
                  className={`
                                    md-label-small transition-colors duration-short2 ease-standard
                                    ${
                                      settings.activeFilter === filter.id
                                        ? 'text-primary'
                                        : 'text-on-surface-variant'
                                    }
                                `}
                >
                  {filter.name}
                </span>
              </button>
            ))}
          </div>
        </ControlSection>

        {/* Recording */}
        <ControlSection title="Recording" onReset={resetRecording}>
          <div className="space-y-5">
            {/* Video Codec */}
            <div>
              <label className="md-label-large text-on-surface mb-3 block">Video Codec</label>
              <div className="flex gap-2 flex-wrap">
                {VIDEO_CODECS.filter((c) => supportedCodecs.includes(c.id)).map((codec) => (
                  <Chip
                    key={codec.id}
                    label={codec.label}
                    selected={settings.videoCodec === codec.id}
                    onClick={() => update('videoCodec', codec.id)}
                    variant="filter"
                  />
                ))}
              </div>
              {supportedCodecs.length === 0 && (
                <p className="md-body-small text-on-surface-variant">Checking codec support...</p>
              )}
            </div>

            {/* Video Bitrate */}
            <div className="pt-4 border-t border-outline-variant">
              <Slider
                label="Video Bitrate (Mbps)"
                value={settings.videoBitrate}
                min={1}
                max={50}
                step={1}
                onChange={(v) => update('videoBitrate', v)}
              />
            </div>

            {/* Audio Codec */}
            <div className="pt-4 border-t border-outline-variant">
              <label className="md-label-large text-on-surface mb-3 block">Audio Codec</label>
              <div className="flex gap-2">
                {AUDIO_CODECS.map((codec) => (
                  <Chip
                    key={codec.id}
                    label={codec.label}
                    selected={settings.audioCodec === codec.id}
                    onClick={() => update('audioCodec', codec.id)}
                    variant="filter"
                  />
                ))}
              </div>
            </div>

            {/* Audio Bitrate */}
            <div className="pt-4 border-t border-outline-variant">
              <Slider
                label="Audio Bitrate (kbps)"
                value={settings.audioBitrate}
                min={64}
                max={320}
                step={32}
                onChange={(v) => update('audioBitrate', v)}
              />
            </div>
          </div>
        </ControlSection>

        {/* Pro Mode Advanced Settings */}
        {isProMode && (
          <>
            {/* Cinematic Color Grading */}
            <ControlSection title="Cinematic Color" onReset={resetCinematic}>
              <div className="space-y-5">
                {/* Info Banner */}
                <div className="bg-secondary-container p-4 rounded-md flex items-start gap-3">
                  <svg
                    className="w-5 h-5 shrink-0 mt-0.5 text-on-secondary-container"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                    />
                  </svg>
                  <p className="md-body-small text-on-secondary-container">
                    GPU-accelerated color grading using 3D LUTs. Applies cinematic film looks in
                    real-time.
                  </p>
                </div>

                {/* LUT Presets by Category */}
                <div>
                  <label className="md-label-large text-on-surface mb-3 block">Film Looks</label>
                  <div className="flex gap-2 flex-wrap">
                    {CINEMATIC_LUT_PRESETS.filter((lut) => lut.category === 'film').map((lut) => (
                      <Chip
                        key={lut.id}
                        label={lut.name}
                        selected={settings.cinematicLut === lut.id}
                        onClick={() => update('cinematicLut', lut.id)}
                        variant="filter"
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">Mood</label>
                  <div className="flex gap-2 flex-wrap">
                    {CINEMATIC_LUT_PRESETS.filter((lut) => lut.category === 'mood').map((lut) => (
                      <Chip
                        key={lut.id}
                        label={lut.name}
                        selected={settings.cinematicLut === lut.id}
                        onClick={() => update('cinematicLut', lut.id)}
                        variant="filter"
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">Creative</label>
                  <div className="flex gap-2 flex-wrap">
                    {CINEMATIC_LUT_PRESETS.filter(
                      (lut) => lut.category === 'creative' || lut.category === 'vintage'
                    ).map((lut) => (
                      <Chip
                        key={lut.id}
                        label={lut.name}
                        selected={settings.cinematicLut === lut.id}
                        onClick={() => update('cinematicLut', lut.id)}
                        variant="filter"
                      />
                    ))}
                  </div>
                </div>

                {/* Intensity Slider */}
                {settings.cinematicLut !== 'none' && (
                  <div className="pt-4 border-t border-outline-variant">
                    <Slider
                      label="Intensity"
                      value={settings.cinematicLutIntensity}
                      min={0}
                      max={100}
                      onChange={(v) => update('cinematicLutIntensity', v)}
                    />
                    <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                      Blend between original and graded look.
                    </p>
                  </div>
                )}
              </div>
            </ControlSection>

            {/* Color Adjustments */}
            <ControlSection title="Color Adjustments" onReset={resetColor}>
              <div className="space-y-5">
                <Slider
                  label="Saturation"
                  value={settings.saturation}
                  min={0}
                  max={200}
                  onChange={(v) => update('saturation', v)}
                />
                <Slider
                  label="Hue"
                  value={settings.hue}
                  min={0}
                  max={360}
                  onChange={(v) => update('hue', v)}
                />
                <Slider
                  label="Sepia"
                  value={settings.sepia}
                  min={0}
                  max={100}
                  onChange={(v) => update('sepia', v)}
                />
                <Slider
                  label="Grayscale"
                  value={settings.grayscale}
                  min={0}
                  max={100}
                  onChange={(v) => update('grayscale', v)}
                />
              </div>
            </ControlSection>

            {/* Geometry */}
            <ControlSection title="Geometry" onReset={resetGeometry}>
              <div className="space-y-5">
                <Slider
                  label="Zoom"
                  value={settings.zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(v) => update('zoom', v)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <Slider
                    label="Pan X"
                    value={settings.panX}
                    min={-50}
                    max={50}
                    onChange={(v) => update('panX', v)}
                    disabled={!capabilities?.pan}
                  />
                  <Slider
                    label="Pan Y"
                    value={settings.panY}
                    min={-50}
                    max={50}
                    onChange={(v) => update('panY', v)}
                    disabled={!capabilities?.tilt}
                  />
                </div>
                <Slider
                  label="Rotation"
                  value={settings.rotation}
                  min={-180}
                  max={180}
                  onChange={(v) => update('rotation', v)}
                />
                <Toggle
                  label="Mirror Video"
                  enabled={settings.mirror}
                  onChange={(v) => update('mirror', v)}
                />
              </div>
            </ControlSection>

            {/* Effects (AI) */}
            <ControlSection title="AI Effects" onReset={resetEffects}>
              <div className="space-y-5">
                {/* Info Banner - M3 style */}
                <div className="bg-tertiary-container p-4 rounded-md flex items-start gap-3">
                  <svg
                    className="w-5 h-5 shrink-0 mt-0.5 text-on-tertiary-container"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <p className="md-body-small text-on-tertiary-container">
                    AI features run locally on your device. No video data is sent to the cloud.
                  </p>
                </div>

                <Toggle
                  label="Auto Frame"
                  enabled={settings.autoFrame}
                  onChange={(v) => update('autoFrame', v)}
                />

                <Toggle
                  label="Noise Reduction"
                  enabled={settings.denoise}
                  onChange={(v) => update('denoise', v)}
                />

                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Virtual Background"
                    enabled={settings.virtualBackground}
                    onChange={(v) => update('virtualBackground', v)}
                  />
                  {settings.virtualBackground && (
                    <div className="mt-4">
                      <label className="md-label-large text-on-surface mb-2 block">
                        Select Image
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="
                                            block w-full md-body-small text-on-surface-variant
                                            file:mr-3 file:py-2 file:px-4
                                            file:rounded-full file:border-0
                                            file:md-label-large
                                            file:bg-secondary-container file:text-on-secondary-container
                                            file:cursor-pointer
                                            hover:file:bg-secondary
                                            transition-colors duration-short2 ease-standard
                                        "
                      />
                    </div>
                  )}
                </div>

                <Slider
                  label="Background Blur"
                  value={settings.blur}
                  min={0}
                  max={20}
                  onChange={(v) => update('blur', v)}
                />
                <Slider
                  label="Portrait Lighting"
                  value={settings.portraitLighting}
                  min={0}
                  max={100}
                  onChange={(v) => update('portraitLighting', v)}
                />
                <Slider
                  label="Face Smoothing"
                  value={settings.faceSmoothing}
                  min={0}
                  max={100}
                  onChange={(v) => update('faceSmoothing', v)}
                />

                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">
                    Post-Processing
                  </label>
                  <div className="space-y-5">
                    <Slider
                      label="Software Sharpness"
                      value={settings.softwareSharpness}
                      min={0}
                      max={100}
                      onChange={(v) => update('softwareSharpness', v)}
                    />
                    <p className="md-body-small text-on-surface-variant -mt-2 ml-1">
                      Enhance edge definition (use when hardware sharpness unavailable).
                    </p>
                    <Slider
                      label="Vignette"
                      value={settings.vignette}
                      min={0}
                      max={100}
                      onChange={(v) => update('vignette', v)}
                    />
                    <p className="md-body-small text-on-surface-variant -mt-2 ml-1">
                      Add a subtle darkening around the edges for a cinematic look.
                    </p>
                  </div>
                </div>
              </div>
            </ControlSection>

            {/* Overlays */}
            <ControlSection title="Overlays" onReset={resetOverlays}>
              <div className="space-y-5">
                {/* Grid Overlay */}
                <div>
                  <label className="md-label-large text-on-surface mb-3 block">Grid Overlay</label>
                  <div className="flex gap-2 flex-wrap">
                    {GRID_OVERLAYS.map((grid) => (
                      <Chip
                        key={grid.id}
                        label={grid.label}
                        selected={settings.gridOverlay === grid.id}
                        onClick={() => update('gridOverlay', grid.id)}
                        variant="filter"
                      />
                    ))}
                  </div>
                </div>

                {/* Histogram */}
                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Histogram"
                    enabled={settings.showHistogram}
                    onChange={(v) => update('showHistogram', v)}
                  />
                  <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                    Shows real-time RGB/luminance distribution.
                  </p>
                </div>

                {/* Zebra Stripes */}
                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Zebra Stripes"
                    enabled={settings.showZebraStripes}
                    onChange={(v) => update('showZebraStripes', v)}
                  />
                  {settings.showZebraStripes && (
                    <div className="mt-3">
                      <Slider
                        label="Threshold (%)"
                        value={settings.zebraThreshold}
                        min={85}
                        max={100}
                        onChange={(v) => update('zebraThreshold', v)}
                      />
                    </div>
                  )}
                  <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                    Highlights overexposed areas.
                  </p>
                </div>

                {/* Focus Peaking */}
                <div className="pt-4 border-t border-outline-variant">
                  <Toggle
                    label="Focus Peaking"
                    enabled={settings.showFocusPeaking}
                    onChange={(v) => update('showFocusPeaking', v)}
                  />
                  {settings.showFocusPeaking && (
                    <div className="mt-3">
                      <label className="md-label-large text-on-surface mb-2 block">Color</label>
                      <div className="flex gap-2">
                        {['red', 'green', 'blue', 'white'].map((color) => (
                          <Chip
                            key={color}
                            label={color.charAt(0).toUpperCase() + color.slice(1)}
                            selected={settings.focusPeakingColor === color}
                            onClick={() => update('focusPeakingColor', color)}
                            variant="filter"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                    Highlights in-focus edges for manual focus assistance.
                  </p>
                </div>
              </div>
            </ControlSection>

            {/* OBS Studio Integration */}
            <ControlSection title="OBS Studio">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={connected ? disconnect : () => connect()}
                    disabled={connecting}
                    className="px-4 py-2 bg-primary text-on-primary rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect to OBS'}
                  </button>
                  <div
                    className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-error'}`}
                  ></div>
                  <span className="text-sm text-on-surface-variant">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                {connected && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={startRecording}
                      className="px-3 py-2 bg-secondary-container text-on-secondary-container rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
                    >
                      Start Recording
                    </button>
                    <button
                      onClick={startStreaming}
                      className="px-3 py-2 bg-secondary-container text-on-secondary-container rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
                    >
                      Start Streaming
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      /* TODO: Start recording */
                    }}
                    className="px-3 py-2 bg-secondary-container text-on-secondary-container rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
                  >
                    Start Recording
                  </button>
                  <button
                    onClick={() => {
                      /* TODO: Start streaming */
                    }}
                    className="px-3 py-2 bg-secondary-container text-on-secondary-container rounded-full font-medium hover:shadow-elevation-1 active:scale-95 transition-all"
                  >
                    Start Streaming
                  </button>
                </div>

                <p className="md-body-small text-on-surface-variant ml-1">
                  Control OBS Studio recording and streaming from ChromeCam.
                </p>
              </div>
            </ControlSection>

            {/* Beauty Filters */}
            <ControlSection title="Beauty Filters">
              <div className="space-y-5">
                <Slider
                  label="Eye Enlargement"
                  value={settings.eyeEnlargement}
                  min={0}
                  max={100}
                  onChange={(v) => update('eyeEnlargement', v)}
                />
                <Slider
                  label="Nose Slimming"
                  value={settings.noseSlimming}
                  min={0}
                  max={100}
                  onChange={(v) => update('noseSlimming', v)}
                />
                <Slider
                  label="Jaw Slimming"
                  value={settings.jawSlimming}
                  min={0}
                  max={100}
                  onChange={(v) => update('jawSlimming', v)}
                />
                <Slider
                  label="Mouth Scaling"
                  value={settings.mouthScaling}
                  min={0}
                  max={100}
                  onChange={(v) => update('mouthScaling', v)}
                />
                <p className="md-body-small text-on-surface-variant ml-1">
                  AI-powered facial reshaping using real-time landmark detection.
                </p>
              </div>
            </ControlSection>

            {/* Tools & Utilities */}
            <ControlSection title="Tools">
              <div className="space-y-5">
                <Toggle
                  label="QR Code Scanner"
                  enabled={settings.qrMode}
                  onChange={(v) => update('qrMode', v)}
                />
                <p className="md-body-small text-on-surface-variant ml-1">
                  Detects QR codes and barcodes using native browser APIs.
                </p>

                {/* Camera Info Panel */}
                <div className="pt-4 border-t border-outline-variant">
                  <button
                    onClick={() => setShowCameraInfo(!showCameraInfo)}
                    className="w-full flex items-center justify-between py-2 text-on-surface hover:text-primary transition-colors"
                  >
                    <span className="md-label-large">Camera Info</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${showCameraInfo ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showCameraInfo && capabilities && (
                    <div className="mt-3 p-3 bg-surface-container rounded-lg space-y-2 text-sm">
                      {Object.entries(capabilities).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <span className="text-on-surface-variant">{key}:</span>
                          <span className="text-on-surface font-mono text-right truncate max-w-[60%]">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showCameraInfo && !capabilities && (
                    <p className="mt-3 md-body-small text-on-surface-variant">
                      No camera capabilities available.
                    </p>
                  )}
                </div>

                {/* Settings Import/Export */}
                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">
                    Settings Backup
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={exportSettings}
                      className="flex-1 py-2 px-4 bg-secondary-container text-on-secondary-container rounded-full md-label-large hover:bg-secondary transition-colors"
                    >
                      Export
                    </button>
                    <label className="flex-1 py-2 px-4 bg-secondary-container text-on-secondary-container rounded-full md-label-large hover:bg-secondary transition-colors text-center cursor-pointer">
                      Import
                      <input
                        type="file"
                        accept=".json"
                        onChange={importSettings}
                        className="hidden"
                        ref={fileInputRef}
                      />
                    </label>
                  </div>
                </div>

                {/* Keyboard Shortcuts */}
                <div className="pt-4 border-t border-outline-variant">
                  <label className="md-label-large text-on-surface mb-3 block">
                    Keyboard Shortcuts
                  </label>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Take Snapshot</span>
                      <kbd className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-mono">
                        Space
                      </kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Record</span>
                      <kbd className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-mono">
                        R
                      </kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Fullscreen</span>
                      <kbd className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-mono">
                        F
                      </kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Mirror</span>
                      <kbd className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-mono">
                        M
                      </kbd>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Compare</span>
                      <kbd className="px-2 py-0.5 bg-surface-container rounded text-on-surface font-mono">
                        C
                      </kbd>
                    </div>
                  </div>
                </div>
              </div>
            </ControlSection>
          </>
        )}
      </div>
    </div>
  );
};

export default ControlsPanel;
