// S39 firm-wide audit table — the S33 table shape plus a Workspace column (the feed spans every
// workspace). Data-dense (data-visualization.md): scoped headers, 1px row rules, no vertical dividers,
// scrolls within its own shell. Reuses the audit feature's event-group / label helpers (promoted to
// its barrel) so the event pill is consistent with S33. Each row is one immutable AuditEntry.

import type { FirmWideAuditRowDto } from '@shared/types';

import { eventGroup, eventTypeLabel, type EventGroup } from '@/features/audit';
import { StatusPill } from '@/shared/components/Feedback';

const EM_DASH = '—';

type PillStatus = 'info' | 'success' | 'warning' | 'error' | 'neutral';

const GROUP_STATUS: Record<EventGroup, PillStatus> = {
  record: 'neutral',
  gate: 'info',
  escalation: 'warning',
  catalog: 'info',
  announcement: 'info',
  task: 'neutral',
  comment: 'neutral',
  attachment: 'neutral',
  config: 'info',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? EM_DASH
    : date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function formatPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function isEmptyPayload(payload: string): boolean {
  const trimmed = payload.trim();
  return trimmed === '' || trimmed === '{}';
}

interface FirmWideAuditTableProps {
  rows: FirmWideAuditRowDto[];
}

export function FirmWideAuditTable({ rows }: FirmWideAuditTableProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
    <div className="platform-table-shell" tabIndex={0} role="region" aria-label="Firm-wide audit entries">
      <table className="platform-table" data-ds="table">
        <caption className="mws-sr-only">Firm-wide audit log, newest first</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Workspace</th>
            <th scope="col">Event</th>
            <th scope="col">Record</th>
            <th scope="col">Actor</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.auditId}>
              <td className="platform-table__when">{formatWhen(row.eventAt)}</td>
              <td>{row.workspaceName ?? EM_DASH}</td>
              <td>
                <StatusPill status={GROUP_STATUS[eventGroup(row.eventType)]} label={eventTypeLabel(row.eventType)} />
              </td>
              <td className="platform-table__key">{row.recordId ?? EM_DASH}</td>
              <td>{row.actorName ?? (row.actorUserId ? 'Unknown user' : 'System')}</td>
              <td>
                {isEmptyPayload(row.payload) ? (
                  EM_DASH
                ) : (
                  <details className="platform-table__details">
                    <summary>Details</summary>
                    <pre className="platform-table__payload">{formatPayload(row.payload)}</pre>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
