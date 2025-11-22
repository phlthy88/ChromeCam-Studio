
import React from 'react';

interface ToggleProps {
    label?: string;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    className?: string;
}

const Toggle: React.FC<ToggleProps> = ({ label, enabled, onChange, className = '' }) => {
    const button = (
        <button
            type="button"
            className={`
                group relative inline-flex h-8 w-[52px] flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900
                ${enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}
                ${className}
            `}
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            aria-labelledby={label ? `toggle-label-${label.replace(/\s+/g, '-')}` : undefined}
        >
            <span className="sr-only">Use setting</span>
            <span
                aria-hidden="true"
                className={`
                    pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    flex items-center justify-center
                    ${enabled ? 'translate-x-6 h-7 w-7' : 'translate-x-0.5'}
                `}
            >
                {/* Optional Checkmark for MD3 Expressive feel */}
                <svg 
                    className={`w-4 h-4 text-indigo-600 transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-0'}`} 
                    fill="currentColor" 
                    viewBox="0 0 12 12"
                >
                    <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" />
                </svg>
            </span>
        </button>
    );

    if (!label) {
        return button;
    }

    return (
        <div className="flex items-center justify-between cursor-pointer" onClick={() => onChange(!enabled)}>
            <span className="text-base font-medium text-slate-900 dark:text-slate-200" id={`toggle-label-${label.replace(/\s+/g, '-')}`}>{label}</span>
            {button}
        </div>
    );
};

export default Toggle;
