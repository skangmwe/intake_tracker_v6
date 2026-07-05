// TanStack Query hooks for typed links + Copy (S4/S5, S19) — web-state-management.md. Query keys are
// exported so pages and tests can target / invalidate precisely.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CopyRequest, CopyResult, RecordId, TypedLinkCreateRequest, TypedLinkDto, TypedLinkId } from '@shared/types';

import { addRecordLink, copyRecord, deleteRecordLink, fetchRecordLinks } from './api';

export const recordLinksKey = (recordId: RecordId) => ['record-links', recordId] as const;

/** A record's outgoing typed links (Relationships card). */
export function useRecordLinks(recordId: RecordId | undefined) {
  return useQuery<TypedLinkDto[]>({
    queryKey: recordId ? recordLinksKey(recordId) : ['record-links', 'disabled'],
    queryFn: ({ signal }) => fetchRecordLinks(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Add a typed link. Invalidates the links list + the record's activity thread. */
export function useAddLink(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<TypedLinkDto, unknown, TypedLinkCreateRequest>({
    mutationFn: (request) => addRecordLink(recordId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordLinksKey(recordId) });
      void queryClient.invalidateQueries({ queryKey: ['activity-thread', recordId] });
    },
  });
}

/** Remove a typed link. Invalidates the links list. */
export function useDeleteLink(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, TypedLinkId>({
    mutationFn: (linkId) => deleteRecordLink(linkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordLinksKey(recordId) });
    },
  });
}

/** Copy the record into a fresh draft. The caller navigates to the returned draft. */
export function useCopyRecord(recordId: RecordId) {
  return useMutation<CopyResult, unknown, CopyRequest>({
    mutationFn: (request) => copyRecord(recordId, request),
  });
}
