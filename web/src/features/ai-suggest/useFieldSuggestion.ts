// TanStack mutation for a one-shot field suggestion (server state only — web-state-management.md). The caller
// owns an AbortController so an in-flight request is cancelled on unmount; the signal is threaded through here.

import { useMutation } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import { requestFieldSuggestion } from './api';
import type { FieldSuggestion, FieldSuggestionRequest } from './types';

interface SuggestVariables {
  body: FieldSuggestionRequest;
  signal?: AbortSignal;
}

export function useFieldSuggestion(workspaceId: WorkspaceId) {
  return useMutation<FieldSuggestion, Error, SuggestVariables>({
    mutationFn: ({ body, signal }) => requestFieldSuggestion(workspaceId, body, signal),
  });
}
