// The Ask session hook (Phase 4). Owns the running turns of the current conversation, the grounded stream,
// and thumbs feedback. A conversation is created lazily on the first question and reused for the session.
// Streaming updates are functional setState patches so concurrent token/citation events never race.

import { useCallback, useRef, useState } from 'react';
import type { WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';

import { createConversation, openAskStream, setMessageFeedback } from './api';
import { readSseEvents } from './sseStream';
import type { AskCitation, AskTurn } from './types';

export interface UseAskConversation {
  turns: AskTurn[];
  isStreaming: boolean;
  ask: (query: string) => void;
  stop: () => void;
  rate: (turnId: string, messageId: string, rating: 'up' | 'down') => void;
}

function patchTurn(turns: AskTurn[], id: string, apply: (turn: AskTurn) => Partial<AskTurn>): AskTurn[] {
  return turns.map((turn) => (turn.id === id ? { ...turn, ...apply(turn) } : turn));
}

export function useAskConversation(workspaceId: WorkspaceId | undefined): UseAskConversation {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runStream = useCallback(
    async (ws: WorkspaceId, query: string, assistantId: string, signal: AbortSignal) => {
      try {
        if (!conversationIdRef.current) {
          const created = await createConversation(ws);
          conversationIdRef.current = created.conversationId;
        }

        const response = await openAskStream(ws, conversationIdRef.current, query, null, signal);

        for await (const event of readSseEvents(response, signal)) {
          if (event.type === 'token') {
            const { text } = event.data as { text: string };
            setTurns((prev) => patchTurn(prev, assistantId, (turn) => ({ text: turn.text + text })));
          } else if (event.type === 'citation') {
            const citation = event.data as AskCitation;
            setTurns((prev) =>
              patchTurn(prev, assistantId, (turn) =>
                turn.citations.some((existing) => existing.marker === citation.marker)
                  ? {}
                  : { citations: [...turn.citations, citation] },
              ),
            );
          } else if (event.type === 'error') {
            const { message } = event.data as { message: string };
            setTurns((prev) => patchTurn(prev, assistantId, () => ({ error: message, isStreaming: false })));
          } else if (event.type === 'done') {
            const { messageId } = event.data as { messageId: string };
            setTurns((prev) => patchTurn(prev, assistantId, () => ({ messageId, isStreaming: false })));
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          const message =
            error instanceof ApiError ? error.problem.detail : 'The answer couldn’t be completed. Try again.';
          setTurns((prev) => patchTurn(prev, assistantId, () => ({ error: message, isStreaming: false })));
        }
      } finally {
        setTurns((prev) => patchTurn(prev, assistantId, (turn) => (turn.isStreaming ? { isStreaming: false } : {})));
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const ask = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!workspaceId || isStreaming || trimmed.length === 0) return;

      const userTurn: AskTurn = { id: crypto.randomUUID(), role: 'user', text: trimmed, citations: [], isStreaming: false };
      const assistantId = crypto.randomUUID();
      const assistantTurn: AskTurn = { id: assistantId, role: 'assistant', text: '', citations: [], isStreaming: true };
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      void runStream(workspaceId, trimmed, assistantId, controller.signal);
    },
    [workspaceId, isStreaming, runStream],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const rate = useCallback(
    (turnId: string, messageId: string, rating: 'up' | 'down') => {
      if (!workspaceId) return;
      setTurns((prev) => patchTurn(prev, turnId, () => ({ feedback: rating })));
      setMessageFeedback(workspaceId, messageId, rating).catch(() => {
        // Best-effort — revert the optimistic vote if the server rejects it.
        setTurns((prev) => patchTurn(prev, turnId, () => ({ feedback: undefined })));
      });
    },
    [workspaceId],
  );

  return { turns, isStreaming, ask, stop, rate };
}
