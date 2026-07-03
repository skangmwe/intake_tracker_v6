// Theme state hook. Owns the painted theme + toggle; the caller wires persistence (server
// sync) and server-reconciliation via the returned setter. Keeps DOM + localStorage in sync
// through the theme.ts primitives.

import { useCallback, useState } from 'react';
import type { ThemePreference } from '@shared/types';

import { applyTheme, getActiveTheme } from './theme';

export interface UseThemeResult {
  theme: ThemePreference;
  /** Apply a specific theme (DOM + localStorage + state). */
  setTheme: (theme: ThemePreference) => void;
  /** Flip light↔dark and return the new value (so callers can persist it). */
  toggleTheme: () => ThemePreference;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemePreference>(() => getActiveTheme());

  const setTheme = useCallback((next: ThemePreference) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = getActiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setThemeState(next);
    return next;
  }, []);

  return { theme, setTheme, toggleTheme };
}
