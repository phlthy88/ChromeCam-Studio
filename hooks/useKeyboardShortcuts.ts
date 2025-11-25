import { useCallback, useEffect, useState } from 'react';

export type ShortcutAction =
  | 'toggleRecording'
  | 'takeSnapshot'
  | 'toggleVirtualCamera'
  | 'toggleMute'
  | 'toggleFullscreen'
  | 'toggleHistogram'
  | 'toggleZebras'
  | 'cycleGrid'
  | 'loadPreset'
  | 'stopAll'
  | 'toggleAI'
  | 'resetSettings';

export type ShortcutMap = Record<string, ShortcutAction | ShortcutAction[]>;

const STORAGE_KEY = 'chromecam-shortcuts';

const defaultShortcuts: ShortcutMap = {
  ' ': 'toggleRecording',
  R: 'takeSnapshot',
  V: 'toggleVirtualCamera',
  M: 'toggleMute',
  F: 'toggleFullscreen',
  H: 'toggleHistogram',
  Z: 'toggleZebras',
  G: 'cycleGrid',
  '1': 'loadPreset',
  '2': 'loadPreset',
  '3': 'loadPreset',
  '4': 'loadPreset',
  '5': 'loadPreset',
  '6': 'loadPreset',
  '7': 'loadPreset',
  '8': 'loadPreset',
  '9': 'loadPreset',
  '0': 'loadPreset',
  ESCAPE: 'stopAll',
  A: 'toggleAI',
  'CTRL+R': 'resetSettings',
};

export const useKeyboardShortcuts = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(defaultShortcuts);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // Load custom shortcuts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const customShortcuts = JSON.parse(stored);
        setShortcuts({ ...defaultShortcuts, ...customShortcuts });
      }
    } catch (error) {
      console.error('Failed to load shortcuts:', error);
    }
  }, []);

  // Save shortcuts to localStorage
  const saveShortcuts = useCallback((newShortcuts: ShortcutMap) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newShortcuts));
      setShortcuts(newShortcuts);
    } catch (error) {
      console.error('Failed to save shortcuts:', error);
    }
  }, []);

  // Update a specific shortcut
  const updateShortcut = useCallback(
    (key: string, action: ShortcutAction | ShortcutAction[]) => {
      const newShortcuts = { ...shortcuts, [key]: action };
      saveShortcuts(newShortcuts);
    },
    [shortcuts, saveShortcuts]
  );

  // Reset to defaults
  const resetShortcuts = useCallback(() => {
    saveShortcuts(defaultShortcuts);
  }, [saveShortcuts]);

  // Get action for a key combination
  const getActionForKey = useCallback(
    (key: string): ShortcutAction | ShortcutAction[] | null => {
      return shortcuts[key] || null;
    },
    [shortcuts]
  );

  // New function to get action for a keyboard event
  const getActionForEvent = useCallback(
    (event: KeyboardEvent): { action: ShortcutAction | ShortcutAction[] | null; key: string } => {
      const keyParts: string[] = [];
      if (event.ctrlKey) keyParts.push('Ctrl');
      if (event.altKey) keyParts.push('Alt');
      if (event.shiftKey) keyParts.push('Shift');
      if (event.metaKey) keyParts.push('Meta');

      // Avoid adding modifiers as the main key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        keyParts.push(event.key.toUpperCase());
      }

      const key = keyParts.join('+');
      return { action: shortcuts[key] || null, key };
    },
    [shortcuts]
  );

  // Handle key events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent, onAction?: (action: ShortcutAction, data?: any) => void) => {
      const { action, key } = getActionForEvent(event);

      // Update pressed keys
      setPressedKeys((prev) => new Set(prev).add(event.key));

      // Prevent default for our shortcuts
      if (action) {
        event.preventDefault();
        event.stopPropagation();

        if (onAction) {
          if (Array.isArray(action)) {
            action.forEach((a) => onAction(a, { key }));
          } else {
            onAction(action, { key });
          }
        }
      }
    },
    [getActionForEvent]
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const key = event.key;
    setPressedKeys((prev) => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
  }, []);

  // Setup global listeners
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Only handle if no input/textarea is focused
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target as HTMLElement)?.contentEditable === 'true'
      ) {
        return;
      }

      handleKeyDown(event);
    };

    const handleGlobalKeyUp = (event: KeyboardEvent) => {
      handleKeyUp(event);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    shortcuts,
    pressedKeys,
    updateShortcut,
    resetShortcuts,
    getActionForKey,
    getActionForEvent,
    handleKeyDown,
    handleKeyUp,
  };
};
