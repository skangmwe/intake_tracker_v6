// TanStack Query hook for the S33 workspace audit log (web-state-management.md). The query key
// includes the workspace + the full filter set + page so a filter/page change refetches precisely.
// `placeholderData` keeps the current page visible while the next filter/page loads (no flash to
// empty). Disabled until a workspace is resolved. Access is enforced server-side (403 for non-admins).

import { useQuery } from '@tanstack/react-query';

import type { AuditLogQuery, AuditLogRowDto, PaginatedResponse, WorkspaceId } from '@shared/types';

import { queryWorkspaceAudit } from './api';

export const workspaceAuditKey = (workspaceId: WorkspaceId, query: AuditLogQuery) =>
  ['workspace-audit', workspaceId, query] as const;

/** A page of the workspace's audit log for the given filters. */
export function useWorkspaceAudit(workspaceId: WorkspaceId | undefined, query: AuditLogQuery) {
  return useQuery<PaginatedResponse<AuditLogRowDto>>({
    queryKey: workspaceId ? workspaceAuditKey(workspaceId, query) : ['workspace-audit', 'disabled'],
    queryFn: ({ signal }) => queryWorkspaceAudit(workspaceId as WorkspaceId, query, signal),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });
}
