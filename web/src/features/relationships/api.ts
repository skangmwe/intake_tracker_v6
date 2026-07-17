// Relationships + relationship-driven links API (Slice 25 — api-contracts §Relationships).
// Path note: /records/{id}/relationship-links (not /links) — Slice 10's TypedLinks already
// owns /links; the addendum's collision is resolved by the distinct path here and in the
// controller (see the slice doc).

import type {
  RecordId,
  RelationshipCreateRequest,
  RelationshipDto,
  RelationshipId,
  RelationshipLinkCreateRequest,
  RelationshipLinkDto,
  RelationshipPatchRequest,
  RelationshipRetireResponse,
  WorkspaceId,
} from '@shared/types';

import { apiFetch, ApiError } from '@/shared/http/apiClient';

export function fetchRelationships(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<RelationshipDto[]> {
  return apiFetch<RelationshipDto[]>(
    `/v1/workspaces/${workspaceId}/relationships`,
    signal ? { signal } : {},
  );
}

export function fetchRelationship(
  relationshipId: RelationshipId,
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<RelationshipDto> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  return apiFetch<RelationshipDto>(
    `/v1/relationships/${relationshipId}?${qs}`,
    signal ? { signal } : {},
  );
}

export function createRelationship(
  workspaceId: WorkspaceId,
  request: RelationshipCreateRequest,
): Promise<RelationshipDto> {
  return apiFetch<RelationshipDto>(
    `/v1/workspaces/${workspaceId}/relationships`,
    { method: 'POST', body: request },
  );
}

export function patchRelationship(
  relationshipId: RelationshipId,
  workspaceId: WorkspaceId,
  request: RelationshipPatchRequest,
): Promise<RelationshipDto> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  return apiFetch<RelationshipDto>(
    `/v1/relationships/${relationshipId}?${qs}`,
    { method: 'PATCH', body: request },
  );
}

export async function retireRelationship(
  relationshipId: RelationshipId,
  workspaceId: WorkspaceId,
  force = false,
): Promise<RelationshipRetireResponse> {
  // v2 review F-1 — the retire endpoint's 409 response carries a data payload
  // (`{ relationshipId, linkCount, retired: false }`) that the S30 admin uses to swap the
  // dialog to the force-confirm variant. apiFetch throws ApiError on any non-2xx, which would
  // put the mutation in `error` state and drop the count. Catch 409 here and resolve with the
  // problem body cast to the retire-response shape so onSuccess fires and the UI can advance.
  const qs = new URLSearchParams({ workspaceId: String(workspaceId), force: String(force) });
  try {
    return await apiFetch<RelationshipRetireResponse>(
      `/v1/relationships/${relationshipId}/retire?${qs}`,
      { method: 'POST' },
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      // The 409 body is a RelationshipRetireResponse (not the standard ProblemDetails shape).
      // The controller sets Content-Type: application/json (not application/problem+json) for
      // this specific 409 — apiClient still parses it into `problem` as an unknown JSON blob.
      const body = cause.problem as unknown as RelationshipRetireResponse | undefined;
      if (body && typeof body.linkCount === 'number' && body.relationshipId) {
        return body;
      }
    }
    throw cause;
  }
}

export function restoreRelationship(
  relationshipId: RelationshipId,
  workspaceId: WorkspaceId,
): Promise<RelationshipDto> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  return apiFetch<RelationshipDto>(
    `/v1/relationships/${relationshipId}/restore?${qs}`,
    { method: 'POST' },
  );
}

/** All relationship-driven links for a record (both directions). */
export function fetchRelationshipLinks(
  recordId: RecordId,
  workspaceId: WorkspaceId,
  relationshipId?: RelationshipId,
  signal?: AbortSignal,
): Promise<RelationshipLinkDto[]> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  if (relationshipId) qs.set('relationshipId', String(relationshipId));
  return apiFetch<RelationshipLinkDto[]>(
    `/v1/records/${recordId}/relationship-links?${qs}`,
    signal ? { signal } : {},
  );
}

export function createRelationshipLink(
  recordId: RecordId,
  workspaceId: WorkspaceId,
  request: RelationshipLinkCreateRequest,
): Promise<RelationshipLinkDto> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  return apiFetch<RelationshipLinkDto>(
    `/v1/records/${recordId}/relationship-links?${qs}`,
    { method: 'POST', body: request },
  );
}

export function deleteRelationshipLink(
  recordId: RecordId,
  linkId: string,
  workspaceId: WorkspaceId,
): Promise<void> {
  const qs = new URLSearchParams({ workspaceId: String(workspaceId) });
  return apiFetch<void>(
    `/v1/records/${recordId}/relationship-links/${linkId}?${qs}`,
    { method: 'DELETE' },
  );
}
