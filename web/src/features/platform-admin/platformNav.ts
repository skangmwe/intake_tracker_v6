// The six firm-wide platform surfaces (S34–S39), as a typed module-level constant so the in-page
// side list is data, not inline JSX (web-component-architecture.md). One "Platform" sidebar entry
// lands on this area; this list is the secondary navigation between the surfaces.

export interface PlatformNavEntry {
  to: string;
  label: string;
}

export const PLATFORM_NAV: PlatformNavEntry[] = [
  { to: '/platform/fields', label: 'Field schema' },
  { to: '/platform/crossing-map', label: 'Crossing map' },
  { to: '/platform/access', label: 'Access provisioning' },
  { to: '/platform/role-labels', label: 'Role labels' },
  { to: '/platform/workspaces', label: 'Workspaces' },
  { to: '/platform/audit', label: 'Firm-wide audit' },
];
