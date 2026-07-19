// Lifecycle & gates API calls (S31) — api-contracts.md §18.

import type {
  ApproverTeamAddRequest,
  ApproverTeamMemberDto,
  ApproverTeamRemoveRequest,
  LifecycleConfigDto,
  LifecycleConfigUpdateRequest,
  LifecycleSummaryDto,
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
