// The application top bar (design-system .mws-topbar). Left: mobile hamburger + page title.
// Right cluster: workspace search, notifications bell, theme toggle, account menu. Minimal by
// design (app-shell-and-headers.md) — the lockup lives in the sidebar, not here.

import { List } from '@phosphor-icons/react';
import type { ThemePreference } from '@shared/types';

import { IconButton } from '@/shared/components/Button/IconButton';

import { AccountMenu } from './AccountMenu';
import { BellMenu } from './BellMenu';
import { ThemeToggle } from './ThemeToggle';
import { WorkspaceSearch } from './WorkspaceSearch';

interface TopBarProps {
  title: string;
  theme: ThemePreference;
  onToggleTheme: () => void;
  onOpenDrawer: () => void;
}

export function TopBar({ title, theme, onToggleTheme, onOpenDrawer }: TopBarProps) {
  return (
    <header className="mws-topbar" data-ds="topbar">
      <div className="mws-topbar__left">
        <span className="ast-hamburger">
          <IconButton icon={List} label="Open navigation" onClick={onOpenDrawer} />
        </span>
        <div className="mws-topbar__title">{title}</div>
      </div>
      <div className="mws-topbar__right ast-topbar-cluster">
        <WorkspaceSearch />
        <BellMenu />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <AccountMenu />
      </div>
    </header>
  );
}
