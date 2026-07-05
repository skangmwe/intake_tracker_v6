// TanStack Query hook for escalation (S18) — web-state-management.md. On success it invalidates the
// record query so the PG surface refetches and renders its now-escalated variant (the "Escalated ·
// [origin]" pill, mirror note, and locked crossing fields), plus the lists whose rows may re-tint.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EscalateRequest, EscalateResult, RecordId } from '@shared/types';

import { escalateRequest } from './api';

export function useEscalate(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<EscalateResult, unknown, EscalateRequest>({
    mutationFn: (request) => escalateRequest(recordId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['request', recordId] });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
