// TanStack Query hooks for the Objects tab (S30). Server state only (web-state-management.md);
// mutations invalidate the objects query so the list refreshes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ObjectDefinitionCreateRequest,
  ObjectDefinitionDto,
  ObjectDefinitionPatchRequest,
  WorkspaceId,
} from '@shared/types';

import { createObject, deleteObject, fetchObjects, updateObject } from './api';

export const objectsQueryKey = (workspaceId: WorkspaceId) => ['objects', workspaceId] as const;

export function useWorkspaceObjects(workspaceId: WorkspaceId | undefined) {
  return useQuery<ObjectDefinitionDto[]>({
    queryKey: objectsQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchObjects(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** Create (new custom object) or patch (edit an existing custom object) in one mutation. */
export type SaveObjectInput =
  | { isCreate: true; objectId: null; request: ObjectDefinitionCreateRequest }
  | { isCreate: false; objectId: string; request: ObjectDefinitionPatchRequest };

export function useSaveObject(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveObjectInput) =>
      input.isCreate
        ? createObject(workspaceId, input.request)
        : updateObject(input.objectId, workspaceId, input.request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectsQueryKey(workspaceId) }),
  });
}

export function useDeleteObject(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objectId: string) => deleteObject(objectId, workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectsQueryKey(workspaceId) }),
  });
}
