// Escalation API call (S18 — api-contracts.md §4). One thin apiFetch wrapper; the /api prefix is
// added inside apiFetch.

import type { EscalateRequest, EscalateResult, RecordId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** Escalate a PG-side Request to the AI Solutions workspace. One-time, one-way (BS §6.6). */
export function escalateRequest(recordId: RecordId, request: EscalateRequest): Promise<EscalateResult> {
  return apiFetch<EscalateResult>(`/v1/requests/${recordId}/escalate`, { method: 'POST', body: request });
}
