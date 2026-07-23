// A settings-style side-list layout: a full-width title header across the top, a vertical list of
// surfaces down the left (a horizontal scroll strip below 768px), and the active surface in the
// content column via <Outlet />. Shared by the areas that group several sibling surfaces behind one
// sidebar entry — Platform (S34–S39) and the workspace Admin surfaces. The header title/lead come
// from the active nav item (derived from the route), so each surface no longer renders its own
// in-content title. `navLabel` must be distinct from the app sidebar's section navs so the
// navigation landmark stays unique (accessibility.md — landmark-unique).

import { NavLink, Outlet, useLocation } from 'react-router-dom';

export interface SideNavItem {
  to: string;
  label: string;
  /** Header title for this surface — defaults to `label` when omitted. */
  title?: string;
  /** One-line surface description shown under the header title. */
  lead?: string;
}

interface SideNavLayoutProps {
  /** Accessible name for the surface list — distinct from the app sidebar's nav sections. */
  navLabel: string;
  items: SideNavItem[];
}

// Pick the surface whose route best matches the current path — the longest `to` that is a prefix of
// the pathname (so a leaf route wins over a shorter sibling). Falls back to the first item during the
// transient index-redirect render before the leaf route resolves.
function activeItem(items: SideNavItem[], pathname: string): SideNavItem | undefined {
  let best: SideNavItem | undefined;
  for (const item of items) {
    const matches = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (matches && (best === undefined || item.to.length > best.to.length)) {
      best = item;
    }
  }
  return best ?? items[0];
}

export function SideNavLayout({ navLabel, items }: SideNavLayoutProps) {
  const { pathname } = useLocation();
  const active = activeItem(items, pathname);

  return (
    // data-layout="wide" opts this settings frame out of the app-shell's 1200px reading cap so its
    // data-dense subsections (members, fields, views, audit) use the full canvas (app-shell-and-headers.md).
    <div className="side-nav-layout" data-layout="wide">
      <header className="side-nav-layout__header">
        <h1 className="h2 side-nav-layout__title">{active?.title ?? active?.label}</h1>
        {active?.lead != null && <p className="body side-nav-layout__lead">{active.lead}</p>}
      </header>
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
