// Platform broadcast API calls (platform-admin only). One thin apiFetch wrapper per endpoint; the /api
// prefix is added inside apiFetch. Every endpoint is Platform-admin-gated server-side (403 for non-admins
// — the API is the boundary). Posting fans out one per-workspace announcement per target on the server.

import type {
  PaginatedResponse,
  PlatformAnnouncementCreateRequest,
  PlatformAnnouncementCreatedDto,
  PlatformAnnouncementPatchRequest,
  PlatformAnnouncementRow,
  PlatformWorkspaceDto,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

interface PageQuery {
  page: number;
  pageSize: number;
}

/** The workspaces a platform admin may broadcast to (excludes the PG/Dept clone template). */
export function fetchPlatformWorkspaces(signal?: AbortSignal): Promise<PlatformWorkspaceDto[]> {
  return apiFetch<PlatformWorkspaceDto[]>('/v1/platform/workspaces', signal ? { signal } : {});
}

/** Post a broadcast to all or specific workspaces — fans out one per-workspace copy per target. */
export function createPlatformBroadcast(
  request: PlatformAnnouncementCreateRequest,
): Promise<PlatformAnnouncementCreatedDto> {
  return apiFetch<PlatformAnnouncementCreatedDto>('/v1/platform/announcements', {
    method: 'POST',
    body: request,
  });
}

/** The platform manage list — every broadcast grouped to one row. */
export function queryPlatformAnnouncements(
  query: PageQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<PlatformAnnouncementRow>> {
  return apiFetch<PaginatedResponse<PlatformAnnouncementRow>>('/v1/platform/announcements/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

/** Edit a broadcast's content across every copy (targets are fixed at creation). */
export function updatePlatformBroadcast(
  broadcastId: string,
  request: PlatformAnnouncementPatchRequest,
): Promise<void> {
  return apiFetch<void>(`/v1/platform/announcements/${broadcastId}`, { method: 'PATCH', body: request });
}

/** Retire (archive) every copy of a broadcast — never a hard delete. */
export function retirePlatformBroadcast(broadcastId: string): Promise<void> {
  return apiFetch<void>(`/v1/platform/announcements/${broadcastId}/retire`, { method: 'POST', body: {} });
}
