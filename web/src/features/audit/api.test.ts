// Tests for the audit api wrapper — verifies it POSTs the right path / body over the shared client.
// The client itself (apiFetch) is mocked; its own behaviour is covered in shared/http/apiClient.test.ts.

import type { AuditLogQuery, UserId, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { queryWorkspaceAudit } from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

beforeEach(() => jest.clearAllMocks());

it('queryWorkspaceAudit — POSTs the workspace path with the query body and signal', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 });
  const controller = new AbortController();
  const query: AuditLogQuery = {
    page: 2,
    pageSize: 25,
    eventType: 'gate.resolved',
    actorUserId: 'user-1' as UserId,
  };

  // Act
  await queryWorkspaceAudit(WORKSPACE_ID, query, controller.signal);

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/audit/query', {
    method: 'POST',
    body: query,
    signal: controller.signal,
  });
});

it('queryWorkspaceAudit — without a signal — omits it from the options', async () => {
  // Arrange
  mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 });

  // Act
  await queryWorkspaceAudit(WORKSPACE_ID, { page: 1, pageSize: 25 });

  // Assert
  expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/audit/query', {
    method: 'POST',
    body: { page: 1, pageSize: 25 },
  });
});
