// TanStack hooks for the duplicate check (server state only — web-state-management.md). The candidate query is
// on-demand: it stays disabled until the caller opens the matches panel (`active`), so no provider work runs
// until the user asks. The confirm mutation invalidates the record so it refetches into its closed state.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecordId, WorkspaceId } from '@shared/types';

import { requestKey } from '@/features/requests/useRequests';

import { checkDuplicates, confirmDuplicate } from './api';
import type { ConfirmDuplicateRequest, DuplicateCandidate } from './types';

export const duplicateCheckKey = (workspaceId: WorkspaceId, recordId: string) =>
  ['duplicate-check', workspaceId, recordId] as const;

export function useDuplicateCheck(workspaceId: WorkspaceId, recordId: string, active: boolean) {
  return useQuery<DuplicateCandidate[]>({
    queryKey: duplicateCheckKey(workspaceId, recordId),
    queryFn: ({ signal }) => checkDuplicates(workspaceId, recordId, signal),
    enabled: active,
    // On-demand results — never auto-refetch behind the user's back.
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useConfirmDuplicate(workspaceId: WorkspaceId, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ConfirmDuplicateRequest>({
    mutationFn: (body) => confirmDuplicate(workspaceId, recordId, body),
    onSuccess: () => {
      // The record is now closed as Duplicate with a new duplicate-of link — refetch both.
      void queryClient.invalidateQueries({ queryKey: requestKey(recordId as RecordId) });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
