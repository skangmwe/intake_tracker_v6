// Objects tab API calls (S30 Fields & objects → Objects). The list returns the five built-in
// objects (with live counts) plus the workspace's custom objects; writes affect custom objects only.

import type {
  ObjectDefinitionCreateRequest,
  ObjectDefinitionDto,
  ObjectDefinitionPatchRequest,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

export function fetchObjects(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<ObjectDefinitionDto[]> {
  return apiFetch<ObjectDefinitionDto[]>(
    `/v1/workspaces/${workspaceId}/objects`,
    signal ? { signal } : {},
  );
}

export function createObject(
  workspaceId: WorkspaceId,
  request: ObjectDefinitionCreateRequest,
): Promise<ObjectDefinitionDto> {
  return apiFetch<ObjectDefinitionDto>(`/v1/workspaces/${workspaceId}/objects`, {
    method: 'POST',
    body: request,
  });
}

export function updateObject(
  objectId: string,
  workspaceId: WorkspaceId,
  request: ObjectDefinitionPatchRequest,
): Promise<ObjectDefinitionDto> {
  return apiFetch<ObjectDefinitionDto>(withQuery(`/v1/objects/${objectId}`, { workspaceId }), {
    method: 'PATCH',
    body: request,
  });
}

export function deleteObject(objectId: string, workspaceId: WorkspaceId): Promise<void> {
  return apiFetch<void>(withQuery(`/v1/objects/${objectId}`, { workspaceId }), {
    method: 'DELETE',
  });
}
