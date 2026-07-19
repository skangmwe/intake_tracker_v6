// Toolkit API calls (S43) — v2-reconciliation.md §API deltas Toolkit. One thin wrapper per endpoint.
// Create and patch send multipart/form-data — a JSON `payload` part plus an optional `file` part —
// so an item can be created/edited with a pasted body and/or an uploaded asset in one call. The
// attachment download goes through apiFetchBlob (a bearer token can't ride a plain <a href>).

import type {
  ToolkitItemCreateRequest,
  ToolkitItemDto,
  ToolkitItemId,
  ToolkitItemPatchRequest,
  ToolkitListResponse,
  ToolkitQuery,
  WorkspaceId,
} from '@shared/types';

import { apiFetch, apiFetchBlob } from '@/shared/http/apiClient';

export function queryToolkit(
  workspaceId: WorkspaceId,
  query: ToolkitQuery,
  signal?: AbortSignal,
): Promise<ToolkitListResponse> {
  return apiFetch<ToolkitListResponse>(`/v1/workspaces/${workspaceId}/toolkit/query`, {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

export function fetchToolkitItem(itemId: ToolkitItemId, signal?: AbortSignal): Promise<ToolkitItemDto> {
  return apiFetch<ToolkitItemDto>(`/v1/toolkit/${itemId}`, signal ? { signal } : {});
}

function buildFormData(payload: unknown, file: File | null): FormData {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  if (file) form.append('file', file);
  return form;
}

export function createToolkitItem(
  workspaceId: WorkspaceId,
  request: ToolkitItemCreateRequest,
  file: File | null,
): Promise<ToolkitItemDto> {
  return apiFetch<ToolkitItemDto>(`/v1/workspaces/${workspaceId}/toolkit`, {
    method: 'POST',
    body: buildFormData(request, file),
  });
}

export function patchToolkitItem(
  itemId: ToolkitItemId,
  request: ToolkitItemPatchRequest,
  file: File | null,
): Promise<ToolkitItemDto> {
  return apiFetch<ToolkitItemDto>(`/v1/toolkit/${itemId}`, {
    method: 'PATCH',
    body: buildFormData(request, file),
    ...(request.ifMatch ? { ifMatch: request.ifMatch } : {}),
  });
}

export function downloadToolkitAttachment(itemId: ToolkitItemId, signal?: AbortSignal): Promise<Blob> {
  return apiFetchBlob(`/v1/toolkit/${itemId}/attachment`, signal);
}
