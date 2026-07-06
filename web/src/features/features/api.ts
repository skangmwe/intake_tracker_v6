// Feature Catalog API calls (S9/S10/S13) — api-contracts.md §11. One thin apiFetch wrapper per
// endpoint. Features are AI-Solutions-workspace-only, resolved server-side (no workspace in the path).

import type {
  AddToCatalogResult,
  DraftDto,
  DraftId,
  FeatureCreateRequest,
  FeatureDto,
  FeatureListRow,
  FeaturePatchRequest,
  PaginatedQuery,
  PaginatedResponse,
  RecordId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function queryFeatures(
  query: PaginatedQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<FeatureListRow>> {
  return apiFetch<PaginatedResponse<FeatureListRow>>('/v1/features/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}

export function fetchFeature(recordId: RecordId, signal?: AbortSignal): Promise<FeatureDto> {
  return apiFetch<FeatureDto>(`/v1/features/${recordId}`, signal ? { signal } : {});
}

export function createFeature(request: FeatureCreateRequest): Promise<FeatureDto> {
  return apiFetch<FeatureDto>('/v1/features', { method: 'POST', body: request });
}

export function patchFeature(
  recordId: RecordId,
  request: FeaturePatchRequest,
): Promise<FeatureDto> {
  return apiFetch<FeatureDto>(`/v1/features/${recordId}`, {
    method: 'PATCH',
    body: request,
    ifMatch: request.ifMatch,
  });
}

export function publishFeature(recordId: RecordId): Promise<FeatureDto> {
  return apiFetch<FeatureDto>(`/v1/features/${recordId}/publish`, { method: 'POST' });
}

export function deprecateFeature(recordId: RecordId): Promise<FeatureDto> {
  return apiFetch<FeatureDto>(`/v1/features/${recordId}/deprecate`, { method: 'POST' });
}

/** Prefill a Feature draft from a shipped Request (BS §5). Returns the draft id to resume in S13. */
export function addToCatalog(sourceRecordId: RecordId): Promise<AddToCatalogResult> {
  return apiFetch<AddToCatalogResult>(`/v1/requests/${sourceRecordId}/add-to-catalog`, {
    method: 'POST',
  });
}

/** Resume a Feature-typed draft (the Add-to-catalog prefill) — the generic draft endpoints (§9.7). */
export function fetchFeatureDraft(draftId: DraftId, signal?: AbortSignal): Promise<DraftDto> {
  return apiFetch<DraftDto>(`/v1/drafts/${draftId}`, signal ? { signal } : {});
}

export function deleteFeatureDraft(draftId: DraftId): Promise<void> {
  return apiFetch<void>(`/v1/drafts/${draftId}`, { method: 'DELETE' });
}
