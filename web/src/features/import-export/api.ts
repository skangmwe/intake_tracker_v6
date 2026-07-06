// Import/Export API calls (S28 — api-contracts.md §17). CSV upload posts multipart form data (the
// browser sets the multipart boundary — apiFetch skips Content-Type for a FormData body); the status
// poll is a plain GET; the export posts a saved-view id and reads back a CSV Blob (apiFetchBlobPost so
// the bearer token rides along a download).

import type { ImportStatusDto, ImportStartResponse, SavedViewId, WorkspaceId } from '@shared/types';

import { apiFetch, apiFetchBlobPost } from '@/shared/http/apiClient';

export function startImport(workspaceId: WorkspaceId, file: File): Promise<ImportStartResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  return apiFetch<ImportStartResponse>(`/v1/workspaces/${workspaceId}/imports/csv`, {
    method: 'POST',
    body: form,
  });
}

export function fetchImportStatus(importId: string, signal?: AbortSignal): Promise<ImportStatusDto> {
  return apiFetch<ImportStatusDto>(`/v1/imports/${importId}`, signal ? { signal } : {});
}

export function exportView(savedViewId: SavedViewId, signal?: AbortSignal): Promise<Blob> {
  return apiFetchBlobPost('/v1/exports', { savedViewId }, signal);
}
