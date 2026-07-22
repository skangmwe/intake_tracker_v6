// Enumerable UI options for the announcements feature (web-component-architecture.md — typed
// module-level constants, never inline JSX). Pagination page sizes are named constants per
// web-coding-standards.md.

import type { SelectOption } from '@/shared/components/Form';
import type { AnnouncementStatus, AnnouncementWriteStatus } from '@shared/types';

/** Consumer feed / detail page size (S22). */
export const ANNOUNCEMENTS_PAGE_SIZE = 20;

/** Rows shown per page in the admin manage table (S23) before the pagination footer. */
export const MANAGE_ANNOUNCEMENTS_PAGE_SIZE = 10;

/** The manage list is sorted / filtered / paginated client-side (like the Objects & Fields tabs),
 * so it is fetched in one large page. */
export const MANAGE_ANNOUNCEMENTS_FETCH_SIZE = 100;

/** Days after publish that an auto-archiving announcement moves to Archived. Mirrors the API default. */
export const AUTO_ARCHIVE_DAYS = 30;

/** Editor Status choices — publish now (Active) or hold for a scheduled time. */
export const STATUS_WRITE_OPTIONS: readonly { value: AnnouncementWriteStatus; label: string }[] = [
  { value: 'Active', label: 'Active — publish now' },
  { value: 'Scheduled', label: 'Scheduled — publish later' },
];

type StatusKind = 'info' | 'success' | 'warning' | 'error' | 'neutral';

/** Status → pill kind + label. Colour is always paired with the label (notifications-and-feedback.md).
 * The reconciled display statuses are Active / Scheduled / Archived; the legacy stored values
 * (Draft / Published / Retired) are kept so the map stays exhaustive during the incremental rollout. */
export const STATUS_PILL: Record<AnnouncementStatus, { kind: StatusKind; label: string }> = {
  Active: { kind: 'success', label: 'Active' },
  Scheduled: { kind: 'info', label: 'Scheduled' },
  Archived: { kind: 'neutral', label: 'Archived' },
  Draft: { kind: 'neutral', label: 'Draft' },
  Published: { kind: 'success', label: 'Published' },
  Retired: { kind: 'warning', label: 'Retired' },
};

/** The SelectOption[] the editor's Status field consumes (Select expects the flat shape). */
export const STATUS_WRITE_SELECT: SelectOption[] = STATUS_WRITE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));
