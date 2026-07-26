// TanStack Query hooks for the platform Objects / Relationships tabs (S34, B2; Global custom objects,
// SP3b). Server state only (web-state-management.md). Reads and mutations are enabled only for a
// platform admin; each hits a Platform-admin-gated endpoint that 403s for a non-admin. Object
// mutations invalidate the objects query so the list refreshes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ObjectDefinitionCreateRequest,
  ObjectDefinitionPatchRequest,
} from '@shared/types';

import {
  createPlatformObject,
  deletePlatformObject,
  fetchPlatformObjects,
  fetchPlatformRelationships,
  updatePlatformObject,
} from './platformSchema';

export const PLATFORM_OBJECTS_QUERY_KEY = ['platform-objects'] as const;

export const PLATFORM_RELATIONSHIPS_QUERY_KEY = ['platform-relationships'] as const;

/** Every Global object type (built-ins + Global custom) behind the S34 Objects tab. */
export function usePlatformObjects(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_OBJECTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformObjects(signal),
    enabled,
  });
}

/** Create a Global custom object, then refresh the objects list. */
export function useCreatePlatformObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ObjectDefinitionCreateRequest) => createPlatformObject(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_OBJECTS_QUERY_KEY }),
  });
}

/** Patch a Global custom object, then refresh the objects list. */
export function useUpdatePlatformObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { objectId: string; request: ObjectDefinitionPatchRequest }) =>
      updatePlatformObject(input.objectId, input.request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_OBJECTS_QUERY_KEY }),
  });
}

/** Soft-delete a Global custom object, then refresh the objects list. */
export function useDeletePlatformObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objectId: string) => deletePlatformObject(objectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_OBJECTS_QUERY_KEY }),
  });
}

/** The canonical system-seeded relationships behind the read-only S34 Relationships tab. */
export function usePlatformRelationships(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_RELATIONSHIPS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformRelationships(signal),
    enabled,
  });
}
