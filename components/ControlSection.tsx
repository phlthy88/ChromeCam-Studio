import React, { useState, useRef, useEffect } from 'react';

interface ControlSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    onReset?: () => void;
}

/**
 * Material 3 Expandable Card Component
 * Refactored for larger border radius (Material You style)
 */
const ControlSection: React.FC<ControlSectionProps> = ({
    title,
    children,
    defaultOpen = false,
    onReset
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [_contentHeight, setContentHeight] = useState<number | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [children, isOpen]);

    const toggleSection = () => setIsOpen(!isOpen);

    const handleReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onReset) onReset();
    };

    return (
        <div
            className={`
                bg-surface-container rounded-xl
                shadow-elevation-1 hover:shadow-elevation-2
                transition-shadow duration-short3 ease-standard
                border border-outline-variant/15
                isolate
            `}
        >
            {/* Header - rounded top corners only */}
            <button
                type="button"
                className={`
                    w-full flex justify-between items-center
                    px-5 py-4
                    text-left cursor-pointer
                    transition-colors duration-short2 ease-standard
                    hover:bg-on-surface/[0.04]
                    active:bg-on-surface/[0.08]
                    focus:outline-none focus-visible:bg-on-surface/[0.08]
                    group
                    rounded-xl
                `}
                onClick={toggleSection}
                aria-expanded={isOpen}
            >
                <span className="md-title-medium text-on-surface select-none">
                    {title}
                </span>

                <div className="flex items-center gap-3">
                    {onReset && isOpen && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className={`
                                opacity-0 group-hover:opacity-100
                                md-label-medium text-primary
                                px-3 py-1.5 rounded-full
                                hover:bg-primary/[0.06]
                                active:bg-primary/[0.1]
                                transition-all duration-short2 ease-standard
                            `}
                        >
                            Reset
                        </button>
                    )}
                    <span
                        className={`
                            text-on-surface-variant
                            transition-transform duration-medium2 ease-emphasized
                            ${isOpen ? 'rotate-180' : 'rotate-0'}
                        `}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </span>
                </div>
            </button>

            {/* Content - uses grid for smooth animation without overflow issues */}
            <div
                className="grid transition-all duration-medium2 ease-emphasized"
                style={{
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    opacity: isOpen ? 1 : 0,
                }}
            >
                <div className="overflow-hidden">
                    <div ref={contentRef} className="px-5 pb-5 pt-1">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ControlSection;
