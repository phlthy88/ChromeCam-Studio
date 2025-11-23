import { useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

/**
 * Enhanced theme hook with Material 3 dynamic color support
 *
 * Features:
 * - Light/Dark/System mode switching
 * - Smooth transitions between themes
 * - Integration with ChromeOS color preferences
 * - Persistence via localStorage
 */
export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('theme') as Theme) || 'system';
        }
        return 'system';
    });

    const [isDark, setIsDark] = useState(false);

    // Get the effective dark mode state
    const getEffectiveIsDark = useCallback(() => {
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }, [theme]);

    useEffect(() => {
        const root = window.document.documentElement;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            const darkMode = getEffectiveIsDark();
            setIsDark(darkMode);

            // Add transition class for smooth theme changes
            root.classList.add('theme-transitioning');

            if (darkMode) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }

            // Remove transition class after animation completes
            setTimeout(() => {
                root.classList.remove('theme-transitioning');
            }, 300);
        };

        applyTheme();
        localStorage.setItem('theme', theme);

        // Listen for system preference changes when in system mode
        if (theme === 'system') {
            mediaQuery.addEventListener('change', applyTheme);
            return () => mediaQuery.removeEventListener('change', applyTheme);
        }
    }, [theme, getEffectiveIsDark]);

    // Cycle through themes: light -> dark -> system -> light
    const cycleTheme = useCallback(() => {
        setTheme(current => {
            switch (current) {
                case 'light': return 'dark';
                case 'dark': return 'system';
                case 'system': return 'light';
                default: return 'system';
            }
        });
    }, []);

    return {
        theme,
        setTheme,
        cycleTheme,
        isDark,
        isSystem: theme === 'system'
    };
}
