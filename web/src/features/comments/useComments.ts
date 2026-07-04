// TanStack Query hooks for the activity thread (S4/S5 Activity tab) — web-state-management.md.
// The thread invalidates itself after a comment posts so the new comment appears immediately.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ActivityThreadItem, CommentCreateRequest, CommentDto, RecordId } from '@shared/types';

import { fetchThread, postComment } from './api';

export const threadKey = (recordId: RecordId) => ['thread', recordId] as const;

/** The interleaved activity thread for a record. Access-respecting server-side. */
export function useThread(recordId: RecordId | undefined) {
  return useQuery<ActivityThreadItem[]>({
    queryKey: recordId ? threadKey(recordId) : ['thread', 'disabled'],
    queryFn: ({ signal }) => fetchThread(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Post an immutable comment; refresh the thread on success. */
export function usePostComment(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<CommentDto, Error, CommentCreateRequest>({
    mutationFn: (request) => postComment(recordId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey(recordId) });
    },
  });
}
