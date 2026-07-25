// TanStack Query hooks for custom-object records (SP2). Server state only (web-state-management.md).
// Query-key factories are exported so pages and tests can target/invalidate precisely. The list key
// includes the object id and the full query so a filter/sort/page change refetches; the detail key
// (Slice C) is keyed by record id alone so a detail read is shared across surfaces.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CustomRecordDto,
  CustomRecordListRow,
  CustomRecordWriteRequest,
  PaginatedQuery,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import { createRecord, deleteRecord, getRecord, patchRecord, queryRecords } from './api';

/** Prefix key for every page of one object's records — mutations invalidate this to refetch lists. */
const objectRecordsKey = (workspaceId: WorkspaceId, objectId: string) =>
  ['custom-records', workspaceId, objectId] as const;

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

/** Create a record of one custom object (Slice C create form). Invalidates that object's lists. */
export function useCreateCustomRecord(workspaceId: WorkspaceId, objectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomRecordWriteRequest) => createRecord(workspaceId, objectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: objectRecordsKey(workspaceId, objectId) });
    },
  });
}

/** Replace a record (Slice C detail autosave). Adopts the fresh record; invalidates that object's lists. */
export function usePatchCustomRecord(workspaceId: WorkspaceId, objectId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomRecordWriteRequest) => patchRecord(workspaceId, objectId, recordId, body),
    onSuccess: (fresh) => {
      queryClient.setQueryData(customRecordKey(recordId), fresh);
      void queryClient.invalidateQueries({ queryKey: objectRecordsKey(workspaceId, objectId) });
    },
  });
}

/** Soft-delete a custom record (Slice C — list kebab + detail header). Takes the record id at call time. */
export function useDeleteCustomRecord(workspaceId: WorkspaceId, objectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => deleteRecord(workspaceId, objectId, recordId),
    onSuccess: (_result, recordId) => {
      void queryClient.invalidateQueries({ queryKey: objectRecordsKey(workspaceId, objectId) });
      void queryClient.invalidateQueries({ queryKey: customRecordKey(recordId) });
    },
  });
}
