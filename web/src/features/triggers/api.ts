// Trigger admin CRUD calls (slice: triggers-request-authoring, Task 2.3). All endpoints are
// WorkspaceAdmin-gated server-side and scoped to the workspace; the list is small bounded config and
// returns every trigger with its full conditions, so the editor edits a list row directly — no
// separate by-id fetch. Mirrors the TriggersController routes.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import type { TriggerDto, TriggerUpsertRequest } from './types';

export function fetchTriggers(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<TriggerDto[]> {
  return apiFetch<TriggerDto[]>(
    `/v1/workspaces/${workspaceId}/triggers`,
    signal ? { signal } : {},
  );
}

export function createTrigger(
  workspaceId: WorkspaceId,
  request: TriggerUpsertRequest,
): Promise<TriggerDto> {
  return apiFetch<TriggerDto>(`/v1/workspaces/${workspaceId}/triggers`, {
    method: 'POST',
    body: request,
  });
}

export function updateTrigger(
  workspaceId: WorkspaceId,
  triggerId: string,
  request: TriggerUpsertRequest,
): Promise<TriggerDto> {
  return apiFetch<TriggerDto>(`/v1/workspaces/${workspaceId}/triggers/${triggerId}`, {
    method: 'PUT',
    body: request,
  });
}

export function deleteTrigger(workspaceId: WorkspaceId, triggerId: string): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/triggers/${triggerId}`, {
    method: 'DELETE',
  });
}
