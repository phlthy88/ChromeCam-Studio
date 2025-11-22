import React from 'react';

interface ToggleProps {
    label?: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    className?: string;
    disabled?: boolean;
}

/**
 * Material 3 Switch Component
 *
 * Follows M3 specification:
 * - Track: 52×32dp
 * - Handle: 24dp (selected), 16dp (unselected), 28dp (pressed)
 * - State layers with proper opacity
 * - Icon in thumb when selected
 */
const Toggle: React.FC<ToggleProps> = ({
    label,
    enabled,
    onChange,
    className = '',
    disabled = false
}) => {
    const handleClick = () => {
        if (!disabled) {
            onChange(!enabled);
        }
    };

    const switchButton = (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-disabled={disabled}
            aria-labelledby={label ? `switch-label-${label.replace(/\s+/g, '-')}` : undefined}
            disabled={disabled}
            onClick={handleClick}
            className={`
                group/switch relative inline-flex items-center justify-start
                w-[52px] h-8 flex-shrink-0 cursor-pointer
                rounded-full border-2
                transition-colors duration-short4 ease-standard
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2

                ${enabled
                    ? 'bg-primary border-primary'
                    : 'bg-surface-variant border-outline'
                }
                ${disabled
                    ? 'opacity-[0.38] cursor-not-allowed'
                    : ''
                }
                ${className}
            `}
        >
            <span className="sr-only">{enabled ? 'Enabled' : 'Disabled'}</span>

            {/* State Layer (hover/press indicator) */}
            <span
                className={`
                    absolute rounded-full
                    w-10 h-10 -left-1
                    transition-all duration-short2 ease-standard
                    ${enabled ? 'translate-x-5' : 'translate-x-0'}
                    ${!disabled ? 'group-hover/switch:bg-on-surface/[0.08] group-active/switch:bg-on-surface/[0.12]' : ''}
                `}
                aria-hidden="true"
            />

            {/* Handle/Thumb */}
            <span
                aria-hidden="true"
                className={`
                    relative z-10 flex items-center justify-center
                    rounded-full shadow-elevation-1
                    transition-all duration-short4 ease-standard
                    group-active/switch:scale-110

                    ${enabled
                        ? 'w-6 h-6 translate-x-[22px] bg-on-primary'
                        : 'w-4 h-4 translate-x-[6px] bg-outline'
                    }
                `}
            >
                {/* Icon (checkmark when enabled) */}
                <svg
                    className={`
                        transition-all duration-short3 ease-standard
                        ${enabled
                            ? 'w-4 h-4 opacity-100 scale-100 text-primary'
                            : 'w-0 h-0 opacity-0 scale-0'
                        }
                    `}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        </button>
    );

    if (!label) {
        return switchButton;
    }

    return (
        <div
            className={`
                flex items-center justify-between gap-4
                cursor-pointer select-none
                ${disabled ? 'cursor-not-allowed' : ''}
            `}
            onClick={handleClick}
        >
            <span
                id={`switch-label-${label.replace(/\s+/g, '-')}`}
                className={`
                    md-body-large text-on-surface
                    ${disabled ? 'opacity-[0.38]' : ''}
                `}
            >
                {label}
            </span>
            {switchButton}
        </div>
    );
};

export default Toggle;
