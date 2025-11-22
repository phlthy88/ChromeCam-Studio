
import React, { useState, useEffect } from 'react';
import ControlSection from './ControlSection';
import Slider from './ui/Slider';
import Toggle from './ui/Toggle';
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
        <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900 overflow-x-hidden relative">
            
            {/* Mobile Drag Handle */}
            <div className="lg:hidden flex justify-center pt-3 pb-1 cursor-pointer" onClick={onCloseMobile}>
                <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></div>
            </div>

            {/* Presets & Global Actions */}
            <div className="p-4 pb-2 space-y-4 shrink-0">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-normal text-slate-800 dark:text-slate-200">Settings</h2>
                    
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={handleMasterReset}
                            className={`text-sm font-medium transition-colors ${
                                resetConfirm 
                                ? 'text-red-600 dark:text-red-400' 
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            {resetConfirm ? 'Click again to confirm' : 'Reset All'}
                        </button>
                        
                        {/* Mobile Close Button */}
                        <button 
                            onClick={onCloseMobile}
                            className="lg:hidden p-2 -mr-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Preset Chips */}
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x -mx-2 px-2">
                    {presets.map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => activePresetId === preset.id ? applyDefaults() : loadPreset(preset)}
                            className={`
                                flex-shrink-0 snap-start px-4 py-2 rounded-xl text-sm font-medium transition-all border
                                flex items-center gap-2 group relative
                                ${activePresetId === preset.id 
                                    ? 'bg-indigo-200 border-indigo-200 text-indigo-900 dark:bg-indigo-700 dark:border-indigo-700 dark:text-indigo-100' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-750'}
                            `}
                        >
                            {/* Toggle Switch Look for Chips */}
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${activePresetId === preset.id ? 'bg-indigo-500 dark:bg-indigo-300' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${activePresetId === preset.id ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            
                            {preset.name}
                            
                            {preset.type === 'user' && (
                                <span 
                                    onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                                    className="ml-1 opacity-40 hover:opacity-100 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/20"
                                >
                                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Save Preset Field */}
                <div className="relative group flex gap-2">
                    <input 
                        type="text" 
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Name preset..."
                        className="min-w-0 flex-1 px-4 py-3 text-sm rounded-xl bg-slate-200 dark:bg-slate-800 border-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 transition-all peer"
                    />
                    <button 
                        onClick={savePreset}
                        disabled={!newPresetName.trim()}
                        className="shrink-0 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm"
                    >
                        Save
                    </button>
                </div>
            </div>

            {/* Controls Scroll Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-8 space-y-5">
                
                {/* Conferencing */}
                <ControlSection title="Conferencing" defaultOpen={true} onReset={resetConferencing}>
                     <div className="p-2 space-y-5">
                        <Toggle 
                            label="Enable Microphone" 
                            enabled={settings.enableAudio} 
                            onChange={(v) => update('enableAudio', v)} 
                        />
                        
                        <div className={`transition-opacity duration-300 ${settings.enableAudio ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <Toggle 
                                label="Voice Isolation (AI)" 
                                enabled={settings.noiseSuppression} 
                                onChange={(v) => update('noiseSuppression', v)} 
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-1">
                                Uses AI to filter background noise like typing or fans.
                            </p>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                            <Toggle 
                                label="Bandwidth Saver" 
                                enabled={settings.bandwidthSaver} 
                                onChange={(v) => update('bandwidthSaver', v)} 
                            />
                             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-1">
                                Reduces resolution to 480p/24fps to prioritize connection stability.
                            </p>
                        </div>
                    </div>
                </ControlSection>

                {/* Lighting */}
                <ControlSection title="Lighting" onReset={resetLight}>
                    <div className="p-2 space-y-5">
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
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 mt-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 block">Exposure Mode</label>
                                <div className="flex gap-2 mb-5">
                                    {['continuous', 'manual'].map(mode => (
                                        // @ts-ignore
                                        (capabilities.exposureMode.includes(mode)) && (
                                            <button
                                                key={mode}
                                                onClick={() => update('exposureMode', mode)}
                                                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors ${
                                                    settings.exposureMode === mode 
                                                    ? 'bg-indigo-600 text-white border-indigo-600' 
                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-750'
                                                }`}
                                            >
                                                {mode === 'continuous' ? 'Auto' : 'Manual'}
                                            </button>
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
                    <div className="p-2">
                         <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                            {AVAILABLE_FILTERS.map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => update('activeFilter', filter.id)}
                                    className={`
                                        flex-shrink-0 snap-start
                                        flex flex-col items-center gap-2
                                        group
                                    `}
                                >
                                    <div className={`
                                        w-14 h-14 rounded-full border-2 shadow-sm transition-all
                                        ${filter.color}
                                        ${settings.activeFilter === filter.id 
                                            ? 'border-indigo-500 scale-110 ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-800' 
                                            : 'border-transparent opacity-80 group-hover:opacity-100 group-hover:scale-105'}
                                    `}></div>
                                    <span className={`text-xs font-medium ${settings.activeFilter === filter.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                        {filter.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </ControlSection>

                {/* Color Adjustments */}
                <ControlSection title="Color Adjustments" onReset={resetColor}>
                    <div className="p-2 space-y-5">
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
                    <div className="p-2 space-y-5">
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
                    <div className="p-2 space-y-5">
                         <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl text-sm text-indigo-800 dark:text-indigo-200 mb-4 flex items-start gap-3">
                            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p>AI features run locally on your device. No video data is sent to the cloud.</p>
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

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                            <Toggle 
                                label="Virtual Background" 
                                enabled={settings.virtualBackground} 
                                onChange={(v) => update('virtualBackground', v)} 
                            />
                            {settings.virtualBackground && (
                                <div className="mt-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Select Image
                                    </label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="block w-full text-sm text-slate-500
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-indigo-50 file:text-indigo-700
                                        hover:file:bg-indigo-100
                                        dark:file:bg-slate-700 dark:file:text-slate-200
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
                    <div className="p-2 space-y-5">
                        <Toggle 
                            label="QR Code Scanner" 
                            enabled={settings.qrMode} 
                            onChange={(v) => update('qrMode', v)} 
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                            Detects QR and Barcodes natively on ChromeOS.
                        </p>
                    </div>
                </ControlSection>

            </div>
        </div>
    );
};

export default ControlsPanel;
