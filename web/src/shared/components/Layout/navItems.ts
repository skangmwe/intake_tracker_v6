// Sidebar navigation model. Enumerable UI options live in a typed module-level constant, not
// inline JSX (web-component-architecture.md). Grouped into sections; each item is categorical
// (icon marker only — never also a number, per navigation-and-ia.md).

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowsDownUp,
  ChartBar,
  FlowArrow,
  House,
  ListDashes,
  Scroll,
  SquaresFour,
  Stack,
  Toolbox,
  Tray,
  Users,
} from '@phosphor-icons/react';

export interface NavEntry {
  to: string;
  icon: ComponentType<IconProps>;
  label: string;
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
    label: 'Admin',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users & access' },
      { to: '/admin/fields', icon: ListDashes, label: 'Fields & objects' },
      { to: '/admin/views', icon: Stack, label: 'Views & dashboards' },
      { to: '/admin/lifecycle', icon: FlowArrow, label: 'Lifecycle & gates' },
      { to: '/admin/import-export', icon: ArrowsDownUp, label: 'Import & export' },
      { to: '/admin/audit', icon: Scroll, label: 'Audit log' },
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
