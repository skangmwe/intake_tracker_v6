// Platform-admin feature API calls (S35 Crossing map · S36 Access · S37 Role labels · S39 Firm-wide
// audit — api-contracts.md §19). Thin apiFetch wrappers; the /api prefix is added inside apiFetch.
// Every endpoint is Platform-admin-gated server-side (403 for non-admins — the API is the boundary).

import type {
  CrossingMapRowDto,
  FirmWideAuditQuery,
  FirmWideAuditRowDto,
  PaginatedResponse,
  PlatformAdminGrantRequest,
  PrivilegedGrantsListDto,
  RoleLabelCreateRequest,
  RoleLabelDto,
  RoleLabelRenameRequest,
  UserId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/* ── S35 Crossing map (read-only) ─────────────────────────────────────────── */

export function fetchCrossingMap(signal?: AbortSignal): Promise<CrossingMapRowDto[]> {
  return apiFetch<CrossingMapRowDto[]>('/v1/platform/crossing-map', signal ? { signal } : {});
}

/* ── S37 Role-label catalog ───────────────────────────────────────────────── */

export function fetchRoleLabels(signal?: AbortSignal): Promise<RoleLabelDto[]> {
  return apiFetch<RoleLabelDto[]>('/v1/platform/role-labels', signal ? { signal } : {});
}

export function createRoleLabel(body: RoleLabelCreateRequest): Promise<RoleLabelDto> {
  return apiFetch<RoleLabelDto>('/v1/platform/role-labels', { method: 'POST', body });
}

export function renameRoleLabel(roleLabelId: string, body: RoleLabelRenameRequest): Promise<RoleLabelDto> {
  return apiFetch<RoleLabelDto>(`/v1/platform/role-labels/${roleLabelId}`, { method: 'PATCH', body });
}

export function retireRoleLabel(roleLabelId: string): Promise<void> {
  return apiFetch<void>(`/v1/platform/role-labels/${roleLabelId}`, { method: 'DELETE' });
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
