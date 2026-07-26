// Unit tests for the SSE frame reader. Feeds a fake Response body stream and asserts typed events,
// including a frame that arrives split across two reads and an unknown event type that is dropped.

import { readSseEvents } from './sseStream';

function responseOf(...chunks: string[]): Response {
  // A minimal ReadableStreamDefaultReader stand-in — jsdom has no ReadableStream, and readSseEvents only
  // uses getReader().read()/releaseLock().
  const encoder = new TextEncoder();
  const queue = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;
  const reader = {
    read: async () =>
      index < queue.length
        ? { value: queue[index++], done: false }
        : { value: undefined, done: true },
    releaseLock: () => {},
  };
  return { body: { getReader: () => reader } } as unknown as Response;
}

async function collect(response: Response) {
  const events = [];
  for await (const event of readSseEvents(response)) events.push(event);
  return events;
}

describe('readSseEvents', () => {
  it('readSseEvents — token, citation, done frames — yields typed events', async () => {
    // Arrange
    const response = responseOf(
      'event: token\ndata: {"text":"hi"}\n\n',
      'event: citation\ndata: {"marker":1,"recordId":"LIT-9004","title":"T"}\n\n',
      'event: done\ndata: {"messageId":"m1"}\n\n',
    );

    // Act
    const events = await collect(response);

    // Assert
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'token', data: { text: 'hi' } });
    expect(events[1].type).toBe('citation');
    expect(events[2]).toEqual({ type: 'done', data: { messageId: 'm1' } });
  });

  it('readSseEvents — frame split across reads — still parses once complete', async () => {
    // Arrange - the frame boundary lands only after the second chunk.
    const response = responseOf('event: token\ndata: {"text":', '"split"}\n\n');

    // Act
    const events = await collect(response);

    // Assert
    expect(events).toEqual([{ type: 'token', data: { text: 'split' } }]);
  });

  it('readSseEvents — unknown event type — is dropped', async () => {
    // Arrange
    const response = responseOf('event: mystery\ndata: {}\n\n', 'event: token\ndata: {"text":"x"}\n\n');

    // Act
    const events = await collect(response);

    // Assert
    expect(events).toEqual([{ type: 'token', data: { text: 'x' } }]);
  });

  it('readSseEvents — no body — yields nothing', async () => {
    // Act
    const events = await collect({ body: null } as unknown as Response);

    // Assert
    expect(events).toEqual([]);
  });
});
