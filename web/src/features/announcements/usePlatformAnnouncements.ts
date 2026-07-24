// Data hooks for the platform broadcast surface (TanStack Query — web-state-management.md). The workspaces
// read feeds the target picker; the broadcast list is read once (client-side sort/filter/paginate like the
// workspace manage table); create / update / retire invalidate the list.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PaginatedResponse,
  PlatformAnnouncementCreateRequest,
  PlatformAnnouncementCreatedDto,
  PlatformAnnouncementPatchRequest,
  PlatformAnnouncementRow,
  PlatformWorkspaceDto,
} from '@shared/types';

import { MANAGE_ANNOUNCEMENTS_FETCH_SIZE } from './constants';
import {
  createPlatformBroadcast,
  fetchPlatformWorkspaces,
  queryPlatformAnnouncements,
  retirePlatformBroadcast,
  updatePlatformBroadcast,
} from './platformApi';

export const platformWorkspacesKey = ['platform', 'workspaces'] as const;
export const platformAnnouncementsKey = ['announcements', 'platform'] as const;

export function usePlatformWorkspaces() {
  return useQuery<PlatformWorkspaceDto[]>({
    queryKey: platformWorkspacesKey,
    queryFn: ({ signal }) => fetchPlatformWorkspaces(signal),
  });
}

export function usePlatformAnnouncements() {
  return useQuery<PaginatedResponse<PlatformAnnouncementRow>>({
    queryKey: platformAnnouncementsKey,
    queryFn: ({ signal }) =>
      queryPlatformAnnouncements({ page: 1, pageSize: MANAGE_ANNOUNCEMENTS_FETCH_SIZE }, signal),
  });
}

export function useCreatePlatformBroadcast() {
  const queryClient = useQueryClient();
  return useMutation<PlatformAnnouncementCreatedDto, Error, PlatformAnnouncementCreateRequest>({
    mutationFn: (request) => createPlatformBroadcast(request),
    onSuccess: () => invalidatePlatform(queryClient),
  });
}

export function useUpdatePlatformBroadcast() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { broadcastId: string; request: PlatformAnnouncementPatchRequest }>({
    mutationFn: ({ broadcastId, request }) => updatePlatformBroadcast(broadcastId, request),
    onSuccess: () => invalidatePlatform(queryClient),
  });
}

export function useRetirePlatformBroadcast() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (broadcastId) => retirePlatformBroadcast(broadcastId),
    onSuccess: () => invalidatePlatform(queryClient),
  });
}

function invalidatePlatform(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: platformAnnouncementsKey });
}
