// TanStack Query hooks for Dashboards (slice 23 — web-state-management.md). Query-key factories are
// exported so pages and tests can target/invalidate precisely. The by-id read is keyed by both the
// dashboard id and the active drill filter, so a drill-through is a distinct cache entry and a click
// refetches (matching the prototype's recompute-on-setState).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  DashboardDrillFilter,
  DashboardPatchRequest,
  DashboardListDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { fetchDashboard, fetchDashboardList, patchDashboard } from './api';

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
export function useDashboard(
  dashboardId: SavedDashboardId | null,
  drill?: DashboardDrillFilter,
) {
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
