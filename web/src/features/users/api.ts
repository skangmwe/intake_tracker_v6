// Users feature API calls — GET /users/me and POST /users/me/theme (api-contracts.md §1), plus the
// S29 Users & access members admin (api-contracts.md §2).

import type {
  MeDto,
  MembersListDto,
  MembershipUpsertRequest,
  MembershipUpsertResponse,
  ThemePreference,
  UserId,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function fetchMe(signal?: AbortSignal): Promise<MeDto> {
  return apiFetch<MeDto>('/v1/users/me', signal ? { signal } : {});
}

export function updateTheme(theme: ThemePreference): Promise<void> {
  return apiFetch<void>('/v1/users/me/theme', { method: 'POST', body: { theme } });
}

/** GET the workspace's members (WorkspaceAdmin — the API is the boundary). */
export function fetchMembers(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<MembersListDto> {
  return apiFetch<MembersListDto>(
    `/v1/workspaces/${workspaceId}/members`,
    signal ? { signal } : {},
  );
}

/**
 * Add a member (by email), invite an unknown email, or change an existing member's level.
 * Returns the outcome: `Member` (joined now) or `Invited` (pending invitation created).
 */
export function upsertMember(
  workspaceId: WorkspaceId,
  body: MembershipUpsertRequest,
): Promise<MembershipUpsertResponse> {
  return apiFetch<MembershipUpsertResponse>(`/v1/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body,
  });
}

/** Deactivate a member: disable the account and remove them from this workspace. */
export function deactivateMember(workspaceId: WorkspaceId, userId: UserId): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
}

/** Suspend (disable but keep in workspace) or reactivate a member. */
export function setMemberSuspension(
  workspaceId: WorkspaceId,
  userId: UserId,
  suspended: boolean,
): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/members/${userId}/suspension`, {
    method: 'POST',
    body: { suspended },
  });
}

/** Cancel a pending invitation (removes the Invited row from the list). */
export function cancelInvitation(workspaceId: WorkspaceId, invitationId: string): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/invitations/${invitationId}`, {
    method: 'DELETE',
  });
}
