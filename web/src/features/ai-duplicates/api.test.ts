// api.ts — checkDuplicates / confirmDuplicate post to the duplicate-check routes and thread an optional signal.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { checkDuplicates, confirmDuplicate } from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;

describe('ai-duplicates api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(undefined as never);
  });

  it('checkDuplicates — posts to the duplicate-check route', async () => {
    // Act
    await checkDuplicates(WORKSPACE_ID, 'LIT-9004');

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004', {
      method: 'POST',
    });
  });

  it('checkDuplicates — threads an abort signal when provided', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await checkDuplicates(WORKSPACE_ID, 'LIT-9004', controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004', {
      method: 'POST',
      signal: controller.signal,
    });
  });

  it('confirmDuplicate — posts the confirm body to the confirm route', async () => {
    // Act
    await confirmDuplicate(WORKSPACE_ID, 'LIT-9004', {
      duplicateOfRecordId: 'LIT-9010',
      rationale: 'Same request.',
    });

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/ai/duplicate-check/LIT-9004/confirm',
      { method: 'POST', body: { duplicateOfRecordId: 'LIT-9010', rationale: 'Same request.' } },
    );
  });
});
