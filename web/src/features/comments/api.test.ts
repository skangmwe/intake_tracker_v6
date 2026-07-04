// Unit tests for the comments API module. apiFetch is mocked at the HTTP boundary (web-testing.md).
// The thread call narrows the wire shape ({ kind, comment, event }) into the ActivityThreadItem
// union and drops malformed items — that mapping is the logic worth covering here.

import type { CommentId, RecordId, UserId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { fetchThread, postComment } from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const RECORD = 'AIS-00000001' as RecordId;

describe('comments api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchThread — narrows comment and event items and drops malformed ones', async () => {
    // Arrange — a valid comment, a valid event, and a malformed row missing both payloads.
    mockedFetch.mockResolvedValue([
      { kind: 'event', comment: null, event: { eventType: 'request.created', eventAt: '2026-07-01T09:00:00Z', summary: 'Request created' } },
      { kind: 'comment', comment: { id: 'c1' as CommentId, recordId: RECORD, objectType: 'Request', authorUserId: 'u1' as UserId, body: 'Hi', mentionedUserIds: [], createdAt: '2026-07-01T11:00:00Z' }, event: null },
      { kind: 'comment', comment: null, event: null },
    ] as never);

    // Act
    const thread = await fetchThread(RECORD);

    // Assert — the malformed row is dropped; the two valid items narrow to the union.
    expect(thread).toHaveLength(2);
    expect(thread[0]).toEqual({ kind: 'event', event: expect.objectContaining({ summary: 'Request created' }) });
    expect(thread[1]).toEqual({ kind: 'comment', comment: expect.objectContaining({ body: 'Hi' }) });
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/thread`, {});
  });

  it('fetchThread — passes the abort signal when provided', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();

    // Act
    await fetchThread(RECORD, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/thread`, { signal: controller.signal });
  });

  it('postComment — POSTs the comment body', () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);
    const request = { body: 'Ship it', mentionedUserIds: [] };

    // Act
    postComment(RECORD, request);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/comments`, { method: 'POST', body: request });
  });
});
