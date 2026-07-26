// Import/Export API calls (S28 — api-contracts.md §17). CSV upload posts multipart form data (the
// browser sets the multipart boundary — apiFetch skips Content-Type for a FormData body), now carrying
// the target object type and the wizard's column→field mapping; the status poll is a plain GET; the
// exports read back a CSV Blob (apiFetchBlobPost so the bearer token rides along a download). The IO
// object catalog drives the wizards' object + field pickers.

import type {
  ImportColumnMapping,
  ImportMode,
  ImportStatusDto,
  ImportStartResponse,
  IoObjectDto,
  ObjectExportRequest,
  SavedViewId,
  WorkspaceId,
} from '@shared/types';

import { apiFetch, apiFetchBlobPost } from '@/shared/http/apiClient';

/** Start a CSV import. `objectType` + `mapping` drive the wizard path; omit both for header auto-match. */
export function startImport(
  workspaceId: WorkspaceId,
  file: File,
  objectType?: string,
  mapping?: ImportColumnMapping[],
  mode?: ImportMode,
): Promise<ImportStartResponse> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (objectType) {
    form.append('objectType', objectType);
  }
  if (mapping && mapping.length > 0) {
    form.append('mapping', JSON.stringify(mapping));
  }
  if (mode && mode !== 'create') {
    form.append('mode', mode);
  }
  return apiFetch<ImportStartResponse>(`/v1/workspaces/${workspaceId}/imports/csv`, {
    method: 'POST',
    body: form,
  });
}

export function fetchImportStatus(
  importId: string,
  signal?: AbortSignal,
): Promise<ImportStatusDto> {
  return apiFetch<ImportStatusDto>(`/v1/imports/${importId}`, signal ? { signal } : {});
}

/** The importable/exportable object catalog for a workspace (drives the wizards' pickers). */
export function fetchIoObjects(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<IoObjectDto[]> {
  return apiFetch<IoObjectDto[]>(
    `/v1/workspaces/${workspaceId}/io/objects`,
    signal ? { signal } : {},
  );
}

export function exportView(savedViewId: SavedViewId, signal?: AbortSignal): Promise<Blob> {
  return apiFetchBlobPost('/v1/exports', { savedViewId }, signal);
}

/** Export an object's chosen columns as a CSV Blob (the export wizard). */
export function exportObject(
  workspaceId: WorkspaceId,
  request: ObjectExportRequest,
  signal?: AbortSignal,
): Promise<Blob> {
  return apiFetchBlobPost(`/v1/workspaces/${workspaceId}/exports/object`, request, signal);
}
