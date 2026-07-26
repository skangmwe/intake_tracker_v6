// Field-suggestion call (Phase 4, §14). POST is any workspace member; a disabled workspace returns 403,
// enforced server-side. Mirrors FieldSuggestionController's route.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import type { FieldSuggestion, FieldSuggestionRequest } from './types';

export function requestFieldSuggestion(
  workspaceId: WorkspaceId,
  body: FieldSuggestionRequest,
  signal?: AbortSignal,
): Promise<FieldSuggestion> {
  return apiFetch<FieldSuggestion>(`/v1/workspaces/${workspaceId}/ai/field-suggestion`, {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
