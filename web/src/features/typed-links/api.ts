// Typed links + Copy API calls (S4/S5, S19 — api-contracts.md §9). One thin apiFetch wrapper per
// endpoint; the /api prefix is added inside apiFetch.

import type { CopyRequest, CopyResult, RecordId, TypedLinkCreateRequest, TypedLinkDto, TypedLinkId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** A record's outgoing typed links — the Relationships card (access-respecting). */
export function fetchRecordLinks(recordId: RecordId, signal?: AbortSignal): Promise<TypedLinkDto[]> {
  return apiFetch<TypedLinkDto[]>(`/v1/records/${recordId}/links`, signal ? { signal } : {});
}

/** Add a typed link from the record to another (BS §2.2). */
export function addRecordLink(recordId: RecordId, request: TypedLinkCreateRequest): Promise<TypedLinkDto> {
  return apiFetch<TypedLinkDto>(`/v1/records/${recordId}/links`, { method: 'POST', body: request });
}

/** Soft-delete a typed link. */
export function deleteRecordLink(linkId: TypedLinkId): Promise<void> {
  return apiFetch<void>(`/v1/links/${linkId}`, { method: 'DELETE' });
}

/** Copy a record into a fresh draft in a target workspace (BS §5). Returns the new draft id. */
export function copyRecord(recordId: RecordId, request: CopyRequest): Promise<CopyResult> {
  return apiFetch<CopyResult>(`/v1/records/${recordId}/copy`, { method: 'POST', body: request });
}
