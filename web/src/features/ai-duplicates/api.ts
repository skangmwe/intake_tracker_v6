// Duplicate-check calls (Phase 4, §14). Both are POST and any workspace member; a disabled workspace or an
// inaccessible record returns 403, enforced server-side. Mirrors DuplicateCheckController's routes.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import type { ConfirmDuplicateRequest, DuplicateCandidate } from './types';

export function checkDuplicates(
  workspaceId: WorkspaceId,
  recordId: string,
  signal?: AbortSignal,
): Promise<DuplicateCandidate[]> {
  return apiFetch<DuplicateCandidate[]>(
    `/v1/workspaces/${workspaceId}/ai/duplicate-check/${recordId}`,
    {
      method: 'POST',
      ...(signal ? { signal } : {}),
    },
  );
}

export function confirmDuplicate(
  workspaceId: WorkspaceId,
  recordId: string,
  body: ConfirmDuplicateRequest,
): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/ai/duplicate-check/${recordId}/confirm`, {
    method: 'POST',
    body,
  });
}
