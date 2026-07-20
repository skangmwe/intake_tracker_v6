// S29 Users & access constants. The three fixed workspace access levels (BS §4.2) as a typed,
// module-level option list (web-component-architecture.md — enumerable UI options are a constant,
// not inline JSX).

import type { SelectOption } from '@/shared/components/Form';

export const LEVEL_OPTIONS: SelectOption[] = [
  { value: 'Viewer', label: 'Viewer' },
  { value: 'Member', label: 'Member' },
  { value: 'WorkspaceAdmin', label: 'Workspace admin' },
];

/** The two panels of the S29 Users & access surface (Members list + Approver-teams roster). */
export type UsersAccessTab = 'members' | 'teams';

export const USERS_ACCESS_TABS: { id: UsersAccessTab; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'teams', label: 'Approver teams' },
];
