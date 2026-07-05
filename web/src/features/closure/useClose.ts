// TanStack Query hook for closure (S4/S5) — web-state-management.md. On success it adopts the fresh
// record and invalidates the lists whose rows may re-tint / re-status.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RecordId, RequestCloseRequest, RequestDto } from '@shared/types';

import { closeRecord } from './api';

export function useCloseRecord(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<RequestDto, unknown, RequestCloseRequest>({
    mutationFn: (request) => closeRecord(recordId, request),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['request', recordId], fresh);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
