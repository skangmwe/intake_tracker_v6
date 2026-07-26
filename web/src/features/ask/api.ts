// Ask surface calls (Phase 4, Slice 3). Conversation create + feedback are ordinary JSON; the answer is
// a Server-Sent Events stream opened with a POST body + bearer token (apiFetchEventStream). Mirrors the
// AskController routes. All endpoints are workspace-membership gated and own-scoped server-side.

import type { WorkspaceId } from '@shared/types';

import { apiFetch, apiFetchEventStream } from '@/shared/http/apiClient';

interface ConversationCreatedResponse {
  conversationId: string;
}

export function createConversation(workspaceId: WorkspaceId, title?: string): Promise<ConversationCreatedResponse> {
  return apiFetch<ConversationCreatedResponse>(`/v1/workspaces/${workspaceId}/ai/conversations`, {
    method: 'POST',
    body: { title: title ?? null },
  });
}

export function openAskStream(
  workspaceId: WorkspaceId,
  conversationId: string,
  query: string,
  provider: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  return apiFetchEventStream(
    `/v1/workspaces/${workspaceId}/ai/conversations/${conversationId}/ask`,
    { query, provider },
    signal,
  );
}

export function setMessageFeedback(
  workspaceId: WorkspaceId,
  messageId: string,
  rating: 'up' | 'down',
): Promise<void> {
  return apiFetch<void>(`/v1/workspaces/${workspaceId}/ai/messages/${messageId}/feedback`, {
    method: 'POST',
    body: { rating },
  });
}
