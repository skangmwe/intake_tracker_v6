// Announcements — team notices delivered via the bell (BS §2.7 / §20).

import type { AnnouncementId, IsoDate, IsoDateTime, UserId, WorkspaceId } from './common';

/**
 * Reconciled lifecycle (2026-07-21, Depth C). The API returns a *display* status of `'Active'`
 * (live), `'Scheduled'` (publishes later), or `'Archived'`. The union stays wide so legacy stored
 * values (`'Draft'` / `'Published'` / `'Retired'`) still typecheck during the incremental rollout;
 * new reads only ever carry `'Active'` / `'Scheduled'` / `'Archived'`.
 */
export type AnnouncementStatus =
  | 'Active'
  | 'Scheduled'
  | 'Archived'
  | 'Draft'
  | 'Published'
  | 'Retired';

/** What the create / edit form may set: publish now (`'Active'`) or hold for later (`'Scheduled'`). */
export type AnnouncementWriteStatus = 'Active' | 'Scheduled';

export type AnnouncementAudienceKind = 'everyone' | 'role-scoped' | 'named-users';

export interface AnnouncementAudience {
  kind: AnnouncementAudienceKind;
  /** Role labels the announcement fans to when kind = 'role-scoped'. */
  roleLabels?: string[];
  /** Explicit user IDs when kind = 'named-users'. */
  userIds?: UserId[];
}

export interface AnnouncementDto {
  id: AnnouncementId;
  workspaceId: WorkspaceId;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  expiresOn?: IsoDate;
  status: AnnouncementStatus;
  author: UserId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  publishedAt?: IsoDateTime;
  /**
   * v2 (slice 13 polish). When set and `status='Scheduled'`, the scheduler tick flips the row
   * to Published at this time. Ignored on Draft/Published/Retired/Archived rows.
   */
  scheduledPublishAt?: IsoDateTime;
  /**
   * v2 (slice 13 polish). When true, the row auto-archives 30 days after publication.
   * Defaults to true for new announcements.
   */
  autoArchive?: boolean;
  /**
   * v2 (slice 13 polish). Server-computed: `publishedAt + 30 days` when `autoArchive=true`,
   * else null. The scheduler tick flips Published rows to Archived at this time.
   */
  autoArchiveAt?: IsoDateTime;
}

export interface AnnouncementCreateRequest {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned?: boolean;
  expiresOn?: IsoDate;
  /** The poster ("posted by"). Any workspace member; omitted → the acting admin. */
  author?: UserId;
  /** Publish now (`'Active'`) or hold for `scheduledPublishAt` (`'Scheduled'`). Omitted → `'Active'`. */
  status?: AnnouncementWriteStatus;
  /** When present (and `status='Scheduled'`), the tick publishes the row at this time. */
  scheduledPublishAt?: IsoDateTime;
  /** Auto-archive 30 days after publish. Defaults to true when omitted. */
  autoArchive?: boolean;
}

/**
 * PATCH body — a full replace of the editable field set (title / body / audience / pinned / expiry).
 * Not sparse: an admin edits the whole notice in a form and saves it. Allowed until Retired (§20).
 */
export interface AnnouncementPatchRequest {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  expiresOn?: IsoDate;
  /** The poster ("posted by"). Any workspace member; omitted → the acting admin. */
  author?: UserId;
  /** Publish now (`'Active'`) or hold for `scheduledPublishAt` (`'Scheduled'`). Omitted → `'Active'`. */
  status?: AnnouncementWriteStatus;
  /** When present (and `status='Scheduled'`), the tick publishes the row at this time. */
  scheduledPublishAt?: IsoDateTime;
  /** Auto-archive 30 days after publish. */
  autoArchive?: boolean;
}

export interface AnnouncementListRow {
  id: AnnouncementId;
  title: string;
  bodySnippet: string;
  pinned: boolean;
  publishedAt?: IsoDateTime;
  status: AnnouncementStatus;
  author: UserId;
  /** Lifecycle timestamps (present on the manage/browse read) — feed the derived display status. */
  scheduledPublishAt?: IsoDateTime;
  autoArchive?: boolean;
  autoArchiveAt?: IsoDateTime;
  /** The poster's display name (manage table POSTED BY column). */
  authorName?: string;
  /** Published → else scheduled → else created (manage table POSTED column). */
  postedAt?: IsoDateTime;
}
