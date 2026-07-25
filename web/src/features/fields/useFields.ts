// TanStack Query hooks for the field schema (S30) and platform field schema (S34). Server state
// only (web-state-management.md); mutations invalidate the affected query so the surface refreshes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FieldDefinitionUpsertRequest,
  FieldObjectType,
  FieldObjectTypeOrSlug,
  PlatformFieldPatchRequest,
  TaskLibraryFieldUpsertRequest,
  WorkspaceFieldCatalogDto,
  WorkspaceFieldSchemaDto,
  WorkspaceId,
} from '@shared/types';

import {
  createField,
  createTaskLibraryField,
  fetchFieldCatalog,
  fetchPlatformFieldCatalog,
  fetchPlatformFields,
  fetchTaskLibrary,
  fetchWorkspaceFields,
  retireField,
  updateField,
  updatePlatformField,
} from './api';

export const fieldsQueryKey = (workspaceId: WorkspaceId, objectType: FieldObjectTypeOrSlug) =>
  ['fields', workspaceId, objectType] as const;

/** Broad key matching every object-type schema for a workspace — invalidated on any field write. */
export const fieldsWorkspaceKey = (workspaceId: WorkspaceId) => ['fields', workspaceId] as const;

export const fieldCatalogQueryKey = (workspaceId: WorkspaceId) =>
  ['field-catalog', workspaceId] as const;

export const taskLibraryQueryKey = (workspaceId: WorkspaceId) =>
  ['task-fields', workspaceId] as const;

export const PLATFORM_FIELDS_QUERY_KEY = ['platform-fields'] as const;

export const PLATFORM_FIELD_CATALOG_QUERY_KEY = ['platform-field-catalog'] as const;

export function useWorkspaceFields(
  workspaceId: WorkspaceId | undefined,
  objectType: FieldObjectTypeOrSlug,
) {
  return useQuery<WorkspaceFieldSchemaDto>({
    queryKey: fieldsQueryKey(workspaceId ?? ('' as WorkspaceId), objectType),
    queryFn: ({ signal }) => fetchWorkspaceFields(workspaceId as WorkspaceId, objectType, signal),
    enabled: Boolean(workspaceId),
  });
}

/** The flat, all-object-types field catalog behind the reconciled S30 Fields tab. */
export function useFieldCatalog(workspaceId: WorkspaceId | undefined) {
  return useQuery<WorkspaceFieldCatalogDto>({
    queryKey: fieldCatalogQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchFieldCatalog(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

interface FieldMutationInput {
  fieldKey: string;
  request: FieldDefinitionUpsertRequest;
  isCreate: boolean;
}

interface RetireFieldInput {
  fieldKey: string;
  objectType: FieldObjectType;
}

/** Invalidate every object-type schema and the flat catalog after any field write. */
function invalidateFields(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: WorkspaceId,
) {
  void queryClient.invalidateQueries({ queryKey: fieldsWorkspaceKey(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: fieldCatalogQueryKey(workspaceId) });
}

export function useSaveField(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, request, isCreate }: FieldMutationInput) =>
      isCreate ? createField(workspaceId, request) : updateField(workspaceId, fieldKey, request),
    onSuccess: () => invalidateFields(queryClient, workspaceId),
  });
}

export function useRetireField(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, objectType }: RetireFieldInput) =>
      retireField(workspaceId, fieldKey, objectType),
    onSuccess: () => invalidateFields(queryClient, workspaceId),
  });
}

export function useTaskLibrary(workspaceId: WorkspaceId | undefined) {
  return useQuery({
    queryKey: taskLibraryQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchTaskLibrary(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useAddTaskLibraryField(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TaskLibraryFieldUpsertRequest) =>
      createTaskLibraryField(workspaceId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskLibraryQueryKey(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: fieldsQueryKey(workspaceId, 'Task') });
      void queryClient.invalidateQueries({ queryKey: fieldCatalogQueryKey(workspaceId) });
    },
  });
}

export function usePlatformFields(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_FIELDS_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformFields(signal),
    enabled,
  });
}

/** The flat platform Fields-tab catalog (S34) behind the Platform Fields & objects screen. */
export function usePlatformFieldCatalog(enabled = true) {
  return useQuery({
    queryKey: PLATFORM_FIELD_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => fetchPlatformFieldCatalog(signal),
    enabled,
  });
}

interface PlatformFieldMutationInput {
  fieldKey: string;
  request: PlatformFieldPatchRequest;
}

export function useUpdatePlatformField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, request }: PlatformFieldMutationInput) =>
      updatePlatformField(fieldKey, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_FIELDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PLATFORM_FIELD_CATALOG_QUERY_KEY });
    },
  });
}
