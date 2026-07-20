// S29 Users & access constants. The three fixed workspace access levels (BS §4.2) as a typed,
// module-level option list (web-component-architecture.md — enumerable UI options are a constant,
// not inline JSX).

import type { SelectOption } from '@/shared/components/Form';

export const LEVEL_OPTIONS: SelectOption[] = [
  { value: 'Viewer', label: 'Viewer' },
  { value: 'Member', label: 'Member' },
  { value: 'WorkspaceAdmin', label: 'Workspace admin' },
];

/** Members list page size — the members list surface paginates like the other list screens. */
export const MEMBERS_PAGE_SIZE = 25;

/** The three member statuses, as funnel-filter options for the Status column. */
export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Suspended', label: 'Suspended' },
  { value: 'Invited', label: 'Invited' },
];

/** The two panels of the S29 Users & access surface (Members list + Approver-teams roster). */
export type UsersAccessTab = 'members' | 'teams';

export const USERS_ACCESS_TABS: { id: UsersAccessTab; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'teams', label: 'Approver teams' },
];
