// The application frame: navy sidebar (drawer < 1024px), top bar, and the routed main region.
// Owns the shell's cross-cutting UI state — mobile drawer open/close (with focus trap +
// scrim + Escape + close-on-navigate), the persisted desktop collapse preference, and theme
// (local toggle + server reconciliation + server persistence so the choice roams).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useMe, useUpdateTheme } from '@/features/users/useMe';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { getActiveTheme } from '@/shared/theme/theme';
import { useTheme } from '@/shared/theme/useTheme';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { titleForPath } from './navItems';

const COLLAPSE_STORAGE_KEY = 'ast-nav-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppShell() {
  const location = useLocation();
  const { data: me } = useMe();
  const memberships = me?.memberships ?? [];

  const { theme, setTheme, toggleTheme } = useTheme();
  const updateTheme = useUpdateTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const sidebarRef = useFocusTrap<HTMLElement>(drawerOpen, closeDrawer);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Reconcile the server's saved theme exactly once, when it first resolves (roams to a new
  // device). Local toggles afterwards win and sync back to the server.
  const reconciledRef = useRef(false);
  const serverTheme = me?.user.theme;
  useEffect(() => {
    if (!reconciledRef.current && serverTheme) {
      reconciledRef.current = true;
      if (serverTheme !== getActiveTheme()) {
        setTheme(serverTheme);
      }
    }
  }, [serverTheme, setTheme]);

  const onToggleCollapse = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // Storage unavailable — collapse still applies for this session.
      }
      return next;
    });
  }, []);

  const onToggleTheme = useCallback(() => {
    const next = toggleTheme();
    updateTheme.mutate(next);
  }, [toggleTheme, updateTheme]);

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mws-drawer-scrim"
        data-open={drawerOpen}
        onClick={closeDrawer}
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
      />
      <Sidebar
        ref={sidebarRef}
        open={drawerOpen}
        collapsed={collapsed}
        memberships={memberships}
        onToggleCollapse={onToggleCollapse}
        onNavigate={closeDrawer}
      />
      <div className="app-shell__content">
        <TopBar
          title={titleForPath(location.pathname)}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="app-shell__main">
          <div className="app-shell__main-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
