// S33 Workspace audit — the workspace-admin read of the append-only audit trail (BS §12). Resolves
// the active workspace + admin level from the signed-in user; the whole surface is WorkspaceAdmin-only
// (the API enforces it too — the UI gate is a courtesy, not the boundary). The workspace members feed
// the actor filter's options. Renders the three non-data states (loading / error / empty) explicitly
// (web-component-architecture.md). The log is append-only and read-only — there is nothing to mutate.

import { useMemo, useState } from 'react';

import type { AuditLogQuery } from '@shared/types';

import { AUDIT_LOG_PAGE_SIZE } from '@/shared/constants';
import { Button } from '@/shared/components/Button';
import { EmptyListFilteredToZero } from '@/shared/components/EdgeStates';
import type { SelectOption } from '@/shared/components/Form';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';
import { useMe } from '@/features/users/useMe';
import { useMembers } from '@/features/users/useMembers';

import {
  AuditFilterBar,
  EMPTY_AUDIT_FILTERS,
  toAuditQuery,
  type AuditFilterValues,
} from './AuditFilterBar';
import { AuditLogTable } from './AuditLogTable';
import { useWorkspaceAudit } from '../useWorkspaceAudit';

export function WorkspaceAuditPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const workspaceId = useActiveWorkspaceId();
  const isAdmin = useMemo(
    () =>
      (me?.memberships ?? []).some(
        (membership) =>
          membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
      ),
    [me, workspaceId],
  );

  const enabledWorkspace = isAdmin ? (workspaceId ?? undefined) : undefined;

  const [filters, setFilters] = useState<AuditFilterValues>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);

  const members = useMembers(enabledWorkspace);
  const actorOptions = useMemo<SelectOption[]>(
    () =>
      (members.data?.members ?? []).map((member) => ({
        value: member.userId,
        label: member.displayName,
      })),
    [members.data],
  );

  const query = useMemo<AuditLogQuery>(
    () => ({ page, pageSize: AUDIT_LOG_PAGE_SIZE, ...toAuditQuery(filters) }),
    [page, filters],
  );

  const audit = useWorkspaceAudit(enabledWorkspace, query);
  const rows = audit.data?.items ?? [];
  const total = audit.data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * AUDIT_LOG_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * AUDIT_LOG_PAGE_SIZE);

  const applyFilters = (next: AuditFilterValues) => {
    setFilters(next);
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_AUDIT_FILTERS);
    setPage(1);
  };

  if (meLoading) {
    return (
      <div className="audit-page">
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (meError || !workspaceId) {
    return (
      <div className="audit-page">
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="audit-page">
        <p className="mws-alert mws-alert--warning" role="alert">
          The audit log is available to workspace admins. Ask a workspace admin if you need to
          review activity.
        </p>
      </div>
    );
  }

  return (
    <div className="audit-page">
      <AuditFilterBar
        value={filters}
        actorOptions={actorOptions}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {audit.isLoading && (
        <p className="caption" role="status">
          Loading audit entries…
        </p>
      )}

      {audit.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The audit log could not be loaded. Try again in a moment.
        </p>
      )}

      {audit.data && rows.length === 0 && (
        <EmptyListFilteredToZero
          title="No matching activity"
          message="No audit entries match these filters. Try widening the date range or clearing filters."
          onClearFilters={clearFilters}
        />
      )}

      {audit.data && rows.length > 0 && (
        <>
          <p className="caption audit-page__count" role="status">
            Showing {rangeStart}–{rangeEnd} of {total} {total === 1 ? 'entry' : 'entries'}
          </p>
          <AuditLogTable rows={rows} />
          {pageCount > 1 && (
            <nav className="audit-page__pager" aria-label="Audit log pages">
              <Button
                variant="secondary"
                compact
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="caption">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="secondary"
                compact
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
