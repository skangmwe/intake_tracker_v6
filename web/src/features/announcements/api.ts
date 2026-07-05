// Announcements API calls (S21/S22/S23 — api-contracts.md §12). One thin apiFetch wrapper per
// endpoint; the /api prefix is added inside apiFetch. Consumer reads are cross-workspace and use the
// flat /announcements routes; admin create + manage-list are workspace-scoped (like Lifecycle §18).

import type {
  AnnouncementCreateRequest,
  AnnouncementDto,
  AnnouncementListRow,
  AnnouncementPatchRequest,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

interface PageQuery {
  page: number;
  pageSize: number;
}

/** The caller's Published, in-audience announcement history (S22). */
export function queryAnnouncements(
  query: PageQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<AnnouncementListRow>> {
  return apiFetch<PaginatedResponse<AnnouncementListRow>>('/v1/announcements/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

/** One announcement's detail (S21). */
export function fetchAnnouncement(id: string, signal?: AbortSignal): Promise<AnnouncementDto> {
  return apiFetch<AnnouncementDto>(`/v1/announcements/${id}`, signal ? { signal } : {});
}

/** The workspace's full announcement list across all statuses (S23 — WorkspaceAdmin). */
export function queryManagedAnnouncements(
  workspaceId: WorkspaceId,
  query: PageQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<AnnouncementListRow>> {
  return apiFetch<PaginatedResponse<AnnouncementListRow>>(`/v1/workspaces/${workspaceId}/announcements/query`, {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

/** Create a Draft announcement in a workspace (WorkspaceAdmin). */
export function createAnnouncement(
  workspaceId: WorkspaceId,
  request: AnnouncementCreateRequest,
): Promise<AnnouncementDto> {
  return apiFetch<AnnouncementDto>(`/v1/workspaces/${workspaceId}/announcements`, {
    method: 'POST',
    body: request,
  });
}

/** Replace the editable fields of an announcement (author or WorkspaceAdmin). */
export function updateAnnouncement(id: string, request: AnnouncementPatchRequest): Promise<AnnouncementDto> {
  return apiFetch<AnnouncementDto>(`/v1/announcements/${id}`, { method: 'PATCH', body: request });
}

/** Publish a Draft — fans "Announcement posted" to the audience's bells. */
export function publishAnnouncement(id: string): Promise<AnnouncementDto> {
  return apiFetch<AnnouncementDto>(`/v1/announcements/${id}/publish`, { method: 'POST', body: {} });
}

/** Retire an announcement — never a hard delete. */
export function retireAnnouncement(id: string): Promise<AnnouncementDto> {
  return apiFetch<AnnouncementDto>(`/v1/announcements/${id}/retire`, { method: 'POST', body: {} });
}
