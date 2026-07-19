// Tests for the watchers hooks (web-testing.md). Covers the disabled-key branch (no fetch without a
// record id) and the toggle mutation choosing watch vs unwatch by current state + invalidating the
// roster. The API boundary is mocked; a local QueryClient wrapper hosts the hooks.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { RecordId, UserId } from '@shared/types';

import * as api from './api';
import { usePatchMyWatch, useRecordWatchers, useWatchToggle } from './useWatchers';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;
const USER = '00000000-0000-0000-0000-0000000000aa' as UserId;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('useRecordWatchers', () => {
  it('useRecordWatchers — is disabled and never fetches when the record id is undefined', () => {
    // Act
    const { result } = renderHook(() => useRecordWatchers(undefined), { wrapper });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchWatchers).not.toHaveBeenCalled();
  });

  it('useRecordWatchers — fetches the roster for a real record id', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false, myPreferences: { notifyGateDecisions: true, notifyStatusChanges: true, notifyTaskSignoffs: true, notifySlaAndDueDateReminders: true, notifyMentionsAndComments: true } });

    // Act
    const { result } = renderHook(() => useRecordWatchers(RECORD), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.fetchWatchers).toHaveBeenCalledWith(RECORD, expect.anything());
  });
});

describe('useWatchToggle', () => {
  it('useWatchToggle — watch=true calls watchRecord', async () => {
    // Arrange
    mockedApi.watchRecord.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWatchToggle(RECORD), { wrapper });

    // Act
    result.current.mutate({ watch: true, userId: USER });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.watchRecord).toHaveBeenCalledWith(RECORD);
    expect(mockedApi.unwatchRecord).not.toHaveBeenCalled();
  });

  it('useWatchToggle — watch=false calls unwatchRecord with the caller id', async () => {
    // Arrange
    mockedApi.unwatchRecord.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWatchToggle(RECORD), { wrapper });

    // Act
    result.current.mutate({ watch: false, userId: USER });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.unwatchRecord).toHaveBeenCalledWith(RECORD, USER);
    expect(mockedApi.watchRecord).not.toHaveBeenCalled();
  });
});

describe('usePatchMyWatch', () => {
  it('usePatchMyWatch — forwards the sparse patch body verbatim to patchMyWatch', async () => {
    // Arrange
    mockedApi.patchMyWatch.mockResolvedValue({ isWatching: true, watchers: [], myPreferences: { notifyGateDecisions: true, notifyStatusChanges: true, notifyTaskSignoffs: true, notifySlaAndDueDateReminders: true, notifyMentionsAndComments: true } });
    const { result } = renderHook(() => usePatchMyWatch(RECORD), { wrapper });

    // Act — a flipped Gate decisions pref; other fields absent.
    result.current.mutate({ notifyGateDecisions: false });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.patchMyWatch).toHaveBeenCalledWith(RECORD, { notifyGateDecisions: false });
  });

  it('usePatchMyWatch — surfaces the mutation error when the API rejects', async () => {
    // Arrange
    mockedApi.patchMyWatch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePatchMyWatch(RECORD), { wrapper });

    // Act
    result.current.mutate({ notifyMentionsAndComments: false });

    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
