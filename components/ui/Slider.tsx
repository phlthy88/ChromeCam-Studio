import React, { useEffect, useState, useRef } from 'react';

interface SliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    showValue?: boolean;
}

/**
 * Material 3 Slider Component
 *
 * Follows M3 specification:
 * - Track: 4dp height (inactive), active track fills from start
 * - Handle: 20dp with state layer (40dp touch target)
 * - Value input for precise control
 * - M3 color tokens and motion
 */
const Slider: React.FC<SliderProps> = ({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    showValue = true
}) => {
    const [inputValue, setInputValue] = useState(value.toString());
    const [isDragging, setIsDragging] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);

    // Sync internal input state with prop value changes
    useEffect(() => {
        setInputValue((Math.round(value * 100) / 100).toString());
    }, [value]);

    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val >= min && val <= max) {
            onChange(val);
        }
    };

    const handleBlur = () => {
        // On blur, force the input to display the clamped, valid current value
        setInputValue((Math.round(value * 100) / 100).toString());
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(parseFloat(e.target.value));
    };

    const formatDisplayValue = (val: number) => {
        if (step < 1) {
            return val.toFixed(1);
        }
        return Math.round(val).toString();
    };

    return (
        <div className={`flex flex-col gap-2 ${disabled ? 'opacity-[0.38]' : ''}`}>
            {/* Label and Value Row */}
            <div className="flex justify-between items-center">
                <label className="md-label-large text-on-surface-variant">
                    {label}
                </label>
                {showValue && (
                    <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleBlur}
                        disabled={disabled}
                        className={`
                            w-16 px-2 py-1
                            bg-surface-container rounded-sm
                            text-on-surface md-label-large text-center
                            border border-outline-variant
                            focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary
                            transition-colors duration-short2 ease-standard
                            appearance-none
                            [&::-webkit-inner-spin-button]:appearance-none
                            [&::-webkit-outer-spin-button]:appearance-none
                            disabled:cursor-not-allowed
                        `}
                    />
                )}
            </div>

            {/* Slider Track */}
            <div
                ref={sliderRef}
                className="relative h-10 flex items-center touch-none"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => !isDragging && setShowTooltip(false)}
            >
                {/* Inactive Track */}
                <div className="absolute w-full h-1 rounded-full bg-surface-container-highest" />

                {/* Active Track */}
                <div
                    className="absolute h-1.5 rounded-full bg-primary transition-[width] duration-75 ease-standard"
                    style={{ width: `${percentage}%` }}
                />

                {/* Stop Indicators (for discrete sliders) */}
                {step >= 10 && max - min <= 100 && (
                    <div className="absolute w-full flex justify-between px-[10px]">
                        {Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => (
                            <div
                                key={i}
                                className={`w-1 h-1 rounded-full transition-colors duration-short2 ${
                                    (min + i * step) <= value
                                        ? 'bg-on-primary'
                                        : 'bg-on-surface-variant'
                                }`}
                            />
                        ))}
                    </div>
                )}

                {/* Handle Container (state layer + visual handle) */}
                <div
                    className="absolute h-10 w-10 -ml-5 flex items-center justify-center z-10"
                    style={{ left: `${percentage}%` }}
                >
                    {/* State Layer */}
                    <div
                        className={`
                            absolute w-10 h-10 rounded-full
                            transition-all duration-short2 ease-standard
                            ${isDragging
                                ? 'bg-primary/[0.12] scale-100'
                                : showTooltip
                                    ? 'bg-primary/[0.08] scale-100'
                                    : 'scale-0'
                            }
                        `}
                    />

                    {/* Visual Handle */}
                    <div
                        className={`
                            relative z-10
                            h-5 w-5 rounded-full
                            bg-primary shadow-elevation-1
                            transition-transform duration-short2 ease-spring
                            ${isDragging ? 'scale-110' : 'scale-100'}
                        `}
                    />

                    {/* Value Tooltip */}
                    <div
                        className={`
                            absolute -top-10 left-1/2 -translate-x-1/2
                            px-2 py-1 rounded-sm
                            bg-inverse-surface text-inverse-on-surface
                            md-label-medium whitespace-nowrap
                            shadow-elevation-2
                            transition-all duration-short3 ease-emphasized-decelerate
                            ${showTooltip || isDragging
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 translate-y-2 pointer-events-none'
                            }
                        `}
                    >
                        {formatDisplayValue(value)}
                    </div>
                </div>

                {/* HTML Range Input (Invisible, handles interaction) */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={disabled}
                    onChange={handleSliderChange}
                    onMouseDown={() => setIsDragging(true)}
                    onMouseUp={() => setIsDragging(false)}
                    onTouchStart={() => setIsDragging(true)}
                    onTouchEnd={() => setIsDragging(false)}
                    onFocus={() => setShowTooltip(true)}
                    onBlur={() => { setShowTooltip(false); setIsDragging(false); }}
                    aria-label={label}
                    aria-valuenow={value}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    className={`
                        absolute w-full h-full opacity-0 cursor-pointer z-20
                        disabled:cursor-not-allowed
                    `}
                />
            </div>
        </div>
    );
};

export default Slider;
