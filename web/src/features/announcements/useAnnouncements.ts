// Data hooks for the announcements feature (TanStack Query — web-state-management.md). The consumer
// feed (S22) and detail (S21) are read hooks; the manage surface (S23) reads the workspace list and
// runs create / update / publish / retire mutations that invalidate the affected caches.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnnouncementCreateRequest,
  AnnouncementDto,
  AnnouncementListRow,
  AnnouncementPatchRequest,
  PaginatedResponse,
  WorkspaceId,
} from '@shared/types';

import {
  createAnnouncement,
  fetchAnnouncement,
  publishAnnouncement,
  queryAnnouncements,
  queryManagedAnnouncements,
  retireAnnouncement,
  updateAnnouncement,
} from './api';
import { ANNOUNCEMENTS_PAGE_SIZE } from './constants';

export const announcementsFeedKey = (page: number) => ['announcements', 'feed', page] as const;
export const announcementKey = (id: string) => ['announcements', 'detail', id] as const;
export const managedAnnouncementsKey = (workspaceId: WorkspaceId, page: number) =>
  ['announcements', 'manage', workspaceId, page] as const;

export function useAnnouncementsFeed(page: number) {
  return useQuery<PaginatedResponse<AnnouncementListRow>>({
    queryKey: announcementsFeedKey(page),
    queryFn: ({ signal }) => queryAnnouncements({ page, pageSize: ANNOUNCEMENTS_PAGE_SIZE }, signal),
  });
}

export function useAnnouncement(id: string | undefined) {
  return useQuery<AnnouncementDto>({
    queryKey: announcementKey(id ?? ''),
    queryFn: ({ signal }) => fetchAnnouncement(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useManagedAnnouncements(workspaceId: WorkspaceId | undefined, page: number) {
  return useQuery<PaginatedResponse<AnnouncementListRow>>({
    queryKey: managedAnnouncementsKey(workspaceId ?? ('' as WorkspaceId), page),
    queryFn: ({ signal }) => queryManagedAnnouncements(workspaceId as WorkspaceId, { page, pageSize: ANNOUNCEMENTS_PAGE_SIZE }, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateAnnouncement(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementDto, Error, AnnouncementCreateRequest>({
    mutationFn: (request) => createAnnouncement(workspaceId, request),
    onSuccess: () => invalidateManage(queryClient, workspaceId),
  });
}

export function useUpdateAnnouncement(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementDto, Error, { id: string; request: AnnouncementPatchRequest }>({
    mutationFn: ({ id, request }) => updateAnnouncement(id, request),
    onSuccess: (announcement) => {
      queryClient.setQueryData(announcementKey(announcement.id), announcement);
      void invalidateManage(queryClient, workspaceId);
    },
  });
}

export function usePublishAnnouncement(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementDto, Error, string>({
    mutationFn: (id) => publishAnnouncement(id),
    onSuccess: (announcement) => {
      queryClient.setQueryData(announcementKey(announcement.id), announcement);
      void invalidateManage(queryClient, workspaceId);
    },
  });
}

export function useRetireAnnouncement(workspaceId: WorkspaceId) {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementDto, Error, string>({
    mutationFn: (id) => retireAnnouncement(id),
    onSuccess: (announcement) => {
      queryClient.setQueryData(announcementKey(announcement.id), announcement);
      void invalidateManage(queryClient, workspaceId);
    },
  });
}

function invalidateManage(queryClient: ReturnType<typeof useQueryClient>, workspaceId: WorkspaceId) {
  return queryClient.invalidateQueries({ queryKey: ['announcements', 'manage', workspaceId] });
}
