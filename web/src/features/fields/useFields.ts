// TanStack Query hooks for the field schema (S30) and platform field schema (S34). Server state
// only (web-state-management.md); mutations invalidate the affected query so the surface refreshes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FieldDefinitionUpsertRequest,
  FieldObjectType,
  PlatformFieldPatchRequest,
  TaskLibraryFieldUpsertRequest,
  WorkspaceFieldSchemaDto,
  WorkspaceId,
} from '@shared/types';

import {
  createField,
  createTaskLibraryField,
  fetchPlatformFields,
  fetchTaskLibrary,
  fetchWorkspaceFields,
  retireField,
  updateField,
  updatePlatformField,
} from './api';

export const fieldsQueryKey = (workspaceId: WorkspaceId, objectType: FieldObjectType) =>
  ['fields', workspaceId, objectType] as const;

export const taskLibraryQueryKey = (workspaceId: WorkspaceId) => ['task-fields', workspaceId] as const;

export const PLATFORM_FIELDS_QUERY_KEY = ['platform-fields'] as const;

export function useWorkspaceFields(workspaceId: WorkspaceId | undefined, objectType: FieldObjectType) {
  return useQuery<WorkspaceFieldSchemaDto>({
    queryKey: fieldsQueryKey(workspaceId ?? ('' as WorkspaceId), objectType),
    queryFn: ({ signal }) => fetchWorkspaceFields(workspaceId as WorkspaceId, objectType, signal),
    enabled: Boolean(workspaceId),
  });
}

interface FieldMutationInput {
  fieldKey: string;
  request: FieldDefinitionUpsertRequest;
  isCreate: boolean;
}

export function useSaveField(workspaceId: WorkspaceId, objectType: FieldObjectType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, request, isCreate }: FieldMutationInput) =>
      isCreate ? createField(workspaceId, request) : updateField(workspaceId, fieldKey, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fieldsQueryKey(workspaceId, objectType) }),
  });
}

export function useRetireField(workspaceId: WorkspaceId, objectType: FieldObjectType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fieldKey: string) => retireField(workspaceId, fieldKey, objectType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fieldsQueryKey(workspaceId, objectType) }),
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
    mutationFn: (request: TaskLibraryFieldUpsertRequest) => createTaskLibraryField(workspaceId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskLibraryQueryKey(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: fieldsQueryKey(workspaceId, 'Task') });
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

interface PlatformFieldMutationInput {
  fieldKey: string;
  request: PlatformFieldPatchRequest;
}

export function useUpdatePlatformField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, request }: PlatformFieldMutationInput) => updatePlatformField(fieldKey, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_FIELDS_QUERY_KEY }),
  });
}
