// Dashboards API calls (S6/S14/S12/S15/S16/S17/S32 — api-contracts.md §15, slice-23 contract §6).
// One thin apiFetch wrapper per endpoint. Query strings are built through the shared withQuery util
// (web-coding-standards.md — never assemble query strings inline). The /api prefix is added inside
// apiFetch. Drill-through is passed as a URL-encoded JSON blob on the by-id read.

import type {
  DashboardDrillFilter,
  DashboardListDto,
  DashboardPatchRequest,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

/** GET /workspaces/{id}/dashboards — the dashboards visible to the caller in a workspace (S17, S32). */
export function fetchDashboardList(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<DashboardListDto> {
  return apiFetch<DashboardListDto>(
    `/v1/workspaces/${workspaceId}/dashboards`,
    signal ? { signal } : {},
  );
}

/**
 * GET /dashboards/{id}?drill=<url-encoded-json> — the full dashboard with every widget resolved to the
 * caller. A drill filter re-scopes the embedded records grid server-side (S6). Omitted when no drill.
 */
export function fetchDashboard(
  dashboardId: SavedDashboardId,
  drill?: DashboardDrillFilter,
  signal?: AbortSignal,
): Promise<SavedDashboardDto> {
  const path = withQuery(`/v1/dashboards/${dashboardId}`, {
    drill: drill ? JSON.stringify(drill) : undefined,
  });
  return apiFetch<SavedDashboardDto>(path, signal ? { signal } : {});
}

/** PATCH /dashboards/{id} — audience edit / retire (S32 shared-dashboards management, WorkspaceAdmin). */
export function patchDashboard(
  dashboardId: SavedDashboardId,
  request: DashboardPatchRequest,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/dashboards/${dashboardId}`, {
    method: 'PATCH',
    body: request,
  });
}
