// Tests for the search data hooks — query enablement (min length + workspace) and that a ready query
// calls the api with the trimmed term. The api is mocked; a local QueryClient wrapper hosts the hooks
// (web-testing.md — renderHook keeps a local wrapper). Logic-only hooks: no DOM, no axe.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { RecordId, WorkspaceId } from '@shared/types';

import { SEARCH_RESULTS_PAGE_SIZE } from '@/shared/constants';

import * as api from './api';
import { useFullSearch, useQuickSearch } from './useSearch';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('useQuickSearch — no workspace — stays disabled and does not fetch', () => {
  // Act
  renderHook(() => useQuickSearch(undefined, 'contract'), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.searchRecords).not.toHaveBeenCalled();
});

it('useQuickSearch — query below the minimum length — does not fetch', () => {
  // Act
  renderHook(() => useQuickSearch(WORKSPACE_ID, 'ab'), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.searchRecords).not.toHaveBeenCalled();
});

it('useQuickSearch — ready query — fetches with the trimmed term', async () => {
  // Arrange
  mockedApi.searchRecords.mockResolvedValue([{ recordId: 'AIS-1' as RecordId, name: 'Contract', stage: 'intake', origin: 'AI' }]);

  // Act
  const { result } = renderHook(() => useQuickSearch(WORKSPACE_ID, '  contract  '), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.searchRecords).toHaveBeenCalledWith(WORKSPACE_ID, 'contract', expect.anything());
});

it('useFullSearch — ready query — fetches the page with the configured page size', async () => {
  // Arrange
  mockedApi.searchFull.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: SEARCH_RESULTS_PAGE_SIZE });

  // Act
  const { result } = renderHook(() => useFullSearch(WORKSPACE_ID, 'omega', 2), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.searchFull).toHaveBeenCalledWith(WORKSPACE_ID, 'omega', 2, SEARCH_RESULTS_PAGE_SIZE, expect.anything());
});

it('useFullSearch — query below the minimum length — does not fetch', () => {
  // Act
  renderHook(() => useFullSearch(WORKSPACE_ID, 'om', 1), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.searchFull).not.toHaveBeenCalled();
});
