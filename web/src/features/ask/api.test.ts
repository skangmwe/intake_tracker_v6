// Unit tests for the ask api wrappers — assert the routes, methods, and bodies. The shared client is mocked
// so no network is touched.

import type { WorkspaceId } from '@shared/types';

import * as client from '@/shared/http/apiClient';

import { createConversation, openAskStream, setMessageFeedback } from './api';

jest.mock('@/shared/http/apiClient');

const mocked = client as jest.Mocked<typeof client>;
const WS = 'ws-1' as WorkspaceId;

describe('ask api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createConversation — POSTs the title', async () => {
    // Arrange
    mocked.apiFetch.mockResolvedValue({ conversationId: 'c1' });

    // Act
    const result = await createConversation(WS, 'My thread');

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/conversations', {
      method: 'POST',
      body: { title: 'My thread' },
    });
    expect(result.conversationId).toBe('c1');
  });

  it('createConversation — defaults a missing title to null', async () => {
    // Arrange
    mocked.apiFetch.mockResolvedValue({ conversationId: 'c1' });

    // Act
    await createConversation(WS);

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/conversations', {
      method: 'POST',
      body: { title: null },
    });
  });

  it('openAskStream — opens the SSE stream with the query + provider', async () => {
    // Arrange
    mocked.apiFetchEventStream.mockResolvedValue({} as Response);

    // Act
    await openAskStream(WS, 'c1', 'retention?', null);

    // Assert
    expect(mocked.apiFetchEventStream).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/ai/conversations/c1/ask',
      { query: 'retention?', provider: null },
      undefined,
    );
  });

  it('setMessageFeedback — POSTs the rating', async () => {
    // Arrange
    mocked.apiFetch.mockResolvedValue(undefined);

    // Act
    await setMessageFeedback(WS, 'm1', 'up');

    // Assert
    expect(mocked.apiFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/ai/messages/m1/feedback', {
      method: 'POST',
      body: { rating: 'up' },
    });
  });
});
