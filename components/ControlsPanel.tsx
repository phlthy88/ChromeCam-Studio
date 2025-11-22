
import React, { useState, useEffect } from 'react';
import ControlSection from './ControlSection';
import Slider from './ui/Slider';
import Toggle from './ui/Toggle';
import Chip from './ui/Chip';
import { CameraSettings, DEFAULT_SETTINGS } from './settings';

interface ControlsPanelProps {
    settings: CameraSettings;
    onSettingsChange: (settings: CameraSettings) => void;
    onCloseMobile?: () => void;
    capabilities?: MediaTrackCapabilities | null;
}

interface Preset {
    id: string;
    name: string;
    type: 'user' | 'system';
    settings: CameraSettings;
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
    autoFrame: false,
    denoise: false,
    virtualBackground: false,
    virtualBackgroundImage: null,
};

const DEFAULTS_CONFERENCING = {
    enableAudio: false,
    noiseSuppression: true,
    bandwidthSaver: false,
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

const SYSTEM_PRESETS: Preset[] = [
    {
        id: 'sys_conference',
        name: 'Conference',
        type: 'system',
        settings: {
            ...DEFAULT_SETTINGS,
            brightness: 110,
            saturation: 105,
            faceSmoothing: 30,
            denoise: true,
            enableAudio: true,
            noiseSuppression: true,
            activeFilter: 'prime'
        }
    },
    {
        id: 'sys_privacy',
        name: 'Privacy',
        type: 'system',
        settings: {
            ...DEFAULT_SETTINGS,
            blur: 20, // Max blur for privacy
            denoise: true,
            enableAudio: false
        }
    },
    {
        id: 'sys_portrait',
        name: 'Portrait',
        type: 'system',
        settings: {
            ...DEFAULT_SETTINGS,
            portraitLighting: 30, // Subtle lighting
            contrast: 105,
            faceSmoothing: 50, // Smooth skin
            blur: 8, // Natural bokeh
            activeFilter: 'none' // Keep natural colors
        }
    },
    {
        id: 'sys_lowlight',
        name: 'Low Light',
        type: 'system',
        settings: {
            ...DEFAULT_SETTINGS,
            brightness: 120,
            contrast: 110,
            autoLowLight: true,
            denoise: true
        }
    }
];

const ControlsPanel: React.FC<ControlsPanelProps> = ({ settings, onSettingsChange, onCloseMobile, capabilities }) => {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [newPresetName, setNewPresetName] = useState('');
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [resetConfirm, setResetConfirm] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('cam_presets');
        let userPresets: Preset[] = [];
        if (saved) {
            try {
                userPresets = JSON.parse(saved);
            } catch (e) {
                console.error(e);
            }
        }
        setPresets([...SYSTEM_PRESETS, ...userPresets]);
    }, []);

    const savePreset = () => {
        if (!newPresetName.trim()) return;
        const newPreset: Preset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            type: 'user',
            settings: { ...settings }
        };
        
        const currentSystem = presets.filter(p => p.type === 'system');
        const currentUser = presets.filter(p => p.type === 'user');
        const updatedUser = [newPreset, ...currentUser];
        
        setPresets([...currentSystem, ...updatedUser]);
        localStorage.setItem('cam_presets', JSON.stringify(updatedUser));
        setNewPresetName('');
        setActivePresetId(newPreset.id);
    };

    const loadPreset = (p: Preset) => {
        setActivePresetId(p.id);
        onSettingsChange({ ...p.settings });
    };

    const applyDefaults = () => {
        setActivePresetId(null);
        onSettingsChange({ ...DEFAULT_SETTINGS });
    };

    const deletePreset = (id: string) => {
        const currentSystem = presets.filter(p => p.type === 'system');
        const currentUser = presets.filter(p => p.type === 'user').filter(p => p.id !== id);
        
        setPresets([...currentSystem, ...currentUser]);
        localStorage.setItem('cam_presets', JSON.stringify(currentUser));
        
        if (activePresetId === id) {
            setActivePresetId(null);
        }
    };

    const update = (key: keyof CameraSettings, value: number | boolean | string | null) => {
        setActivePresetId(null);
        // @ts-ignore
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

    // --- Module Reset Handlers ---
    const resetLight = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_LIGHT });
    };
    const resetColor = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_COLOR });
    };
    const resetFilters = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_FILTER });
    };
    const resetGeometry = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_GEOMETRY });
    };
    const resetEffects = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_EFFECTS });
    };
    const resetConferencing = () => {
        setActivePresetId(null);
        onSettingsChange({ ...settings, ...DEFAULTS_CONFERENCING });
    };
    
    const handleMasterReset = () => {
        if (resetConfirm) {
            applyDefaults();
            setResetConfirm(false);
        } else {
            setResetConfirm(true);
            setTimeout(() => setResetConfirm(false), 3000);
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface overflow-x-hidden relative">

            {/* Mobile Drag Handle */}
            <div className="lg:hidden flex justify-center pt-3 pb-1 cursor-pointer" onClick={onCloseMobile}>
                <div className="w-8 h-1 rounded-full bg-outline-variant" />
            </div>

            {/* Presets & Global Actions */}
            <div className="p-4 pb-2 space-y-4 shrink-0">
                <div className="flex justify-between items-center">
                    <h2 className="md-title-large text-on-surface">Settings</h2>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleMasterReset}
                            className={`
                                md-label-large transition-colors duration-short2 ease-standard
                                ${resetConfirm
                                    ? 'text-error'
                                    : 'text-on-surface-variant hover:text-on-surface'
                                }
                            `}
                        >
                            {resetConfirm ? 'Confirm Reset' : 'Reset All'}
                        </button>

                        {/* Mobile Close Button */}
                        <button
                            onClick={onCloseMobile}
                            className="lg:hidden p-2 -mr-2 rounded-full hover:bg-on-surface/[0.08] text-on-surface-variant transition-colors duration-short2 ease-standard"
                            aria-label="Close settings"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Preset Chips - M3 Filter Chips */}
                <div className="flex gap-2 overflow-x-auto pb-2 md-scrollbar snap-x -mx-2 px-2">
                    {presets.map(preset => (
                        <Chip
                            key={preset.id}
                            label={preset.name}
                            selected={activePresetId === preset.id}
                            onClick={() => activePresetId === preset.id ? applyDefaults() : loadPreset(preset)}
                            onDelete={preset.type === 'user' ? () => deletePreset(preset.id) : undefined}
                            variant="filter"
                        />
                    ))}
                </div>

                {/* Save Preset Field - M3 Text Field style */}
                <div className="relative flex gap-2">
                    <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                        placeholder="Name preset..."
                        className="
                            min-w-0 flex-1 px-4 py-3
                            md-body-large text-on-surface
                            bg-surface-container-high rounded-md
                            border border-outline-variant
                            placeholder:text-on-surface-variant
                            focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary
                            transition-colors duration-short2 ease-standard
                        "
                    />
                    <button
                        onClick={savePreset}
                        disabled={!newPresetName.trim()}
                        className="
                            shrink-0 px-5 py-2.5
                            bg-primary text-on-primary
                            md-label-large rounded-full
                            shadow-elevation-1 hover:shadow-elevation-2
                            disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:shadow-none
                            transition-all duration-short2 ease-standard
                        "
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* Controls Scroll Area */}
            <div className="flex-1 overflow-y-auto md-scrollbar px-4 pb-8 space-y-4">

                {/* Conferencing */}
                <ControlSection title="Conferencing" defaultOpen={true} onReset={resetConferencing}>
                    <div className="space-y-5">
                        <Toggle
                            label="Enable Microphone"
                            enabled={settings.enableAudio}
                            onChange={(v) => update('enableAudio', v)}
                        />

                        <div className={`transition-opacity duration-medium2 ease-standard ${settings.enableAudio ? 'opacity-100' : 'opacity-[0.38] pointer-events-none'}`}>
                            <Toggle
                                label="Voice Isolation (AI)"
                                enabled={settings.noiseSuppression}
                                onChange={(v) => update('noiseSuppression', v)}
                            />
                            <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                                Uses AI to filter background noise like typing or fans.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-outline-variant">
                            <Toggle
                                label="Bandwidth Saver"
                                enabled={settings.bandwidthSaver}
                                onChange={(v) => update('bandwidthSaver', v)}
                            />
                            <p className="md-body-small text-on-surface-variant mt-2 ml-1">
                                Reduces resolution to 480p/24fps to prioritize connection stability.
                            </p>
                        </div>
                    </div>
                </ControlSection>

                {/* Lighting */}
                <ControlSection title="Lighting" onReset={resetLight}>
                    <div className="space-y-5">
                        <Slider
                            label="Brightness"
                            value={settings.brightness}
                            min={0} max={200}
                            onChange={(v) => update('brightness', v)}
                        />
                        <Slider
                            label="Contrast"
                            value={settings.contrast}
                            min={0} max={200}
                            onChange={(v) => update('contrast', v)}
                        />
                        <Toggle
                            label="Auto Low Light Boost"
                            enabled={settings.autoLowLight}
                            onChange={(v) => update('autoLowLight', v)}
                        />

                        {/* Hardware Exposure Controls */}
                        {/* @ts-ignore */}
                        {capabilities && capabilities.exposureMode && (
                            <div className="pt-4 border-t border-outline-variant">
                                <label className="md-label-large text-on-surface mb-3 block">Exposure Mode</label>
                                <div className="flex gap-2 mb-5">
                                    {['continuous', 'manual'].map(mode => (
                                        // @ts-ignore
                                        (capabilities.exposureMode.includes(mode)) && (
                                            <Chip
                                                key={mode}
                                                label={mode === 'continuous' ? 'Auto' : 'Manual'}
                                                selected={settings.exposureMode === mode}
                                                onClick={() => update('exposureMode', mode)}
                                                variant="filter"
                                            />
                                        )
                                    ))}
                                </div>

                                {settings.exposureMode === 'manual' &&
                                 // @ts-ignore
                                 capabilities.exposureTime && (
                                    <div className="mb-4">
                                        <Slider
                                            label="Exposure Time"
                                            // @ts-ignore
                                            value={settings.exposureTime || capabilities.exposureTime.min}
                                            // @ts-ignore
                                            min={capabilities.exposureTime.min}
                                            // @ts-ignore
                                            max={capabilities.exposureTime.max}
                                            // @ts-ignore
                                            step={capabilities.exposureTime.step}
                                            onChange={(v) => update('exposureTime', v)}
                                        />
                                    </div>
                                )}

                                {/* @ts-ignore */}
                                {capabilities.exposureCompensation && (
                                    <Slider
                                        label="Exposure Comp."
                                        value={settings.exposureCompensation}
                                        // @ts-ignore
                                        min={capabilities.exposureCompensation.min}
                                        // @ts-ignore
                                        max={capabilities.exposureCompensation.max}
                                        // @ts-ignore
                                        step={capabilities.exposureCompensation.step}
                                        onChange={(v) => update('exposureCompensation', v)}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </ControlSection>

                {/* Color Filters */}
                <ControlSection title="Color Filters" onReset={resetFilters}>
                    <div className="flex gap-3 overflow-x-auto pb-2 md-scrollbar snap-x -mx-1 px-1">
                        {AVAILABLE_FILTERS.map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => update('activeFilter', filter.id)}
                                className="flex-shrink-0 snap-start flex flex-col items-center gap-2 group"
                            >
                                <div className={`
                                    w-14 h-14 rounded-full shadow-elevation-1
                                    transition-all duration-short3 ease-emphasized
                                    ${filter.color}
                                    ${settings.activeFilter === filter.id
                                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container scale-110'
                                        : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'
                                    }
                                `} />
                                <span className={`
                                    md-label-small transition-colors duration-short2 ease-standard
                                    ${settings.activeFilter === filter.id
                                        ? 'text-primary'
                                        : 'text-on-surface-variant'
                                    }
                                `}>
                                    {filter.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </ControlSection>

                {/* Color Adjustments */}
                <ControlSection title="Color Adjustments" onReset={resetColor}>
                    <div className="space-y-5">
                        <Slider
                            label="Saturation"
                            value={settings.saturation}
                            min={0} max={200}
                            onChange={(v) => update('saturation', v)}
                        />
                        <Slider
                            label="Hue"
                            value={settings.hue}
                            min={0} max={360}
                            onChange={(v) => update('hue', v)}
                        />
                        <Slider
                            label="Sepia"
                            value={settings.sepia}
                            min={0} max={100}
                            onChange={(v) => update('sepia', v)}
                        />
                        <Slider
                            label="Grayscale"
                            value={settings.grayscale}
                            min={0} max={100}
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
                            min={1} max={3} step={0.1}
                            onChange={(v) => update('zoom', v)}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <Slider
                                label="Pan X"
                                value={settings.panX}
                                min={-50} max={50}
                                onChange={(v) => update('panX', v)}
                            />
                            <Slider
                                label="Pan Y"
                                value={settings.panY}
                                min={-50} max={50}
                                onChange={(v) => update('panY', v)}
                            />
                        </div>
                        <Slider
                            label="Rotation"
                            value={settings.rotation}
                            min={-180} max={180}
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
                            <svg className="w-5 h-5 shrink-0 mt-0.5 text-on-tertiary-container" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
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
                            min={0} max={20}
                            onChange={(v) => update('blur', v)}
                        />
                        <Slider
                            label="Portrait Lighting"
                            value={settings.portraitLighting}
                            min={0} max={100}
                            onChange={(v) => update('portraitLighting', v)}
                        />
                        <Slider
                            label="Face Smoothing"
                            value={settings.faceSmoothing}
                            min={0} max={100}
                            onChange={(v) => update('faceSmoothing', v)}
                        />
                    </div>
                </ControlSection>

                {/* Tools & Utilities */}
                <ControlSection title="Tools">
                    <div className="space-y-3">
                        <Toggle
                            label="QR Code Scanner"
                            enabled={settings.qrMode}
                            onChange={(v) => update('qrMode', v)}
                        />
                        <p className="md-body-small text-on-surface-variant ml-1">
                            Detects QR codes and barcodes using native browser APIs.
                        </p>
                    </div>
                </ControlSection>

            </div>
        </div>
    );
};

export default ControlsPanel;
