// TanStack Query hooks for watchers (S4/S5 Watchers & alerts tab — web-state-management.md). The
// roster query drives the card; the toggle mutation subscribes or unsubscribes the caller based on
// the current state and invalidates the roster on success. Query key is exported for tests.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  RecordId,
  UserId,
  WatcherListDto,
  WatcherPreferencesPatchRequest,
} from '@shared/types';

import { fetchWatchers, patchMyWatch, unwatchRecord, watchRecord } from './api';

export const recordWatchersKey = (recordId: RecordId) => ['record-watchers', recordId] as const;

/** A record's watchers + the caller's own subscription state. */
export function useRecordWatchers(recordId: RecordId | undefined) {
  return useQuery<WatcherListDto>({
    queryKey: recordId ? recordWatchersKey(recordId) : ['record-watchers', 'disabled'],
    queryFn: ({ signal }) => fetchWatchers(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Variables for the watch toggle: whether to watch, and the caller's id (for the unsubscribe URL). */
export interface WatchToggleVars {
  watch: boolean;
  userId: UserId;
}

/** Subscribe / unsubscribe the caller. Invalidates the roster so the toggle + list refresh. */
export function useWatchToggle(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, WatchToggleVars>({
    mutationFn: ({ watch, userId }) => (watch ? watchRecord(recordId) : unwatchRecord(recordId, userId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordWatchersKey(recordId) });
    },
  });
}

/**
 * Slice 26 — sparse patch of the caller's own state (subscribe toggle + five per-record preferences).
 * Adopts the refreshed roster into the cache so the card renders with the new state immediately.
 */
export function usePatchMyWatch(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<WatcherListDto, unknown, WatcherPreferencesPatchRequest>({
    mutationFn: (request) => patchMyWatch(recordId, request),
    onSuccess: (fresh) => {
      queryClient.setQueryData(recordWatchersKey(recordId), fresh);
    },
  });
}
