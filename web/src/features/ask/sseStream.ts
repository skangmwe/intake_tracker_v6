// A minimal Server-Sent Events reader for the Ask stream (Phase 4). Parses `event:` / `data:` frames from
// a fetch Response body and yields typed events. Pure and framework-free so it is unit-testable without the
// DOM. Unknown event types are ignored (forward-compatible). Stops when the caller's signal aborts.

import type { AskEventType, AskStreamEvent } from './types';

const KNOWN_EVENTS: readonly AskEventType[] = ['token', 'citation', 'error', 'done'];

export async function* readSseEvents(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<AskStreamEvent> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseFrame(frame);
        if (event) yield event;
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): AskStreamEvent | null {
  let type: string | null = null;
  let data = '';

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      type = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }

  if (!type || !KNOWN_EVENTS.includes(type as AskEventType)) return null;

  let parsed: unknown = data;
  try {
    parsed = JSON.parse(data);
  } catch {
    // Non-JSON data — keep the raw string.
  }

  return { type: type as AskEventType, data: parsed };
}
