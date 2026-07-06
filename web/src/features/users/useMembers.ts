// TanStack Query hooks for the S29 Users & access members admin (web-state-management.md). The list
// query drives the table; the upsert / deactivate mutations invalidate it on success so the table
// reflects the change. ApiError (400 unresolved/ambiguous, 409 pending sign-off) propagates to the
// caller so the form / dialog can show the API's plain-language message.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MembersListDto, MembershipUpsertRequest, UserId, WorkspaceId } from '@shared/types';

import { deactivateMember, fetchMembers, upsertMember } from './api';

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

/** Add a member or change a member's level, then refresh the list. */
export function useUpsertMember(workspaceId: WorkspaceId | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, MembershipUpsertRequest>({
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
