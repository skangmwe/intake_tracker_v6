// Workspace audit-log API call (S33) — api-contracts.md §18. One thin apiFetch wrapper; the /api
// prefix is added inside apiFetch. POST-with-body per api/CLAUDE.md (the filter set is multi-field).
// The workspace id is a path segment; the filters + paging ride the body.

import type { AuditLogQuery, AuditLogRowDto, PaginatedResponse, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** A page of the workspace's audit log, newest first, filtered per the query. WorkspaceAdmin-only. */
export function queryWorkspaceAudit(
  workspaceId: WorkspaceId,
  query: AuditLogQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<AuditLogRowDto>> {
  return apiFetch<PaginatedResponse<AuditLogRowDto>>(`/v1/workspaces/${workspaceId}/audit/query`, {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}
