// Announcements — team notices delivered via the bell (BS §2.7 / §20).

import type { AnnouncementId, IsoDate, IsoDateTime, UserId, WorkspaceId } from './common';

/**
 * v2 (slice 13 polish) adds `'Scheduled'` and `'Archived'`. A Scheduled announcement flips to
 * Published when `scheduledPublishAt` is reached; a Published announcement flips to Archived
 * when `autoArchiveAt` is reached (only when `autoArchive=true`).
 */
export type AnnouncementStatus =
  | 'Draft'
  | 'Scheduled'
  | 'Published'
  | 'Retired'
  | 'Archived';

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
  /** v2 (slice 13 polish). When present, the row is created in Scheduled status. */
  scheduledPublishAt?: IsoDateTime;
  /** v2 (slice 13 polish). Defaults to true when omitted. */
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
  /** v2 (slice 13 polish). */
  scheduledPublishAt?: IsoDateTime;
  /** v2 (slice 13 polish). */
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
}
