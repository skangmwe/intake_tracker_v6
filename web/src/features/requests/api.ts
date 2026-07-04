// Requests + Drafts API calls (S2/S3/S4/S26) — api-contracts.md §3, §17.
// One thin apiFetch wrapper per endpoint; the /api prefix is added inside apiFetch.

import type {
  DraftDto,
  DraftListRow,
  DraftSaveRequest,
  DraftId,
  PaginatedQuery,
  PaginatedResponse,
  RecordId,
  RequestCreateRequest,
  RequestDto,
  RequestListRow,
  RequestPatchRequest,
  StageTransitionResult,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

// ─── Requests ───

export function createRequest(
  workspaceId: WorkspaceId,
  request: RequestCreateRequest,
): Promise<RequestDto> {
  return apiFetch<RequestDto>(`/v1/workspaces/${workspaceId}/requests`, { method: 'POST', body: request });
}

export function queryRequests(
  workspaceId: WorkspaceId,
  query: PaginatedQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<RequestListRow>> {
  return apiFetch<PaginatedResponse<RequestListRow>>(`/v1/workspaces/${workspaceId}/requests/query`, {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

export function fetchRequest(recordId: RecordId, signal?: AbortSignal): Promise<RequestDto> {
  return apiFetch<RequestDto>(`/v1/requests/${recordId}`, signal ? { signal } : {});
}

export function patchRequest(recordId: RecordId, request: RequestPatchRequest): Promise<RequestDto> {
  return apiFetch<RequestDto>(`/v1/requests/${recordId}`, {
    method: 'PATCH',
    body: request,
    ifMatch: request.ifMatch,
  });
}

export function setRequestStage(recordId: RecordId, toStage: string): Promise<StageTransitionResult> {
  return apiFetch<StageTransitionResult>(`/v1/requests/${recordId}/stage`, {
    method: 'POST',
    body: { toStage },
  });
}

export function setRequestHold(
  recordId: RecordId,
  held: boolean,
  reason?: string,
): Promise<void> {
  return apiFetch<void>(`/v1/requests/${recordId}/hold`, { method: 'POST', body: { held, reason } });
}

// ─── Drafts (S26) ───

export function saveDraft(workspaceId: WorkspaceId, request: DraftSaveRequest): Promise<DraftDto> {
  return apiFetch<DraftDto>(`/v1/workspaces/${workspaceId}/drafts`, { method: 'POST', body: request });
}

export function fetchDrafts(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<DraftListRow[]> {
  return apiFetch<DraftListRow[]>(`/v1/workspaces/${workspaceId}/drafts`, signal ? { signal } : {});
}

export function fetchDraft(draftId: DraftId, signal?: AbortSignal): Promise<DraftDto> {
  return apiFetch<DraftDto>(`/v1/drafts/${draftId}`, signal ? { signal } : {});
}

export function deleteDraft(draftId: DraftId): Promise<void> {
  return apiFetch<void>(`/v1/drafts/${draftId}`, { method: 'DELETE' });
}
