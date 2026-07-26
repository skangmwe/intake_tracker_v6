// api.ts — requestFieldSuggestion posts to the field-suggestion route and threads an optional abort signal.

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { requestFieldSuggestion } from './api';
import type { FieldSuggestionRequest } from './types';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const BODY: FieldSuggestionRequest = { objectType: 'Request', targetFieldKey: 'name', fields: {} };

describe('requestFieldSuggestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue({ value: null, rationale: '' });
  });

  it('posts to the workspace field-suggestion route with the body', async () => {
    // Act
    await requestFieldSuggestion(WORKSPACE_ID, BODY);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/field-suggestion', {
      method: 'POST',
      body: BODY,
    });
  });

  it('threads an abort signal when provided', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await requestFieldSuggestion(WORKSPACE_ID, BODY, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/field-suggestion', {
      method: 'POST',
      body: BODY,
      signal: controller.signal,
    });
  });
});
