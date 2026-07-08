// The workspace Admin surfaces, as a typed module-level constant so the in-page side list is data,
// not inline JSX (web-component-architecture.md). One "Workspace" sidebar entry (under the Admin
// section) lands on this area; this list is the secondary navigation between the surfaces.

import type { SideNavItem } from './SideNavLayout';

export const ADMIN_NAV: SideNavItem[] = [
  { to: '/admin/users', label: 'Users & access' },
  { to: '/admin/fields', label: 'Fields & objects' },
  { to: '/admin/views', label: 'Views & dashboards' },
  { to: '/admin/lifecycle', label: 'Lifecycle & gates' },
  { to: '/admin/announcements', label: 'Manage announcements' },
  { to: '/admin/import-export', label: 'Import & export' },
  { to: '/admin/audit', label: 'Audit log' },
];
