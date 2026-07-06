// TanStack Query hooks for Saved Views (S24) — web-state-management.md. Query-key factories are
// exported so pages and tests can target/invalidate precisely. A view is scoped to one list surface
// via objectType, so the key includes it.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  SavedViewDto,
  SavedViewObjectType,
  SavedViewUpsertRequest,
  SavedViewId,
  WorkspaceId,
} from '@shared/types';

import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from './api';

export const savedViewsKey = (workspaceId: WorkspaceId, objectType: SavedViewObjectType) =>
  ['saved-views', workspaceId, objectType] as const;

/** Saved views the caller can see for one list surface (shared + own personal). */
export function useSavedViews(
  workspaceId: WorkspaceId | undefined,
  objectType: SavedViewObjectType,
) {
  return useQuery<SavedViewDto[]>({
    queryKey: workspaceId ? savedViewsKey(workspaceId, objectType) : ['saved-views', 'disabled'],
    queryFn: ({ signal }) => listSavedViews(workspaceId as WorkspaceId, objectType, signal),
    enabled: Boolean(workspaceId),
  });
}

/** Create a saved view. Invalidates the surface's list on success. */
export function useCreateSavedView(workspaceId: WorkspaceId, objectType: SavedViewObjectType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SavedViewUpsertRequest) => createSavedView(workspaceId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedViewsKey(workspaceId, objectType) });
    },
  });
}

/** Edit a saved view. Invalidates the surface's list on success. */
export function useUpdateSavedView(workspaceId: WorkspaceId, objectType: SavedViewObjectType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { savedViewId: SavedViewId; request: SavedViewUpsertRequest }) =>
      updateSavedView(input.savedViewId, input.request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedViewsKey(workspaceId, objectType) });
    },
  });
}

/** Soft-delete a saved view. Invalidates the surface's list on success. */
export function useDeleteSavedView(workspaceId: WorkspaceId, objectType: SavedViewObjectType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (savedViewId: SavedViewId) => deleteSavedView(savedViewId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedViewsKey(workspaceId, objectType) });
    },
  });
}
