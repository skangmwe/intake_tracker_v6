// Closure API call (S4/S5 — api-contracts.md §3/§8). One thin apiFetch wrapper; the /api prefix is
// added inside apiFetch.

import type { RecordId, RequestCloseRequest, RequestDto } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** Close a record with an Outcome (BS §8). Returns the refreshed record. */
export function closeRecord(recordId: RecordId, request: RequestCloseRequest): Promise<RequestDto> {
  return apiFetch<RequestDto>(`/v1/requests/${recordId}/close`, { method: 'POST', body: request });
}
