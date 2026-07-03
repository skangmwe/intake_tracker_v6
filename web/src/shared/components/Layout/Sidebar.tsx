// The application sidebar (design-system .mws-sidebar). Holds the app identity (lockup), the
// workspace switcher, grouped inter-section navigation, and the desktop collapse control.
// Below 1024px it is the slide-in drawer (data-open); on desktop it collapses to a 72px icon
// rail (data-collapsed). The ref is the focus-trap container for the mobile drawer.

import { forwardRef } from 'react';
import { SidebarSimple } from '@phosphor-icons/react';
import type { WorkspaceMembershipDto } from '@shared/types';

import { Lockup } from './Lockup';
import { NavItem } from './NavItem';
import { NAV_SECTIONS } from './navItems';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  memberships: WorkspaceMembershipDto[];
  onToggleCollapse: () => void;
  onNavigate: () => void;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { open, collapsed, memberships, onToggleCollapse, onNavigate },
  ref,
) {
  return (
    <aside
      ref={ref}
      className="mws-sidebar"
      data-ds="sidebar"
      data-open={open}
      data-collapsed={collapsed}
      aria-label="Application navigation"
    >
      <div className="mws-sidebar__header">
        <Lockup name="AI Solutions Tracker" size={32} symbolOnly={collapsed} />
      </div>

      <WorkspaceSwitcher memberships={memberships} />

      <div className="mws-sidebar__primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mws-sidebar__section-label">{section.label}</div>
            <nav aria-label={section.label}>
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  onNavigate={onNavigate}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="ast-nav-collapse">
        <button
          type="button"
          className="ast-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <SidebarSimple size={16} weight="regular" aria-hidden />
        </button>
      </div>
    </aside>
  );
});
