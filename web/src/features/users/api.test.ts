// Tests for the users members api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch) is mocked; its own behaviour is covered in
// shared/http/apiClient.test.ts.

import type { UserId, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { deactivateMember, fetchMembers, upsertMember } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const USER = '00000000-0000-4000-8000-0000000000aa' as UserId;

beforeEach(() => jest.clearAllMocks());

describe('users members api', () => {
  it('fetchMembers — GETs the workspace members and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({ members: [] } as never);
    const controller = new AbortController();

    // Act
    await fetchMembers(WORKSPACE, controller.signal);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0];
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/members`);
    expect((opts as { signal: AbortSignal }).signal).toBe(controller.signal);
  });

  it('upsertMember — POSTs the upsert body', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);

    // Act
    await upsertMember(WORKSPACE, { email: 'x@mws.ai', level: 'Member' });

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0];
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/members`);
    expect(opts).toMatchObject({ method: 'POST', body: { email: 'x@mws.ai', level: 'Member' } });
  });

  it('deactivateMember — DELETEs the member by id', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);

    // Act
    await deactivateMember(WORKSPACE, USER);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0];
    expect(path).toBe(`/v1/workspaces/${WORKSPACE}/members/${USER}`);
    expect(opts).toMatchObject({ method: 'DELETE' });
  });
});
