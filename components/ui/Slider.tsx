
import React, { useEffect, useState } from 'react';

interface SliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}

const Slider: React.FC<SliderProps> = ({ label, value, onChange, min = 0, max = 100, step = 1 }) => {
    const [inputValue, setInputValue] = useState(value.toString());

    // Sync internal input state with prop value changes
    useEffect(() => {
        setInputValue((Math.round(value * 100) / 100).toString());
    }, [value]);

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
            // Allow typing freely, but clamp when committing? 
            // Actually for live feedback, clamp immediately but allow intermediate states like "1." 
            // For simplicity in this snippet, we pass valid parsed numbers to parent immediately if within range
            if (val >= min && val <= max) {
                onChange(val);
            }
        }
    };

    const handleBlur = () => {
        // On blur, force the input to display the clamped, valid current value
        setInputValue((Math.round(value * 100) / 100).toString());
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    className="
                        w-16 px-2 py-0.5 
                        bg-slate-100 dark:bg-slate-700 
                        rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 text-center 
                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800
                        appearance-none
                        [&::-webkit-inner-spin-button]:appearance-none
                    "
                />
            </div>
            
            <div className="relative h-8 flex items-center group touch-none">
                {/* Inactive Track */}
                <div className="absolute w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                
                {/* Active Track */}
                <div 
                    className="absolute h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-75"
                    style={{ width: `${percentage}%` }}
                ></div>

                {/* Handle Container (for click target size) */}
                <div 
                    className="absolute h-8 w-8 -ml-4 flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
                    style={{ left: `${percentage}%` }}
                >
                    {/* Visual Handle */}
                    <div className="h-5 w-5 rounded-full bg-indigo-600 dark:bg-indigo-500 shadow-sm ring-2 ring-white dark:ring-slate-900 group-hover:scale-110 transition-transform"></div>
                </div>

                {/* HTML Range Input (Invisible, handles interaction) */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                    aria-label={label}
                />
            </div>
        </div>
    );
};

export default Slider;
