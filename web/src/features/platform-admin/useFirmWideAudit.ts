// TanStack Query hook for the S39 firm-wide audit log. The query key includes the full filter set +
// page so a filter/page change refetches precisely. `placeholderData` keeps the current page visible
// while the next loads. Disabled until the caller is confirmed a Platform admin (the API enforces it).

import { useQuery } from '@tanstack/react-query';

import type { FirmWideAuditQuery, FirmWideAuditRowDto, PaginatedResponse } from '@shared/types';

import { queryFirmWideAudit } from './api';

export const firmWideAuditKey = (query: FirmWideAuditQuery) =>
  ['platform', 'firm-audit', query] as const;

export function useFirmWideAudit(enabled: boolean, query: FirmWideAuditQuery) {
  return useQuery<PaginatedResponse<FirmWideAuditRowDto>>({
    queryKey: enabled ? firmWideAuditKey(query) : ['platform', 'firm-audit', 'disabled'],
    queryFn: ({ signal }) => queryFirmWideAudit(query, signal),
    enabled,
    placeholderData: (previous) => previous,
  });
}
