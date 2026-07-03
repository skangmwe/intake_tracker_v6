// Theme toggle (top bar). Presentational — the shell owns theme state + persistence and
// passes the current theme + an onToggle handler.

import { Moon, Sun } from '@phosphor-icons/react';
import type { ThemePreference } from '@shared/types';

import { IconButton } from '@/shared/components/Button/IconButton';

interface ThemeToggleProps {
  theme: ThemePreference;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const goingDark = theme === 'light';
  return (
    <IconButton
      icon={goingDark ? Moon : Sun}
      label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      onClick={onToggle}
    />
  );
}
