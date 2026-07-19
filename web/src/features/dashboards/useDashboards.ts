// TanStack Query hooks for Dashboards (slice 23 — web-state-management.md). Query-key factories are
// exported so pages and tests can target/invalidate precisely. The by-id read is keyed by both the
// dashboard id and the active drill filter, so a drill-through is a distinct cache entry and a click
// refetches (matching the prototype's recompute-on-setState).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  DashboardComposeRequest,
  DashboardDrillFilter,
  DashboardPatchRequest,
  DashboardListDto,
  SavedDashboardDto,
  SavedDashboardId,
  WidgetComposeRequest,
  WidgetId,
  WorkspaceId,
} from '@shared/types';

import type { QueryClient } from '@tanstack/react-query';

import {
  addWidget,
  createDashboard,
  deleteWidget,
  fetchDashboard,
  fetchDashboardList,
  patchDashboard,
  updateWidget,
} from './api';

export const dashboardListKey = (workspaceId: WorkspaceId | null) =>
  ['dashboards', 'list', workspaceId] as const;

export const dashboardKey = (
  dashboardId: SavedDashboardId | null,
  drill: DashboardDrillFilter | undefined,
) => ['dashboards', 'detail', dashboardId, drill ?? null] as const;

/** Dashboards the caller can see in a workspace (S17 + S32). Disabled until a workspace resolves. */
export function useDashboardList(workspaceId: WorkspaceId | null) {
  return useQuery<DashboardListDto>({
    queryKey: dashboardListKey(workspaceId),
    queryFn: ({ signal }) => fetchDashboardList(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** One dashboard resolved to the caller, optionally re-scoped by a drill filter (S6/S14/S12/S15/S16). */
export function useDashboard(dashboardId: SavedDashboardId | null, drill?: DashboardDrillFilter) {
  return useQuery<SavedDashboardDto>({
    queryKey: dashboardKey(dashboardId, drill),
    queryFn: ({ signal }) => fetchDashboard(dashboardId as SavedDashboardId, drill, signal),
    enabled: Boolean(dashboardId),
  });
}

/** Edit a shared dashboard's audience / name or retire it (S32). Invalidates the workspace list. */
export function usePatchDashboard(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<
    SavedDashboardDto,
    Error,
    { dashboardId: SavedDashboardId; request: DashboardPatchRequest }
  >({
    mutationFn: (input) => patchDashboard(input.dashboardId, input.request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardListKey(workspaceId) });
    },
  });
}

// After any composer write the API returns the recomposed dashboard: seed the detail cache for
// instant feedback (drill-off key — composed dashboards never drill) and refresh the switcher list.
function adoptComposed(
  queryClient: QueryClient,
  workspaceId: WorkspaceId | null,
  dashboard: SavedDashboardDto,
): void {
  queryClient.setQueryData(dashboardKey(dashboard.id, undefined), dashboard);
  void queryClient.invalidateQueries({ queryKey: dashboardListKey(workspaceId) });
}

/** Create a user-composed dashboard (S6 "New dashboard", slice 28). */
export function useCreateDashboard(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<SavedDashboardDto, Error, DashboardComposeRequest>({
    mutationFn: (request) => createDashboard(workspaceId as WorkspaceId, request),
    onSuccess: (dashboard) => adoptComposed(queryClient, workspaceId, dashboard),
  });
}

/** Append a widget to a composed dashboard (slice 28). */
export function useAddWidget(dashboardId: SavedDashboardId, workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<SavedDashboardDto, Error, WidgetComposeRequest>({
    mutationFn: (request) => addWidget(dashboardId, request),
    onSuccess: (dashboard) => adoptComposed(queryClient, workspaceId, dashboard),
  });
}

/** Update one widget on a composed dashboard (slice 28). */
export function useUpdateWidget(dashboardId: SavedDashboardId, workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<
    SavedDashboardDto,
    Error,
    { widgetId: WidgetId; request: WidgetComposeRequest }
  >({
    mutationFn: (input) => updateWidget(dashboardId, input.widgetId, input.request),
    onSuccess: (dashboard) => adoptComposed(queryClient, workspaceId, dashboard),
  });
}

/** Remove one widget from a composed dashboard (slice 28). */
export function useDeleteWidget(dashboardId: SavedDashboardId, workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<SavedDashboardDto, Error, WidgetId>({
    mutationFn: (widgetId) => deleteWidget(dashboardId, widgetId),
    onSuccess: (dashboard) => adoptComposed(queryClient, workspaceId, dashboard),
  });
}

/** Replace a composed dashboard's ordered widget list (reorder, slice 28). */
export function useReorderWidgets(dashboardId: SavedDashboardId, workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<SavedDashboardDto, Error, WidgetComposeRequest[]>({
    mutationFn: (widgets) => patchDashboard(dashboardId, { widgets }),
    onSuccess: (dashboard) => adoptComposed(queryClient, workspaceId, dashboard),
  });
}
