// TanStack Query hooks for Requests (S2/S3/S4) — web-state-management.md.
// Query-key factories are exported so pages and tests can target/invalidate precisely.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  PaginatedQuery,
  PaginatedResponse,
  RecordId,
  RequestCreateRequest,
  RequestDto,
  RequestListRow,
  RequestPatchRequest,
  SimilarRequestDto,
  WorkspaceId,
} from '@shared/types';

import { SIMILAR_MIN_QUERY_LENGTH } from '@/shared/constants';

import {
  createRequest,
  fetchRequest,
  findSimilarRequests,
  patchRequest,
  queryRequests,
  setRequestHold,
  setRequestStage,
} from './api';

export const requestsListKey = (workspaceId: WorkspaceId, query: PaginatedQuery) =>
  ['requests', workspaceId, query] as const;

export const requestKey = (recordId: RecordId) => ['request', recordId] as const;

/** The Requests list (S2). Access-respecting, paginated, filtered/sorted server-side. */
export function useRequestsList(workspaceId: WorkspaceId | undefined, query: PaginatedQuery) {
  return useQuery<PaginatedResponse<RequestListRow>>({
    queryKey: workspaceId ? requestsListKey(workspaceId, query) : ['requests', 'disabled'],
    queryFn: ({ signal }) => queryRequests(workspaceId as WorkspaceId, query, signal),
    enabled: Boolean(workspaceId),
  });
}

export const similarRequestsKey = (workspaceId: WorkspaceId, query: string) =>
  ['requests', workspaceId, 'similar', query] as const;

/**
 * Intake similar-requests nudge (S3). The caller passes an already-debounced query; the hook only
 * fires once it clears the minimum length. `keepPreviousData` avoids a flash to empty between
 * keystrokes. Access-respecting + workspace-scoped server-side.
 */
export function useSimilarRequests(workspaceId: WorkspaceId | undefined, query: string) {
  const trimmed = query.trim();
  const enabled = Boolean(workspaceId) && trimmed.length >= SIMILAR_MIN_QUERY_LENGTH;
  return useQuery<SimilarRequestDto[]>({
    queryKey: workspaceId ? similarRequestsKey(workspaceId, trimmed) : ['requests', 'similar', 'disabled'],
    queryFn: ({ signal }) => findSimilarRequests(workspaceId as WorkspaceId, trimmed, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** A single record (S4). */
export function useRequest(recordId: RecordId | undefined) {
  return useQuery<RequestDto>({
    queryKey: recordId ? requestKey(recordId) : ['request', 'disabled'],
    queryFn: ({ signal }) => fetchRequest(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Create a Request (S3 submit). Invalidates the workspace's list on success. */
export function useCreateRequest(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RequestCreateRequest) => createRequest(workspaceId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests', workspaceId] });
    },
  });
}

/** Edit a Request (S4 Intake tab autosave). Adopts the fresh record; invalidates lists. */
export function usePatchRequest(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RequestPatchRequest) => patchRequest(recordId, request),
    onSuccess: (fresh) => {
      queryClient.setQueryData(requestKey(recordId), fresh);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

/**
 * Move a Request to a new stage (S4 stepper). A gated transition opens an approval gate instead of
 * advancing (the result's `advanced` is false with the opened gate) — invalidate the gates query so
 * it surfaces on the Tasks & gates tab (slice 8).
 */
export function useSetStage(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (toStage: string) => setRequestStage(recordId, toStage),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: requestKey(recordId) });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-requests', recordId] });
    },
  });
}

/** Set/clear the Hold flag (S4 Status tab). */
export function useSetHold(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { held: boolean; reason?: string }) =>
      setRequestHold(recordId, input.held, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: requestKey(recordId) });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
