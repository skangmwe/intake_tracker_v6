// Enumerable UI options for the announcements feature (web-component-architecture.md — typed
// module-level constants, never inline JSX). Pagination page size is a named constant per
// web-coding-standards.md.

import type { SelectOption } from '@/shared/components/Form';
import type { AnnouncementStatus } from '@shared/types';

export const ANNOUNCEMENTS_PAGE_SIZE = 20;

export const AUDIENCE_OPTIONS: SelectOption[] = [
  { value: 'everyone', label: 'Everyone in the workspace' },
  { value: 'role-scoped', label: 'People with specific roles' },
  { value: 'named-users', label: 'Specific people' },
];

type StatusKind = 'info' | 'success' | 'warning' | 'error' | 'neutral';

/** Status → pill kind + label. Colour is always paired with the label (notifications-and-feedback.md). */
export const STATUS_PILL: Record<AnnouncementStatus, { kind: StatusKind; label: string }> = {
  Draft: { kind: 'neutral', label: 'Draft' },
  Published: { kind: 'success', label: 'Published' },
  Retired: { kind: 'warning', label: 'Retired' },
};
