// TanStack Query hooks for Drafts (S26) — web-state-management.md.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DraftId, DraftListRow, DraftSaveRequest, WorkspaceId } from '@shared/types';

import { deleteDraft, fetchDrafts, saveDraft } from './api';

export const draftsKey = (workspaceId: WorkspaceId) => ['drafts', workspaceId] as const;

/** The caller's own Drafts for a workspace (S26). */
export function useDrafts(workspaceId: WorkspaceId | undefined) {
  return useQuery<DraftListRow[]>({
    queryKey: workspaceId ? draftsKey(workspaceId) : ['drafts', 'disabled'],
    queryFn: ({ signal }) => fetchDrafts(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** Save a draft (S3 "Save draft"). Invalidates the Drafts list on success. */
export function useSaveDraft(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DraftSaveRequest) => saveDraft(workspaceId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftsKey(workspaceId) });
    },
  });
}

/** Discard a draft (S26). */
export function useDeleteDraft(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: DraftId) => deleteDraft(draftId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftsKey(workspaceId) });
    },
  });
}
