// Workspace AI-config calls (Phase 4, Slice 3). GET is any member (the SPA uses `enabled` to show/hide
// the Ask entry); PUT is WorkspaceAdmin, enforced server-side. Mirrors AiConfigController's routes.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import type { AiConfig, AiConfigUpdateRequest } from './types';

export function fetchAiConfig(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<AiConfig> {
  return apiFetch<AiConfig>(`/v1/workspaces/${workspaceId}/ai/config`, signal ? { signal } : {});
}

export function updateAiConfig(
  workspaceId: WorkspaceId,
  request: AiConfigUpdateRequest,
): Promise<AiConfig> {
  return apiFetch<AiConfig>(`/v1/workspaces/${workspaceId}/ai/config`, {
    method: 'PUT',
    body: request,
  });
}
