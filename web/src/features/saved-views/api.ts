// Saved-views API calls (S24) — api-contracts.md §15. One thin apiFetch wrapper per endpoint.
// Views are presentation metadata scoped to one list surface via objectType.

import type {
  SavedViewDto,
  SavedViewObjectType,
  SavedViewUpsertRequest,
  SavedViewId,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

export function listSavedViews(
  workspaceId: WorkspaceId,
  objectType: SavedViewObjectType,
  signal?: AbortSignal,
): Promise<SavedViewDto[]> {
  const path = withQuery(`/v1/workspaces/${workspaceId}/saved-views`, { objectType });
  return apiFetch<SavedViewDto[]>(path, signal ? { signal } : {});
}

export function createSavedView(
  workspaceId: WorkspaceId,
  request: SavedViewUpsertRequest,
): Promise<SavedViewDto> {
  return apiFetch<SavedViewDto>(`/v1/workspaces/${workspaceId}/saved-views`, {
    method: 'POST',
    body: request,
  });
}

export function updateSavedView(
  savedViewId: SavedViewId,
  request: SavedViewUpsertRequest,
): Promise<SavedViewDto> {
  return apiFetch<SavedViewDto>(`/v1/saved-views/${savedViewId}`, {
    method: 'PATCH',
    body: request,
  });
}

export function deleteSavedView(savedViewId: SavedViewId): Promise<void> {
  return apiFetch<void>(`/v1/saved-views/${savedViewId}`, { method: 'DELETE' });
}
