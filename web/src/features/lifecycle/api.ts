// Lifecycle & gates API calls (S31) — api-contracts.md §18.

import type {
  ApproverTeamAddRequest,
  ApproverTeamMemberDto,
  ApproverTeamRemoveRequest,
  LifecycleConfigDto,
  LifecycleConfigUpdateRequest,
  LifecycleSummaryDto,
  RoleLabelCreateRequest,
  RoleLabelDto,
  RoleLabelRenameRequest,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function fetchLifecycleConfig(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<LifecycleConfigDto> {
  return apiFetch<LifecycleConfigDto>(`/v1/workspaces/${workspaceId}/lifecycle`, signal ? { signal } : {});
}

/**
 * v2 (slice 27) — the lightweight lifecycle list for the S3 intake "Lifecycle" picker and the S31
 * dropdown. Only id / name / default marker; the full config comes from fetchLifecycleConfig.
 */
export function fetchWorkspaceLifecycles(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<LifecycleSummaryDto[]> {
  return apiFetch<LifecycleSummaryDto[]>(`/v1/workspaces/${workspaceId}/lifecycles`, signal ? { signal } : {});
}

export function saveLifecycleConfig(
  workspaceId: WorkspaceId,
  request: LifecycleConfigUpdateRequest,
): Promise<LifecycleConfigDto> {
  return apiFetch<LifecycleConfigDto>(`/v1/workspaces/${workspaceId}/lifecycle`, { method: 'PATCH', body: request });
}

export function addApproverMember(
  workspaceId: WorkspaceId,
  request: ApproverTeamAddRequest,
): Promise<ApproverTeamMemberDto> {
  return apiFetch<ApproverTeamMemberDto>(`/v1/workspaces/${workspaceId}/approver-teams`, { method: 'POST', body: request });
}

export function removeApproverMember(
  workspaceId: WorkspaceId,
  request: ApproverTeamRemoveRequest,
): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/approver-teams`, { method: 'DELETE', body: request });
}

// Team lifecycle — create / rename / delete a role label (a "team"). These edit the firm-wide
// role-label catalog (a team IS a role label); the API authorizes WorkspaceAdmin. Rename and delete
// are forward-only — existing rosters and past sign-offs keep their captured label.

export function createApproverTeam(
  workspaceId: WorkspaceId,
  request: RoleLabelCreateRequest,
): Promise<RoleLabelDto> {
  return apiFetch<RoleLabelDto>(`/v1/workspaces/${workspaceId}/approver-teams/labels`, {
    method: 'POST',
    body: request,
  });
}

export function renameApproverTeam(
  workspaceId: WorkspaceId,
  roleLabelId: string,
  request: RoleLabelRenameRequest,
): Promise<RoleLabelDto> {
  return apiFetch<RoleLabelDto>(`/v1/workspaces/${workspaceId}/approver-teams/labels/${roleLabelId}`, {
    method: 'PATCH',
    body: request,
  });
}

export function deleteApproverTeam(workspaceId: WorkspaceId, roleLabelId: string): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/approver-teams/labels/${roleLabelId}`, {
    method: 'DELETE',
  });
}
