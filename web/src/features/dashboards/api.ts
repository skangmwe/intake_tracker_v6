// Dashboards API calls (S6/S14/S12/S15/S16/S17/S32 — api-contracts.md §15, slice-23 contract §6).
// One thin apiFetch wrapper per endpoint. Query strings are built through the shared withQuery util
// (web-coding-standards.md — never assemble query strings inline). The /api prefix is added inside
// apiFetch. Drill-through is passed as a URL-encoded JSON blob on the by-id read.

import type {
  DashboardComposeRequest,
  DashboardDrillFilter,
  DashboardListDto,
  DashboardPatchRequest,
  SavedDashboardDto,
  SavedDashboardId,
  WidgetComposeRequest,
  WidgetId,
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

/** PATCH /dashboards/{id} — audience/name/retire (S32) + composer visibility/layout (slice 28). */
export function patchDashboard(
  dashboardId: SavedDashboardId,
  request: DashboardPatchRequest,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/dashboards/${dashboardId}`, {
    method: 'PATCH',
    body: request,
  });
}

/** POST /workspaces/{id}/dashboards — create a user-composed dashboard (S6 "New dashboard", slice 28). */
export function createDashboard(
  workspaceId: WorkspaceId,
  request: DashboardComposeRequest,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/workspaces/${workspaceId}/dashboards`, {
    method: 'POST',
    body: request,
  });
}

/** POST /dashboards/{id}/widgets — append a widget to a composed dashboard (slice 28). */
export function addWidget(
  dashboardId: SavedDashboardId,
  request: WidgetComposeRequest,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: request,
  });
}

/** PATCH /dashboards/{id}/widgets/{widgetId} — update one composed widget (slice 28). */
export function updateWidget(
  dashboardId: SavedDashboardId,
  widgetId: WidgetId,
  request: WidgetComposeRequest,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PATCH',
    body: request,
  });
}

/** DELETE /dashboards/{id}/widgets/{widgetId} — remove one composed widget (slice 28). */
export function deleteWidget(
  dashboardId: SavedDashboardId,
  widgetId: WidgetId,
): Promise<SavedDashboardDto> {
  return apiFetch<SavedDashboardDto>(`/v1/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'DELETE',
  });
}
