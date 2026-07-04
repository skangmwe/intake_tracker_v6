// Fields & objects API calls (S30) and platform field schema (S34) — api-contracts.md §18/§19.

import type {
  FieldDefinitionDto,
  FieldDefinitionUpsertRequest,
  FieldObjectType,
  PlatformFieldDto,
  PlatformFieldPatchRequest,
  TaskLibraryFieldDto,
  TaskLibraryFieldUpsertRequest,
  WorkspaceFieldSchemaDto,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

export function fetchWorkspaceFields(
  workspaceId: WorkspaceId,
  objectType: FieldObjectType,
  signal?: AbortSignal,
): Promise<WorkspaceFieldSchemaDto> {
  return apiFetch<WorkspaceFieldSchemaDto>(
    withQuery(`/v1/workspaces/${workspaceId}/fields`, { objectType }),
    signal ? { signal } : {},
  );
}

export function createField(
  workspaceId: WorkspaceId,
  request: FieldDefinitionUpsertRequest,
): Promise<FieldDefinitionDto> {
  return apiFetch<FieldDefinitionDto>(`/v1/workspaces/${workspaceId}/fields`, { method: 'POST', body: request });
}

export function updateField(
  workspaceId: WorkspaceId,
  fieldKey: string,
  request: FieldDefinitionUpsertRequest,
): Promise<FieldDefinitionDto> {
  return apiFetch<FieldDefinitionDto>(`/v1/workspaces/${workspaceId}/fields/${fieldKey}`, { method: 'PATCH', body: request });
}

export function retireField(
  workspaceId: WorkspaceId,
  fieldKey: string,
  objectType: FieldObjectType,
): Promise<void> {
  return apiFetch<void>(
    withQuery(`/v1/workspaces/${workspaceId}/fields/${fieldKey}/retire`, { objectType }),
    { method: 'POST' },
  );
}

export function fetchTaskLibrary(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<TaskLibraryFieldDto[]> {
  return apiFetch<TaskLibraryFieldDto[]>(`/v1/workspaces/${workspaceId}/task-fields`, signal ? { signal } : {});
}

export function createTaskLibraryField(
  workspaceId: WorkspaceId,
  request: TaskLibraryFieldUpsertRequest,
): Promise<FieldDefinitionDto> {
  return apiFetch<FieldDefinitionDto>(`/v1/workspaces/${workspaceId}/task-fields`, { method: 'POST', body: request });
}

export function fetchPlatformFields(signal?: AbortSignal): Promise<PlatformFieldDto[]> {
  return apiFetch<PlatformFieldDto[]>('/v1/platform/fields', signal ? { signal } : {});
}

export function updatePlatformField(
  fieldKey: string,
  request: PlatformFieldPatchRequest,
): Promise<PlatformFieldDto> {
  return apiFetch<PlatformFieldDto>(`/v1/platform/fields/${fieldKey}`, { method: 'PATCH', body: request });
}
