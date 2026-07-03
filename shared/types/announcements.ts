// Announcements — team notices delivered via the bell (BS §2.7 / §20).

import type { AnnouncementId, IsoDate, IsoDateTime, UserId, WorkspaceId } from './common';

export type AnnouncementStatus = 'Draft' | 'Published' | 'Retired';

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
}

export interface AnnouncementCreateRequest {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned?: boolean;
  expiresOn?: IsoDate;
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
