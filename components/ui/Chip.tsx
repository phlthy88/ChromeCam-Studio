import React from 'react';

interface ChipProps {
    label: string;
    selected?: boolean;
    onClick?: () => void;
    onDelete?: () => void;
    leadingIcon?: React.ReactNode;
    variant?: 'filter' | 'input' | 'suggestion' | 'assist';
    disabled?: boolean;
    elevated?: boolean;
}

/**
 * Material 3 Chip Component
 *
 * Follows M3 specification:
 * - Height: 32dp
 * - Shape: 8dp corner radius
 * - Horizontal padding: 16dp (12dp with leading icon)
 * - State layers with proper opacity
 * - Support for leading icon and trailing delete
 */
const Chip: React.FC<ChipProps> = ({
    label,
    selected = false,
    onClick,
    onDelete,
    leadingIcon,
    variant = 'filter',
    disabled = false,
    elevated = false
}) => {
    const isClickable = !!onClick && !disabled;

    // Base styles for all chip variants
    const baseClasses = `
        inline-flex items-center justify-center gap-2
        h-8 rounded-sm
        md-label-large select-none
        transition-all duration-short2 ease-standard
        ${elevated ? 'shadow-elevation-1' : ''}
        ${disabled ? 'opacity-[0.38] cursor-not-allowed' : ''}
    `;

    // Variant-specific styles
    const getVariantClasses = () => {
        switch (variant) {
            case 'filter':
                if (selected) {
                    return `
                        bg-secondary-container text-on-secondary-container
                        ${isClickable ? 'hover:shadow-elevation-1 active:shadow-elevation-0' : ''}
                    `;
                }
                return `
                    bg-surface border border-outline
                    text-on-surface-variant
                    ${isClickable ? 'hover:bg-on-surface/[0.08] active:bg-on-surface/[0.12]' : ''}
                `;

            case 'input':
                return `
                    bg-surface border border-outline
                    text-on-surface-variant
                    ${isClickable ? 'hover:bg-on-surface/[0.08]' : ''}
                `;

            case 'suggestion':
                return `
                    bg-surface border border-outline
                    text-on-surface-variant
                    ${isClickable ? 'hover:bg-on-surface/[0.08]' : ''}
                `;

            case 'assist':
                return `
                    bg-surface border border-outline
                    text-on-surface
                    ${isClickable ? 'hover:bg-on-surface/[0.08]' : ''}
                `;

            default:
                return '';
        }
    };

    // Padding based on content
    const getPaddingClasses = () => {
        if (leadingIcon && onDelete) {
            return 'pl-2 pr-2';
        } else if (leadingIcon) {
            return 'pl-2 pr-4';
        } else if (onDelete) {
            return 'pl-4 pr-2';
        }
        return 'px-4';
    };

    const handleClick = (e: React.MouseEvent) => {
        if (!disabled && onClick) {
            onClick();
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!disabled && onDelete) {
            onDelete();
        }
    };

    return (
        <button
            type="button"
            role={variant === 'filter' ? 'checkbox' : 'button'}
            aria-checked={variant === 'filter' ? selected : undefined}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={handleClick}
            className={`
                ${baseClasses}
                ${getVariantClasses()}
                ${getPaddingClasses()}
                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
            `}
        >
            {/* Leading Icon or Selected Checkmark */}
            {variant === 'filter' && selected && !leadingIcon && (
                <svg
                    className="w-[18px] h-[18px] text-on-secondary-container"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            )}

            {leadingIcon && (
                <span className="w-[18px] h-[18px] flex items-center justify-center">
                    {leadingIcon}
                </span>
            )}

            {/* Label */}
            <span className="truncate max-w-[200px]">{label}</span>

            {/* Trailing Delete Button */}
            {onDelete && (
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={disabled}
                    aria-label={`Remove ${label}`}
                    className={`
                        w-[18px] h-[18px] rounded-full
                        flex items-center justify-center
                        text-on-surface-variant
                        transition-colors duration-short2 ease-standard
                        ${!disabled ? 'hover:bg-on-surface/[0.08] hover:text-on-surface' : ''}
                        focus:outline-none
                    `}
                >
                    <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            )}
        </button>
    );
};

export default Chip;
