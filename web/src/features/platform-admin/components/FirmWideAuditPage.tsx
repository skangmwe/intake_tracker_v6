// S39 Firm-wide audit — the append-only audit trail across EVERY workspace, including Platform-admin
// edits to platform-defined fields (BS §12/§4.3). Platform-admin only; invisible to workspace admins
// (the API enforces it). Filters by date / record / event type, paginated newest-first. Renders the
// three non-data states explicitly; a filtered-to-zero result uses the bordered card, not the pale
// zero-data ceremony (loading-empty-and-error-states.md).

import { useMemo, useState } from 'react';

import type { FirmWideAuditQuery } from '@shared/types';

import { AUDIT_LOG_PAGE_SIZE } from '@/shared/constants';
import { Button } from '@/shared/components/Button';

import { PlatformGate } from './PlatformGate';
import {
  EMPTY_FIRM_AUDIT_FILTERS,
  FirmAuditFilterBar,
  toFirmAuditQuery,
  type FirmAuditFilterValues,
} from './FirmAuditFilterBar';
import { FirmWideAuditTable } from './FirmWideAuditTable';
import { useFirmWideAudit } from '../useFirmWideAudit';
import { usePlatformAdmin } from '../usePlatformAdmin';

function FirmWideAuditSurface() {
  const [filters, setFilters] = useState<FirmAuditFilterValues>(EMPTY_FIRM_AUDIT_FILTERS);
  const [page, setPage] = useState(1);

  const query = useMemo<FirmWideAuditQuery>(
    () => ({ page, pageSize: AUDIT_LOG_PAGE_SIZE, ...toFirmAuditQuery(filters) }),
    [page, filters],
  );

  const audit = useFirmWideAudit(true, query);
  const rows = audit.data?.items ?? [];
  const total = audit.data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * AUDIT_LOG_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * AUDIT_LOG_PAGE_SIZE);

  const applyFilters = (next: FirmAuditFilterValues) => {
    setFilters(next);
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FIRM_AUDIT_FILTERS);
    setPage(1);
  };

  return (
    <>
      <FirmAuditFilterBar value={filters} onApply={applyFilters} onClear={clearFilters} />

      {audit.isLoading && (
        <p className="caption" role="status">
          Loading audit entries…
        </p>
      )}

      {audit.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The firm-wide audit log could not be loaded. Try again in a moment.
        </p>
      )}

      {audit.data && rows.length === 0 && (
        <section className="mws-empty mws-empty--filtered" aria-labelledby="firm-audit-none">
          <h2 id="firm-audit-none" className="h3">
            No matching activity
          </h2>
          <p className="body">
            No audit entries match these filters. Try widening the date range or clearing filters.
          </p>
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </section>
      )}

      {audit.data && rows.length > 0 && (
        <>
          <p className="caption platform-admin__count" role="status">
            Showing {rangeStart}–{rangeEnd} of {total} {total === 1 ? 'entry' : 'entries'}
          </p>
          <FirmWideAuditTable rows={rows} />
          {pageCount > 1 && (
            <nav className="platform-admin__pager" aria-label="Firm-wide audit pages">
              <Button variant="secondary" compact disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="caption">
                Page {page} of {pageCount}
              </span>
              <Button variant="secondary" compact disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function FirmWideAuditPage() {
  const { isPlatformAdmin } = usePlatformAdmin();

  return (
    <PlatformGate
      title="Firm-wide audit"
      lead="Every change across every workspace — field edits, gate decisions, config changes, escalations, and platform edits — newest first. Append-only and uneditable."
    >
      {isPlatformAdmin && <FirmWideAuditSurface />}
    </PlatformGate>
  );
}
