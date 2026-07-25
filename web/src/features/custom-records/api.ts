// Custom-object records API calls (SP2). Thin apiFetch wrappers over the SP1 records endpoints:
// a POST /query for the paginated list (filters/sort travel in the body per api/CLAUDE.md — never a
// query string) and a GET by id for the detail (Slice C). apiFetch prefixes `/api` itself.

import type {
  CustomRecordDto,
  CustomRecordListRow,
  CustomRecordWriteRequest,
  PaginatedQuery,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** Page the records of one custom object, applying the query's filters/sort server-side. */
export function queryRecords(
  workspaceId: WorkspaceId,
  objectId: string,
  query: PaginatedQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<CustomRecordListRow>> {
  return apiFetch<PaginatedResponse<CustomRecordListRow>>(
    `/v1/workspaces/${workspaceId}/objects/${objectId}/records/query`,
    { method: 'POST', body: query, ...(signal ? { signal } : {}) },
  );
}

/** Read one custom record in full (Slice C detail; the list page never calls this). */
export function getRecord(
  workspaceId: WorkspaceId,
  objectId: string,
  recordId: string,
  signal?: AbortSignal,
): Promise<CustomRecordDto> {
  return apiFetch<CustomRecordDto>(
    `/v1/workspaces/${workspaceId}/objects/${objectId}/records/${recordId}`,
    signal ? { signal } : {},
  );
}

/** Create a record of one custom object. Returns the full record (Slice C create form). */
export function createRecord(
  workspaceId: WorkspaceId,
  objectId: string,
  body: CustomRecordWriteRequest,
): Promise<CustomRecordDto> {
  return apiFetch<CustomRecordDto>(
    `/v1/workspaces/${workspaceId}/objects/${objectId}/records`,
    { method: 'POST', body },
  );
}

/** Replace a record's name + full field map (Slice C detail autosave — last-write-wins, no If-Match). */
export function patchRecord(
  workspaceId: WorkspaceId,
  objectId: string,
  recordId: string,
  body: CustomRecordWriteRequest,
): Promise<CustomRecordDto> {
  return apiFetch<CustomRecordDto>(
    `/v1/workspaces/${workspaceId}/objects/${objectId}/records/${recordId}`,
    { method: 'PATCH', body },
  );
}

/** Soft-delete a custom record (Slice C — list kebab + detail header). */
export function deleteRecord(
  workspaceId: WorkspaceId,
  objectId: string,
  recordId: string,
): Promise<void> {
  return apiFetch<void>(
    `/v1/workspaces/${workspaceId}/objects/${objectId}/records/${recordId}`,
    { method: 'DELETE' },
  );
}
