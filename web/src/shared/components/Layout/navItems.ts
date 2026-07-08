// Sidebar navigation model. Enumerable UI options live in a typed module-level constant, not
// inline JSX (web-component-architecture.md). Grouped into sections; each item is categorical
// (icon marker only — never also a number, per navigation-and-ia.md).

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import {
  ChartBar,
  Gear,
  House,
  ShieldCheck,
  SquaresFour,
  Toolbox,
  Tray,
} from '@phosphor-icons/react';

export interface NavEntry {
  to: string;
  icon: ComponentType<IconProps>;
  label: string;
  /** Item shown only to holders of the additive Platform-admin grant (S34–S39). */
  platformOnly?: boolean;
}

export interface NavSection {
  label: string;
  items: NavEntry[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', icon: House, label: 'Home' },
      { to: '/requests', icon: Tray, label: 'Requests' },
      { to: '/dashboards', icon: ChartBar, label: 'Dashboards' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/feature-catalog', icon: SquaresFour, label: 'Feature Catalog' },
      { to: '/toolkit', icon: Toolbox, label: 'Toolkit' },
    ],
  },
  {
    // Workspace admin and the firm-wide platform surfaces — each grouped behind one entry that
    // opens its own side list (SideNavLayout). The Platform entry is shown only to platform admins
    // (item-level gate); the API is the real access boundary.
    label: 'Admin',
    items: [
      { to: '/admin', icon: Gear, label: 'Workspace' },
      { to: '/platform', icon: ShieldCheck, label: 'Platform', platformOnly: true },
    ],
  },
];

const ALL_ENTRIES = NAV_SECTIONS.flatMap((section) => section.items);

/** The screen title shown in the top bar for a given route. */
export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'Home';
  const match = ALL_ENTRIES.filter((entry) => entry.to !== '/').find(
    (entry) => pathname === entry.to || pathname.startsWith(`${entry.to}/`),
  );
  return match?.label ?? 'AI Solutions Tracker';
}
