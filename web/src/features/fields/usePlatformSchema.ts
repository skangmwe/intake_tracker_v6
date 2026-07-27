// TanStack Query hooks for the platform Objects / Fields / Relationships tabs (S34, B2; Global
// custom objects, SP3b). Server state only (web-state-management.md). Reads and mutations are
// enabled only for a platform admin; each hits a Platform-admin-gated endpoint that 403s for a
// non-admin. Object mutations invalidate the objects query so the list refreshes; field mutations
// on a Global custom object (Slice 2a, Task 6) invalidate both this object's full field list (used
// to seed an edit) and the platform field catalog (the flat Fields-tab table).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FieldDefinitionUpsertRequest,
  ObjectDefinitionCreateRequest,
  ObjectDefinitionPatchRequest,
} from '@shared/types';

import { PLATFORM_FIELD_CATALOG_QUERY_KEY } from './useFields';
import {
  createPlatformObject,
  createPlatformObjectField,
  deletePlatformObject,
  deletePlatformObjectField,
  fetchPlatformObjectFields,
  fetchPlatformObjects,
  fetchPlatformRelationships,
  updatePlatformObject,
  updatePlatformObjectField,
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

// ─── Fields on a Global custom object (SP3b Slice 2a, Task 6) ───────────────────────────────────

export const platformObjectFieldsQueryKey = (objectKey: string) =>
  ['platform-object-fields', objectKey] as const;

function invalidatePlatformObjectFields(
  queryClient: ReturnType<typeof useQueryClient>,
  objectKey: string,
) {
  void queryClient.invalidateQueries({ queryKey: platformObjectFieldsQueryKey(objectKey) });
  void queryClient.invalidateQueries({ queryKey: PLATFORM_FIELD_CATALOG_QUERY_KEY });
}

/**
 * The full stored field definitions (options/rules) on a Global custom object — used to seed the
 * editor before an edit, since the flat platform catalog row is lossy on options/rules and the
 * upsert replaces both wholesale. `objectKey === null` disables the query.
 */
export function usePlatformObjectFields(objectKey: string | null) {
  return useQuery({
    queryKey: platformObjectFieldsQueryKey(objectKey ?? ''),
    queryFn: ({ signal }) => fetchPlatformObjectFields(objectKey as string, signal),
    enabled: Boolean(objectKey),
  });
}

/** Create a field on a Global custom object, then refresh its field list and the platform catalog. */
export function useCreatePlatformObjectField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { objectKey: string; request: FieldDefinitionUpsertRequest }) =>
      createPlatformObjectField(input.objectKey, input.request),
    onSuccess: (_field, variables) =>
      invalidatePlatformObjectFields(queryClient, variables.objectKey),
  });
}

/** Patch a field on a Global custom object, then refresh its field list and the platform catalog. */
export function useUpdatePlatformObjectField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { objectKey: string; fieldKey: string; request: FieldDefinitionUpsertRequest }) =>
      updatePlatformObjectField(input.objectKey, input.fieldKey, input.request),
    onSuccess: (_field, variables) =>
      invalidatePlatformObjectFields(queryClient, variables.objectKey),
  });
}

/** Retire a field on a Global custom object, then refresh its field list and the platform catalog. */
export function useDeletePlatformObjectField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { objectKey: string; fieldKey: string }) =>
      deletePlatformObjectField(input.objectKey, input.fieldKey),
    onSuccess: (_result, variables) =>
      invalidatePlatformObjectFields(queryClient, variables.objectKey),
  });
}
