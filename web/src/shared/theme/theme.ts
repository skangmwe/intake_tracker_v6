// Theme persistence primitives. localStorage is used EXCLUSIVELY for the theme preference
// (web-persistence.md) — the pre-paint inline script in index.html reads the same key. The
// server also persists theme (roams across devices); these helpers keep the DOM + localStorage
// in sync with whichever source is authoritative at the moment.

import type { ThemePreference } from '@shared/types';

export const THEME_STORAGE_KEY = 'theme-preference';

export function getStoredTheme(): ThemePreference | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** The theme currently painted (from the <html data-theme> the inline script set). */
export function getActiveTheme(): ThemePreference {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Apply a theme to the DOM and persist it to localStorage. */
export function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode / disabled) — the DOM attribute still applies.
  }
}
