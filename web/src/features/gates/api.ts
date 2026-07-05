// Gates / Approvals API calls (S4/S5 Tasks & gates tab) — api-contracts.md §6. One thin apiFetch
// wrapper per endpoint; the /api prefix is added inside apiFetch.

import type { ApprovalDecisionRequest, ApprovalRequestDto, RecordId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function fetchApprovalRequests(recordId: RecordId, signal?: AbortSignal): Promise<ApprovalRequestDto[]> {
  return apiFetch<ApprovalRequestDto[]>(`/v1/requests/${recordId}/approval-requests`, signal ? { signal } : {});
}

export function submitDecision(
  approvalRequestId: string,
  request: ApprovalDecisionRequest,
): Promise<ApprovalRequestDto> {
  return apiFetch<ApprovalRequestDto>(`/v1/approval-requests/${approvalRequestId}/decisions`, {
    method: 'POST',
    body: request,
  });
}

export function reRequestApproval(approvalRequestId: string, slotIndex: number): Promise<ApprovalRequestDto> {
  return apiFetch<ApprovalRequestDto>(`/v1/approval-requests/${approvalRequestId}/re-request`, {
    method: 'POST',
    body: { slotIndex },
  });
}
