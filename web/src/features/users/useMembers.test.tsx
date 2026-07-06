// Tests for the members hooks. The api module is mocked at the boundary; the hooks' own behaviour
// (list enable/disable, mutation → list invalidation) is what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { UserId, WorkspaceId } from '@shared/types';

import { deactivateMember, fetchMembers, upsertMember } from './api';
import { useDeactivateMember, useMembers, useUpsertMember } from './useMembers';

jest.mock('./api');
const mockedFetch = fetchMembers as jest.MockedFunction<typeof fetchMembers>;
const mockedUpsert = upsertMember as jest.MockedFunction<typeof upsertMember>;
const mockedDeactivate = deactivateMember as jest.MockedFunction<typeof deactivateMember>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const USER = '00000000-0000-4000-8000-0000000000aa' as UserId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe('useMembers', () => {
  it('fetches the workspace members when a workspace is set', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ members: [] });
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useMembers(WORKSPACE), { wrapper: Wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedFetch).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });

  it('is disabled (never fetches) when no workspace is resolved', () => {
    // Arrange
    const { Wrapper } = makeWrapper();

    // Act
    const { result } = renderHook(() => useMembers(undefined), { wrapper: Wrapper });

    // Assert
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('useUpsertMember', () => {
  it('upserts and invalidates the members list', async () => {
    // Arrange
    mockedUpsert.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpsertMember(WORKSPACE), { wrapper: Wrapper });

    // Act
    await result.current.mutateAsync({ email: 'x@mws.ai', level: 'Member' });

    // Assert
    expect(mockedUpsert).toHaveBeenCalledWith(WORKSPACE, { email: 'x@mws.ai', level: 'Member' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members', WORKSPACE] });
  });
});

describe('useDeactivateMember', () => {
  it('deactivates and invalidates the members list', async () => {
    // Arrange
    mockedDeactivate.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeactivateMember(WORKSPACE), { wrapper: Wrapper });

    // Act
    await result.current.mutateAsync(USER);

    // Assert
    expect(mockedDeactivate).toHaveBeenCalledWith(WORKSPACE, USER);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members', WORKSPACE] });
  });
});
