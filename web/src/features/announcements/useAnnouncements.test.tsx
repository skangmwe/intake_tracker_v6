// Tests for the announcements data hooks — query enablement + the create/update/publish/retire
// mutations. The api is mocked; a local QueryClient wrapper hosts the hooks (web-testing.md — renderHook
// keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { AnnouncementDto, WorkspaceId } from '@shared/types';

import * as api from './api';
import {
  useAnnouncement,
  useCreateAnnouncement,
  usePublishAnnouncement,
  useRetireAnnouncement,
  useUpdateAnnouncement,
} from './useAnnouncements';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const DTO = { id: 'a1', status: 'Published' } as unknown as AnnouncementDto;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('useAnnouncement — no id — stays disabled and does not fetch', () => {
  // Act
  renderHook(() => useAnnouncement(undefined), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.fetchAnnouncement).not.toHaveBeenCalled();
});

it('useAnnouncement — with id — fetches the detail', async () => {
  // Arrange
  mockedApi.fetchAnnouncement.mockResolvedValue(DTO);

  // Act
  const { result } = renderHook(() => useAnnouncement('a1'), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.fetchAnnouncement).toHaveBeenCalledWith('a1', expect.anything());
});

it('useCreateAnnouncement — mutate — calls the create api with the workspace', async () => {
  // Arrange
  mockedApi.createAnnouncement.mockResolvedValue(DTO);

  // Act
  const { result } = renderHook(() => useCreateAnnouncement(WORKSPACE_ID), { wrapper: wrapper() });
  result.current.mutate({ title: 'T', body: 'B', audience: { kind: 'everyone' } });

  // Assert
  await waitFor(() => expect(mockedApi.createAnnouncement).toHaveBeenCalledWith(WORKSPACE_ID, expect.objectContaining({ title: 'T' })));
});

it('useUpdateAnnouncement — mutate — calls the update api', async () => {
  // Arrange
  mockedApi.updateAnnouncement.mockResolvedValue(DTO);

  // Act
  const { result } = renderHook(() => useUpdateAnnouncement(WORKSPACE_ID), { wrapper: wrapper() });
  result.current.mutate({ id: 'a1', request: { title: 'T', body: 'B', audience: { kind: 'everyone' }, pinned: false } });

  // Assert
  await waitFor(() => expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'T' })));
});

it('usePublishAnnouncement — mutate — calls the publish api', async () => {
  // Arrange
  mockedApi.publishAnnouncement.mockResolvedValue(DTO);

  // Act
  const { result } = renderHook(() => usePublishAnnouncement(WORKSPACE_ID), { wrapper: wrapper() });
  result.current.mutate('a1');

  // Assert
  await waitFor(() => expect(mockedApi.publishAnnouncement).toHaveBeenCalledWith('a1'));
});

it('useRetireAnnouncement — mutate — calls the retire api', async () => {
  // Arrange
  mockedApi.retireAnnouncement.mockResolvedValue(DTO);

  // Act
  const { result } = renderHook(() => useRetireAnnouncement(WORKSPACE_ID), { wrapper: wrapper() });
  result.current.mutate('a1');

  // Assert
  await waitFor(() => expect(mockedApi.retireAnnouncement).toHaveBeenCalledWith('a1'));
});
