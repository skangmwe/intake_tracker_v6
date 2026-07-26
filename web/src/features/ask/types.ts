// Ask surface types (Phase 4, §14). Mirrors AskController's DTOs and the SSE event payloads.

export type AskEventType = 'token' | 'citation' | 'error' | 'done';

/** One parsed SSE frame from the Ask stream. */
export interface AskStreamEvent {
  type: AskEventType;
  data: unknown;
}

/** A cited source record (from a `citation` event). */
export interface AskCitation {
  marker: number;
  recordId: string;
  title: string;
}

/** A turn in the current Ask session. Assistant turns stream in and, once done, carry a server
 *  `messageId` so the user can rate them. */
export interface AskTurn {
  /** Client-generated id for React keys and in-flight updates. */
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations: AskCitation[];
  isStreaming: boolean;
  /** Set when the stream failed — an honest error, shown in place. */
  error?: string;
  /** The persisted assistant message id (from the `done` event) — enables feedback. */
  messageId?: string;
  feedback?: 'up' | 'down';
}
