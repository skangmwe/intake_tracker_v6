// TanStack Query hooks for custom-object records (SP2). Server state only (web-state-management.md).
// Query-key factories are exported so pages and tests can target/invalidate precisely. The list key
// includes the object id and the full query so a filter/sort/page change refetches; the detail key
// (Slice C) is keyed by record id alone so a detail read is shared across surfaces.

import { useQuery } from '@tanstack/react-query';

import type {
  CustomRecordDto,
  CustomRecordListRow,
  PaginatedQuery,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { getRecord, queryRecords } from './api';

/** Key for a page of an object's records — includes the query so any change is a distinct cache entry. */
export const customRecordsListKey = (
  workspaceId: WorkspaceId,
  objectId: string,
  query: PaginatedQuery,
) => ['custom-records', workspaceId, objectId, query] as const;

/** Key for a single record (Slice C detail). */
export const customRecordKey = (recordId: string) =>
  ['custom-records', 'detail', recordId] as const;

/** A page of one custom object's records. Disabled until the object id is resolved. */
export function useCustomRecordsList(
  workspaceId: WorkspaceId | undefined,
  objectId: string | undefined,
  query: PaginatedQuery,
) {
  return useQuery<PaginatedResponse<CustomRecordListRow>>({
    queryKey: customRecordsListKey(workspaceId ?? ('' as WorkspaceId), objectId ?? '', query),
    queryFn: ({ signal }) =>
      queryRecords(workspaceId as WorkspaceId, objectId as string, query, signal),
    enabled: Boolean(workspaceId) && Boolean(objectId),
  });
}

/** One custom record in full (Slice C detail). Disabled until every id is resolved. */
export function useCustomRecord(
  workspaceId: WorkspaceId | undefined,
  objectId: string | undefined,
  recordId: string | undefined,
) {
  return useQuery<CustomRecordDto>({
    queryKey: customRecordKey(recordId ?? ''),
    queryFn: ({ signal }) =>
      getRecord(workspaceId as WorkspaceId, objectId as string, recordId as string, signal),
    enabled: Boolean(workspaceId) && Boolean(objectId) && Boolean(recordId),
  });
}
