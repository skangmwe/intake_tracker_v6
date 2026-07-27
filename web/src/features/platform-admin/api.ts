// Platform-admin feature API calls (S35 Crossing map · S36 Access · S39 Firm-wide
// audit — api-contracts.md §19). Thin apiFetch wrappers; the /api prefix is added inside apiFetch.
// Every endpoint is Platform-admin-gated server-side (403 for non-admins — the API is the boundary).

import type {
  CrossingCandidatesDto,
  CrossingMapProposeRequest,
  CrossingMapRowDto,
  FirmWideAuditQuery,
  FirmWideAuditRowDto,
  PaginatedResponse,
  PlatformAdminGrantRequest,
  PrivilegedGrantsListDto,
  UserId,
  WorkspaceListRow,
  WorkspaceProvisionRequest,
  WorkspaceProvisionResult,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/* ── S35 Crossing map (propose / confirm) ─────────────────────────────────── */

export function fetchCrossingMap(signal?: AbortSignal): Promise<CrossingMapRowDto[]> {
  return apiFetch<CrossingMapRowDto[]>('/v1/platform/crossing-map', signal ? { signal } : {});
}

export function fetchCrossingCandidates(signal?: AbortSignal): Promise<CrossingCandidatesDto> {
  return apiFetch<CrossingCandidatesDto>(
    '/v1/platform/crossing-map/candidates',
    signal ? { signal } : {},
  );
}

export function proposeCrossingMap(body: CrossingMapProposeRequest): Promise<CrossingMapRowDto> {
  return apiFetch<CrossingMapRowDto>('/v1/platform/crossing-map', { method: 'POST', body });
}

export function confirmCrossingMap(crossingMapId: string): Promise<CrossingMapRowDto> {
  return apiFetch<CrossingMapRowDto>(`/v1/platform/crossing-map/${crossingMapId}`, { method: 'PATCH' });
}

/* ── S36 Access provisioning ──────────────────────────────────────────────── */

export function fetchAccessGrants(signal?: AbortSignal): Promise<PrivilegedGrantsListDto> {
  return apiFetch<PrivilegedGrantsListDto>('/v1/platform/access', signal ? { signal } : {});
}

export function grantAccess(body: PlatformAdminGrantRequest): Promise<void> {
  return apiFetch<void>('/v1/platform/access', { method: 'POST', body });
}

export function revokeAccess(userId: UserId): Promise<void> {
  return apiFetch<void>(`/v1/platform/access/${userId}`, { method: 'DELETE' });
}

/* ── S38 Workspace provisioning ───────────────────────────────────────────── */

export function provisionWorkspace(body: WorkspaceProvisionRequest): Promise<WorkspaceProvisionResult> {
  return apiFetch<WorkspaceProvisionResult>('/v1/workspaces', { method: 'POST', body });
}

/** The rich Platform → Workspaces list (platform-admin only). */
export function fetchWorkspacesList(signal?: AbortSignal): Promise<WorkspaceListRow[]> {
  return apiFetch<WorkspaceListRow[]>('/v1/workspaces', signal ? { signal } : {});
}

/* ── S39 Firm-wide audit ──────────────────────────────────────────────────── */

export function queryFirmWideAudit(
  query: FirmWideAuditQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<FirmWideAuditRowDto>> {
  return apiFetch<PaginatedResponse<FirmWideAuditRowDto>>('/v1/platform/audit/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}
