import React, { useState, useRef, useEffect } from 'react';

interface ControlSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    onReset?: () => void;
}

/**
 * Material 3 Expandable Card Component
 *
 * Follows M3 specification:
 * - Shape: 12dp corner radius (medium)
 * - Elevation: Level 1 (elevated card)
 * - Tonal surface color
 * - Smooth expansion animation with M3 easing
 * - State layer on header interaction
 */
const ControlSection: React.FC<ControlSectionProps> = ({
    title,
    children,
    defaultOpen = false,
    onReset
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Calculate content height for smooth animation
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [children, isOpen]);

    const toggleSection = () => {
        setIsOpen(!isOpen);
    };

    const handleReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onReset) {
            onReset();
        }
    };

    return (
        <div
            className={`
                bg-surface-container rounded-md overflow-hidden
                shadow-elevation-1 hover:shadow-elevation-2
                transition-shadow duration-short3 ease-standard
            `}
        >
            {/* Header - Interactive */}
            <button
                type="button"
                className={`
                    w-full flex justify-between items-center
                    px-4 py-4
                    text-left cursor-pointer
                    transition-colors duration-short2 ease-standard
                    hover:bg-on-surface/[0.08]
                    active:bg-on-surface/[0.12]
                    focus:outline-none focus-visible:bg-on-surface/[0.12]
                    group
                `}
                onClick={toggleSection}
                aria-expanded={isOpen}
                aria-controls={`section-content-${title.replace(/\s+/g, '-')}`}
            >
                <span className="md-title-medium text-on-surface select-none">
                    {title}
                </span>

                <div className="flex items-center gap-3">
                    {/* Reset Button (visible on hover when section is open) */}
                    {onReset && isOpen && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className={`
                                opacity-0 group-hover:opacity-100
                                md-label-medium text-primary
                                px-2 py-1 rounded-xs
                                hover:bg-primary/[0.08]
                                active:bg-primary/[0.12]
                                transition-all duration-short2 ease-standard
                                focus:outline-none focus-visible:bg-primary/[0.12]
                            `}
                            aria-label={`Reset ${title}`}
                        >
                            Reset
                        </button>
                    )}

                    {/* Expand/Collapse Icon */}
                    <span
                        className={`
                            text-on-surface-variant
                            transition-transform duration-medium2 ease-emphasized
                            ${isOpen ? 'rotate-180' : 'rotate-0'}
                        `}
                        aria-hidden="true"
                    >
                        <svg
                            className="w-6 h-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </span>
                </div>
            </button>

            {/* Content - Expandable */}
            <div
                id={`section-content-${title.replace(/\s+/g, '-')}`}
                className={`
                    overflow-hidden
                    transition-all duration-medium2 ease-emphasized
                `}
                style={{
                    maxHeight: isOpen ? (contentHeight ? `${contentHeight}px` : '1000px') : '0px',
                    opacity: isOpen ? 1 : 0,
                }}
                aria-hidden={!isOpen}
            >
                <div
                    ref={contentRef}
                    className="px-4 pb-5"
                >
                    {children}
                </div>
            </div>
        </div>
    );
};

export default ControlSection;
