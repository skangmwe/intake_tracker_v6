// Tests for the trigger data hooks — query enablement and the save (create vs update) + delete
// mutations. The api is mocked; a local QueryClient wrapper hosts the hooks (web-testing.md —
// renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { WorkspaceId } from '@shared/types';

import * as api from './api';
import type { TriggerUpsertRequest } from './types';
import { useDeleteTrigger, useSaveTrigger, useTriggers } from './triggersModel';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WS = 'ws-1' as WorkspaceId;

const request: TriggerUpsertRequest = {
  name: 'SLA',
  isEnabled: false,
  cadence: 'Once',
  repeatIntervalDays: null,
  notificationCategory: 'sla-reminder',
  recipients: ['assignedAnalyst'],
  notificationTitle: 'Title',
  notificationBody: 'Body',
  conditions: [{ whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today' }],
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('useTriggers — no workspace — stays disabled and does not fetch', () => {
  // Act
  renderHook(() => useTriggers(undefined), { wrapper: wrapper() });

  // Assert
  expect(mockedApi.fetchTriggers).not.toHaveBeenCalled();
});

it('useTriggers — with workspace — fetches the list', async () => {
  // Arrange
  mockedApi.fetchTriggers.mockResolvedValue([]);

  // Act
  const { result } = renderHook(() => useTriggers(WS), { wrapper: wrapper() });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockedApi.fetchTriggers).toHaveBeenCalledWith(WS, expect.anything());
});

it('useSaveTrigger — null triggerId — calls create', async () => {
  // Arrange
  mockedApi.createTrigger.mockResolvedValue({} as never);

  // Act
  const { result } = renderHook(() => useSaveTrigger(WS), { wrapper: wrapper() });
  result.current.mutate({ triggerId: null, request });

  // Assert
  await waitFor(() => expect(mockedApi.createTrigger).toHaveBeenCalledWith(WS, request));
  expect(mockedApi.updateTrigger).not.toHaveBeenCalled();
});

it('useSaveTrigger — existing triggerId — calls update', async () => {
  // Arrange
  mockedApi.updateTrigger.mockResolvedValue({} as never);

  // Act
  const { result } = renderHook(() => useSaveTrigger(WS), { wrapper: wrapper() });
  result.current.mutate({ triggerId: 't-1', request });

  // Assert
  await waitFor(() => expect(mockedApi.updateTrigger).toHaveBeenCalledWith(WS, 't-1', request));
  expect(mockedApi.createTrigger).not.toHaveBeenCalled();
});

it('useDeleteTrigger — mutate — calls delete with the id', async () => {
  // Arrange
  mockedApi.deleteTrigger.mockResolvedValue();

  // Act
  const { result } = renderHook(() => useDeleteTrigger(WS), { wrapper: wrapper() });
  result.current.mutate('t-1');

  // Assert
  await waitFor(() => expect(mockedApi.deleteTrigger).toHaveBeenCalledWith(WS, 't-1'));
});
