// TanStack Query hooks for the trigger admin surface (slice: triggers-request-authoring, Task 2.3).
// Server state only (web-state-management.md); every mutation invalidates the workspace's trigger
// list so the surface refreshes after a save or delete.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import { createTrigger, deleteTrigger, fetchTriggers, updateTrigger } from './api';
import type { TriggerDto, TriggerUpsertRequest } from './types';

export const triggersQueryKey = (workspaceId: WorkspaceId) => ['triggers', workspaceId] as const;

export function useTriggers(workspaceId: WorkspaceId | undefined) {
  return useQuery<TriggerDto[]>({
    queryKey: triggersQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchTriggers(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

interface SaveTriggerInput {
  /** The trigger id when updating; null when creating. */
  triggerId: string | null;
  request: TriggerUpsertRequest;
}

export function useSaveTrigger(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ triggerId, request }: SaveTriggerInput) =>
      triggerId === null
        ? createTrigger(workspaceId, request)
        : updateTrigger(workspaceId, triggerId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triggersQueryKey(workspaceId) });
    },
  });
}

export function useDeleteTrigger(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (triggerId: string) => deleteTrigger(workspaceId, triggerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triggersQueryKey(workspaceId) });
    },
  });
}
