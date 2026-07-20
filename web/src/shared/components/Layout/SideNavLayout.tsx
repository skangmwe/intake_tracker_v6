// A settings-style side-list layout: a vertical list of surfaces down the left (a horizontal
// scroll strip below 768px) and the active surface in the content column via <Outlet />. Shared by
// the areas that group several sibling surfaces behind one sidebar entry — Platform (S34–S39) and
// the workspace Admin surfaces. `navLabel` must be distinct from the app sidebar's section navs so
// the navigation landmark stays unique (accessibility.md — landmark-unique).

import { NavLink, Outlet } from 'react-router-dom';

export interface SideNavItem {
  to: string;
  label: string;
}

interface SideNavLayoutProps {
  /** Accessible name for the surface list — distinct from the app sidebar's nav sections. */
  navLabel: string;
  items: SideNavItem[];
}

export function SideNavLayout({ navLabel, items }: SideNavLayoutProps) {
  return (
    // data-layout="wide" opts this settings frame out of the app-shell's 1200px reading cap so its
    // data-dense subsections (members, fields, views, audit) use the full canvas (app-shell-and-headers.md).
    <div className="side-nav-layout" data-layout="wide">
      <nav className="side-nav" aria-label={navLabel}>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className="side-nav__link" data-ds="nav-item">
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="side-nav-layout__content">
        <Outlet />
      </div>
    </div>
  );
}
