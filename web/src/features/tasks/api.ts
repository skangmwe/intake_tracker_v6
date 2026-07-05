// Tasks API calls (S4/S5 Tasks & gates tab) — api-contracts.md §5. One thin apiFetch wrapper per
// endpoint; the /api prefix is added inside apiFetch. Create always resolves to an array (a single
// task is a one-element array) so callers handle one shape.

import type {
  PromoteToRequestResult,
  RecordId,
  TaskBundleTemplate,
  TaskCreateRequest,
  TaskDto,
  TaskPatchRequest,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function fetchTasks(recordId: RecordId, signal?: AbortSignal): Promise<TaskDto[]> {
  return apiFetch<TaskDto[]>(`/v1/requests/${recordId}/tasks`, signal ? { signal } : {});
}

export function createTasks(recordId: RecordId, request: TaskCreateRequest): Promise<TaskDto[]> {
  return apiFetch<TaskDto[]>(`/v1/requests/${recordId}/tasks`, { method: 'POST', body: request });
}

export function patchTask(taskId: string, request: TaskPatchRequest): Promise<TaskDto> {
  return apiFetch<TaskDto>(`/v1/tasks/${taskId}`, { method: 'PATCH', body: request });
}

export function fetchTaskBundles(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<TaskBundleTemplate[]> {
  return apiFetch<TaskBundleTemplate[]>(`/v1/workspaces/${workspaceId}/task-bundles`, signal ? { signal } : {});
}

/** Promote a task to its own Request — copies the parent to a draft, cancels the task (BS §5). */
export function promoteTaskToRequest(taskId: string): Promise<PromoteToRequestResult> {
  return apiFetch<PromoteToRequestResult>(`/v1/tasks/${taskId}/promote-to-request`, { method: 'POST' });
}
