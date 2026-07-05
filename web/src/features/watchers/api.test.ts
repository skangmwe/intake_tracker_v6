// Tests for the watchers api wrappers — verifies each builds the right path / method / body over the
// shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import type { RecordId, UserId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { fetchWatchers, unwatchRecord, watchRecord } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const RECORD = 'AIS-00000001' as RecordId;
const USER = '00000000-0000-0000-0000-0000000000aa' as UserId;

beforeEach(() => jest.clearAllMocks());

describe('watchers api', () => {
  it('fetchWatchers — GETs the roster and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ watchers: [], isWatching: false });
    const controller = new AbortController();

    // Act
    await fetchWatchers(RECORD, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/watchers`, { signal: controller.signal });
  });

  it('fetchWatchers — omits the signal option when none is given', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ watchers: [], isWatching: false });

    // Act
    await fetchWatchers(RECORD);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/watchers`, {});
  });

  it('watchRecord — POSTs an empty body', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined);

    // Act
    await watchRecord(RECORD);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/watchers`, { method: 'POST', body: {} });
  });

  it('unwatchRecord — DELETEs the caller subscription by user id', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined);

    // Act
    await unwatchRecord(RECORD, USER);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/watchers/${USER}`, { method: 'DELETE' });
  });
});
