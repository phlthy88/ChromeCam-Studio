
import React, { useState } from 'react';
import ChevronDownIcon from './icons/ChevronDownIcon';
import ChevronUpIcon from './icons/ChevronUpIcon';

interface ControlSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    onReset?: () => void;
}

const ControlSection: React.FC<ControlSectionProps> = ({ title, children, defaultOpen = false, onReset }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">
            <div
                className="w-full flex justify-between items-center p-5 text-left cursor-pointer group"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <span className="text-lg font-normal text-slate-900 dark:text-slate-100 select-none">{title}</span>
                
                <div className="flex items-center gap-4">
                    {/* Module Reset Button */}
                    {onReset && isOpen && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReset();
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1"
                            title={`Reset ${title}`}
                        >
                            Reset
                        </button>
                    )}
                    
                    <span className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDownIcon />
                    </span>
                </div>
            </div>
            <div 
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="p-5 pt-0">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default ControlSection;
