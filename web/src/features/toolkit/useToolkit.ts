// TanStack Query hooks for the Toolkit surface (S43) — web-state-management.md. Query-key factories
// are exported so pages and tests can target/invalidate precisely.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ToolkitItemCreateRequest,
  ToolkitItemDto,
  ToolkitItemId,
  ToolkitItemPatchRequest,
  ToolkitListResponse,
  ToolkitQuery,
  WorkspaceId,
} from '@shared/types';

import { createToolkitItem, fetchToolkitItem, patchToolkitItem, queryToolkit } from './api';

export const toolkitListKey = (workspaceId: WorkspaceId, query: ToolkitQuery) =>
  ['toolkit', workspaceId, query] as const;
export const toolkitItemKey = (itemId: ToolkitItemId) => ['toolkit-item', itemId] as const;

/** The S43 Toolkit list. Access-respecting, paginated, filtered/sorted server-side. */
export function useToolkitList(workspaceId: WorkspaceId | null, query: ToolkitQuery) {
  return useQuery<ToolkitListResponse>({
    queryKey: workspaceId ? toolkitListKey(workspaceId, query) : ['toolkit', 'disabled'],
    queryFn: ({ signal }) => queryToolkit(workspaceId as WorkspaceId, query, signal),
    enabled: Boolean(workspaceId),
  });
}

/** A single Toolkit item (S43 detail sheet). */
export function useToolkitItem(itemId: ToolkitItemId | null) {
  return useQuery<ToolkitItemDto>({
    queryKey: itemId ? toolkitItemKey(itemId) : ['toolkit-item', 'disabled'],
    queryFn: ({ signal }) => fetchToolkitItem(itemId as ToolkitItemId, signal),
    enabled: Boolean(itemId),
  });
}

interface CreateArgs {
  request: ToolkitItemCreateRequest;
  file: File | null;
}

/** Create an item (New item sheet). Invalidates the list on success. */
export function useCreateToolkitItem(workspaceId: WorkspaceId | null) {
  const queryClient = useQueryClient();
  return useMutation<ToolkitItemDto, Error, CreateArgs>({
    mutationFn: ({ request, file }) => createToolkitItem(workspaceId as WorkspaceId, request, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['toolkit'] });
    },
  });
}

interface PatchArgs {
  request: ToolkitItemPatchRequest;
  file: File | null;
}

/** Edit an item (editor sheet). Adopts the fresh record; invalidates the list. */
export function useUpdateToolkitItem(itemId: ToolkitItemId) {
  const queryClient = useQueryClient();
  return useMutation<ToolkitItemDto, Error, PatchArgs>({
    mutationFn: ({ request, file }) => patchToolkitItem(itemId, request, file),
    onSuccess: (fresh) => {
      queryClient.setQueryData(toolkitItemKey(itemId), fresh);
      void queryClient.invalidateQueries({ queryKey: ['toolkit'] });
    },
  });
}
