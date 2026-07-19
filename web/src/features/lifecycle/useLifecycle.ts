// TanStack Query hooks for the Lifecycle & gates surface (S31). Server state only
// (web-state-management.md). The lifecycle config PATCH returns the refreshed config, which the
// caller adopts directly (so minted stage/gate ids flow back into the draft) — it does not
// invalidate. Approver-team add/remove DO invalidate the config, because they change the live
// eligible-member counts the gates display.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApproverTeamAddRequest,
  ApproverTeamRemoveRequest,
  LifecycleConfigDto,
  LifecycleConfigUpdateRequest,
  LifecycleSummaryDto,
  WorkspaceId,
} from '@shared/types';

import {
  addApproverMember,
  fetchLifecycleConfig,
  fetchWorkspaceLifecycles,
  removeApproverMember,
  saveLifecycleConfig,
} from './api';

export const lifecycleConfigQueryKey = (workspaceId: WorkspaceId) => ['lifecycle', workspaceId] as const;

export const workspaceLifecyclesQueryKey = (workspaceId: WorkspaceId) => ['lifecycles', workspaceId] as const;

export function useLifecycleConfig(workspaceId: WorkspaceId | undefined) {
  return useQuery<LifecycleConfigDto>({
    queryKey: lifecycleConfigQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchLifecycleConfig(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/**
 * v2 (slice 27) — the lightweight lifecycle list for the S3 intake picker. A separate cache key
 * from the full config so the picker doesn't pull stages/gates/approver-teams it doesn't need.
 */
export function useWorkspaceLifecycles(workspaceId: WorkspaceId | undefined) {
  return useQuery<LifecycleSummaryDto[]>({
    queryKey: workspaceLifecyclesQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchWorkspaceLifecycles(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useSaveLifecycleConfig(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: LifecycleConfigUpdateRequest) => saveLifecycleConfig(workspaceId, request),
    // Adopt the returned config as the cache baseline without a refetch — the draft owns edits.
    onSuccess: (config) => queryClient.setQueryData(lifecycleConfigQueryKey(workspaceId), config),
  });
}

export function useAddApproverMember(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ApproverTeamAddRequest) => addApproverMember(workspaceId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lifecycleConfigQueryKey(workspaceId) }),
  });
}

export function useRemoveApproverMember(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ApproverTeamRemoveRequest) => removeApproverMember(workspaceId, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lifecycleConfigQueryKey(workspaceId) }),
  });
}
