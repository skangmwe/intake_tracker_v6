// TanStack Query hooks for the workspace AI-config surface (Phase 4, Slice 3). Server state only
// (web-state-management.md). The config query is also read by the shell to decide whether to show the
// Ask entry, so the query key is shared and a save updates the cache immediately.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import { fetchAiConfig, updateAiConfig } from './api';
import type { AiConfig, AiConfigUpdateRequest } from './types';

export const aiConfigQueryKey = (workspaceId: WorkspaceId) => ['ai-config', workspaceId] as const;

export function useAiConfig(workspaceId: WorkspaceId | undefined) {
  return useQuery<AiConfig>({
    queryKey: aiConfigQueryKey(workspaceId ?? ('' as WorkspaceId)),
    queryFn: ({ signal }) => fetchAiConfig(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useSaveAiConfig(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AiConfigUpdateRequest) => updateAiConfig(workspaceId, request),
    onSuccess: (config) => {
      queryClient.setQueryData(aiConfigQueryKey(workspaceId), config);
    },
  });
}
