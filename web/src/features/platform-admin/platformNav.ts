// The six firm-wide platform surfaces (S34–S39), as a typed module-level constant so the in-page
// side list is data, not inline JSX (web-component-architecture.md). One "Platform" sidebar entry
// lands on this area; this list is the secondary navigation between the surfaces. Each item also
// carries the header title + one-line lead that SideNavLayout renders in the full-width header, so
// the pages themselves no longer render their own title. The nav label is short (fits the rail); the
// header title may differ (e.g. "Field schema" nav → "Fields & objects" header).

export interface PlatformNavEntry {
  to: string;
  label: string;
  /** Header title for this surface — defaults to `label` when omitted. */
  title?: string;
  /** One-line surface description shown under the header title. */
  lead?: string;
}

export const PLATFORM_NAV: PlatformNavEntry[] = [
  {
    to: '/platform/fields',
    label: 'Field schema',
    title: 'Fields & objects',
    lead: 'Platform-level field definitions inherited by every workspace.',
  },
  {
    to: '/platform/crossing-map',
    label: 'Crossing map',
    lead: 'How PG/Dept request fields map to AI Solutions fields when a request is escalated. Propose a new mapping, then confirm it to make it live.',
  },
  {
    to: '/platform/access',
    label: 'Access provisioning',
    lead: 'Who holds firm-wide Platform-admin access and which workspaces have admins.',
  },
  {
    to: '/platform/announcements',
    label: 'Announcements',
    lead: 'Post a notice to every workspace or specific ones. Each targeted workspace receives it in its members’ bell.',
  },
  {
    to: '/platform/workspaces',
    label: 'Workspaces',
    title: 'Workspace provisioning',
    lead: 'Stand up a new PG/Dept workspace by cloning the template — name, prefix, and initial admin.',
  },
  {
    to: '/platform/audit',
    label: 'Firm-wide audit',
    lead: 'Every change across every workspace — field edits, gate decisions, config changes, escalations, and platform edits — newest first. Append-only and uneditable.',
  },
];
