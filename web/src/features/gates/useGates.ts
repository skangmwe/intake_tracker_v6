// TanStack Query hooks for gates / approvals (S4/S5 Tasks & gates tab) — web-state-management.md.
// A decision or re-request can advance the record's stage (gate resolves), so every mutation
// invalidates the record + the workspace list alongside the gates query.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApprovalDecisionRequest, ApprovalRequestDto, RecordId } from '@shared/types';

import { fetchApprovalRequests, reRequestApproval, submitDecision } from './api';

export const approvalRequestsKey = (recordId: RecordId) => ['approval-requests', recordId] as const;

/** The gates on a record (open + resolved). Rendered inline within their target phase group. */
export function useApprovalRequests(recordId: RecordId | undefined) {
  return useQuery<ApprovalRequestDto[]>({
    queryKey: recordId ? approvalRequestsKey(recordId) : ['approval-requests', 'disabled'],
    queryFn: ({ signal }) => fetchApprovalRequests(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Invalidate the gates, the record (stage may have advanced), and the workspace list. */
function useGateInvalidator(recordId: RecordId) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: approvalRequestsKey(recordId) });
    void queryClient.invalidateQueries({ queryKey: ['request', recordId] });
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
  };
}

/** Submit an approve/reject decision on a slot. */
export function useSubmitDecision(recordId: RecordId) {
  const invalidate = useGateInvalidator(recordId);
  return useMutation({
    mutationFn: (input: { approvalRequestId: string; request: ApprovalDecisionRequest }) =>
      submitDecision(input.approvalRequestId, input.request),
    onSuccess: invalidate,
  });
}

/** Return a rejected slot to Pending so it can be signed again. */
export function useReRequest(recordId: RecordId) {
  const invalidate = useGateInvalidator(recordId);
  return useMutation({
    mutationFn: (input: { approvalRequestId: string; slotIndex: number }) =>
      reRequestApproval(input.approvalRequestId, input.slotIndex),
    onSuccess: invalidate,
  });
}
