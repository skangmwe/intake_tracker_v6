// Unit tests for the Ask session hook. The api + SSE reader are mocked so the streaming state machine is
// exercised deterministically: happy stream, mid-stream error, conversation reuse, feedback, and guards.

import { renderHook, act, waitFor } from '@testing-library/react';
import type { WorkspaceId } from '@shared/types';

import * as api from './api';
import * as sse from './sseStream';
import { useAskConversation } from './askModel';
import type { AskStreamEvent } from './types';

jest.mock('./api');
jest.mock('./sseStream');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedSse = sse as jest.Mocked<typeof sse>;
const WS = 'ws-1' as WorkspaceId;

function streamOf(...events: AskStreamEvent[]) {
  mockedSse.readSseEvents.mockImplementation(async function* generate() {
    for (const event of events) yield event;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.createConversation.mockResolvedValue({ conversationId: 'c1' });
  mockedApi.openAskStream.mockResolvedValue({} as Response);
  mockedApi.setMessageFeedback.mockResolvedValue(undefined);
});

describe('useAskConversation', () => {
  it('useAskConversation — happy stream — appends turns, tokens, citation, and message id', async () => {
    // Arrange
    streamOf(
      { type: 'token', data: { text: 'Hello ' } },
      { type: 'token', data: { text: 'world' } },
      { type: 'citation', data: { marker: 1, recordId: 'LIT-9004', title: 'T' } },
      { type: 'done', data: { messageId: 'm1' } },
    );
    const { result } = renderHook(() => useAskConversation(WS));

    // Act
    act(() => result.current.ask('hi'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Assert
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns[0]).toMatchObject({ role: 'user', text: 'hi' });
    expect(result.current.turns[1]).toMatchObject({ role: 'assistant', text: 'Hello world', messageId: 'm1' });
    expect(result.current.turns[1].citations).toHaveLength(1);
    expect(mockedApi.createConversation).toHaveBeenCalledWith(WS);
  });

  it('useAskConversation — mid-stream error — marks the assistant turn with the error', async () => {
    // Arrange
    streamOf({ type: 'token', data: { text: 'partial' } }, { type: 'error', data: { message: 'boom' } });
    const { result } = renderHook(() => useAskConversation(WS));

    // Act
    act(() => result.current.ask('q'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Assert
    expect(result.current.turns[1].error).toBe('boom');
  });

  it('useAskConversation — second ask — reuses the same conversation', async () => {
    // Arrange
    streamOf({ type: 'done', data: { messageId: 'm1' } });
    const { result } = renderHook(() => useAskConversation(WS));

    // Act
    act(() => result.current.ask('one'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    act(() => result.current.ask('two'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Assert - the conversation is created once and reused.
    expect(mockedApi.createConversation).toHaveBeenCalledTimes(1);
    expect(result.current.turns).toHaveLength(4);
  });

  it('useAskConversation — rate — records the vote optimistically and calls the api', async () => {
    // Arrange
    streamOf({ type: 'done', data: { messageId: 'm1' } });
    const { result } = renderHook(() => useAskConversation(WS));
    act(() => result.current.ask('q'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Act
    const assistantId = result.current.turns[1].id;
    act(() => result.current.rate(assistantId, 'm1', 'up'));

    // Assert
    expect(mockedApi.setMessageFeedback).toHaveBeenCalledWith(WS, 'm1', 'up');
    await waitFor(() => expect(result.current.turns[1].feedback).toBe('up'));
  });

  it('useAskConversation — stream open fails — marks the turn with a fallback error', async () => {
    // Arrange - the stream never opens (e.g. a transient network failure, not an abort).
    mockedApi.openAskStream.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAskConversation(WS));

    // Act
    act(() => result.current.ask('q'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Assert
    expect(result.current.turns[1].error).toMatch(/couldn’t be completed/i);
  });

  it('useAskConversation — feedback rejected — reverts the optimistic vote', async () => {
    // Arrange - a completed turn, then a failing feedback call.
    streamOf({ type: 'done', data: { messageId: 'm1' } });
    mockedApi.setMessageFeedback.mockRejectedValue(new Error('rejected'));
    const { result } = renderHook(() => useAskConversation(WS));
    act(() => result.current.ask('q'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // Act
    const assistantId = result.current.turns[1].id;
    act(() => result.current.rate(assistantId, 'm1', 'down'));

    // Assert - the vote is rolled back when the server rejects it.
    await waitFor(() => expect(result.current.turns[1].feedback).toBeUndefined());
  });

  it('useAskConversation — no workspace — ask is a no-op and stop never throws', () => {
    // Arrange
    const { result } = renderHook(() => useAskConversation(undefined));

    // Act
    act(() => result.current.ask('x'));
    act(() => result.current.stop());

    // Assert
    expect(result.current.turns).toHaveLength(0);
    expect(mockedApi.createConversation).not.toHaveBeenCalled();
  });
});
