// TanStack Query hooks for the S29 Users & access members admin (web-state-management.md). The list
// query drives the table; the upsert / deactivate / cancel-invitation mutations invalidate it on
// success so the table reflects the change. ApiError (400 ambiguous, 409 already-invited / pending
// sign-off, 403 missing invite) propagates to the caller so the form / dialog can show the API's
// plain-language message.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  MembersListDto,
  MembershipUpsertRequest,
  MembershipUpsertResponse,
  UserId,
  WorkspaceId,
} from '@shared/types';

import { cancelInvitation, deactivateMember, fetchMembers, upsertMember } from './api';

export const membersKey = (workspaceId: WorkspaceId | undefined) =>
  ['members', workspaceId ?? 'none'] as const;

/** The workspace's members. Disabled until a workspace is resolved. */
export function useMembers(workspaceId: WorkspaceId | undefined) {
  return useQuery<MembersListDto>({
    queryKey: membersKey(workspaceId),
    queryFn: ({ signal }) => fetchMembers(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Add a member (joins now), invite an unknown email (pending), or change a member's level, then
 * refresh the list. The resolved outcome (`Member` / `Invited`) is returned so the form can confirm.
 */
export function useUpsertMember(workspaceId: WorkspaceId | undefined) {
  const queryClient = useQueryClient();
  return useMutation<MembershipUpsertResponse, Error, MembershipUpsertRequest>({
    mutationFn: (body) => upsertMember(workspaceId as WorkspaceId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(workspaceId) }),
  });
}

/** Deactivate a member, then refresh the list. */
export function useDeactivateMember(workspaceId: WorkspaceId | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UserId>({
    mutationFn: (userId) => deactivateMember(workspaceId as WorkspaceId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(workspaceId) }),
  });
}

/** Cancel a pending invitation (keyed by invitationId), then refresh the list. */
export function useCancelInvitation(workspaceId: WorkspaceId | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (invitationId) => cancelInvitation(workspaceId as WorkspaceId, invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(workspaceId) }),
  });
}
