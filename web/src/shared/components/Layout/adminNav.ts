// The workspace Admin surfaces, as a typed module-level constant so the in-page side list is data,
// not inline JSX (web-component-architecture.md). One "Workspace" sidebar entry (under the Admin
// section) lands on this area; this list is the secondary navigation between the surfaces. Each item
// also carries the header title + one-line lead that SideNavLayout renders in the full-width header,
// so the pages themselves no longer render their own title.

import type { SideNavItem } from './SideNavLayout';

export const ADMIN_NAV: SideNavItem[] = [
  {
    to: '/admin/users',
    label: 'Users & access',
    lead: 'Manage who can see and act in this workspace, and what each access level can do.',
  },
  {
    to: '/admin/fields',
    label: 'Fields & objects',
    lead: 'Define the fields analysts can add to requests and tasks in this workspace.',
  },
  {
    to: '/admin/views',
    label: 'Views & dashboards',
    lead: 'Manage the shared saved views on each list surface — promote a personal view to shared, set the default, or retire one. Retiring a view never changes any records.',
  },
  {
    to: '/admin/lifecycle',
    label: 'Lifecycle & gates',
    lead: 'Each request type follows a lifecycle — its own stages and approval gates. A request picks its lifecycle at intake.',
  },
  {
    to: '/admin/announcements',
    label: 'Announcements',
    lead: 'Post notices to your workspace. Active announcements appear in everyone’s bell.',
  },
  {
    to: '/admin/triggers',
    label: 'Triggers',
    lead: 'Send scheduled reminders when a request meets conditions you define — an SLA nearing breach, a benefit review coming due. A daily sweep fires each enabled trigger to its recipients’ bell.',
  },
  { to: '/admin/import-export', label: 'Import & export' },
  {
    to: '/admin/audit',
    label: 'Audit log',
    lead: 'Every change in this workspace — field edits, stage moves, gate decisions, config changes, and escalations — newest first. The trail is append-only and cannot be edited.',
  },
];
