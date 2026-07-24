// S33 audit log table — a semantic, data-dense table (data-visualization.md): scoped column headers,
// 1px row rules, no vertical dividers, em-dash for empty cells; it scrolls within its own shell so the
// page never scrolls horizontally. Each row is one immutable AuditEntry. The event type is a
// group-tinted StatusPill paired with its label (never colour alone). The structured payload is
// tucked behind a native <details> disclosure so the row stays scannable but the full record is one
// keystroke away.

import type { AuditLogRowDto } from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import { formatDateTime } from '@/shared/utils/dateFormat';

import { eventGroup, eventTypeLabel, type EventGroup } from '../constants';

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
    : formatDateTime(date);
}

/** Pretty-print the payload JSON; fall back to the raw string if it doesn't parse. */
function formatPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

/** True when the payload carries nothing worth disclosing (empty object / blank). */
function isEmptyPayload(payload: string): boolean {
  const trimmed = payload.trim();
  return trimmed === '' || trimmed === '{}';
}

interface AuditLogTableProps {
  rows: AuditLogRowDto[];
}

export function AuditLogTable({ rows }: AuditLogTableProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable so keyboard users can scroll it (axe scrollable-region-focusable).
    <div className="audit-table-shell" tabIndex={0} role="region" aria-label="Audit log entries">
      <table className="audit-table" data-ds="table">
        <caption className="mws-sr-only">Workspace audit log, newest first</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Event</th>
            <th scope="col">Record</th>
            <th scope="col">Actor</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.auditId}>
              <td className="audit-table__when">{formatWhen(row.eventAt)}</td>
              <td>
                <StatusPill status={GROUP_STATUS[eventGroup(row.eventType)]} label={eventTypeLabel(row.eventType)} />
              </td>
              <td className="audit-table__record">{row.recordId ?? EM_DASH}</td>
              <td>{row.actorName ?? (row.actorUserId ? 'Unknown user' : 'System')}</td>
              <td>
                {isEmptyPayload(row.payload) ? (
                  EM_DASH
                ) : (
                  <details className="audit-table__details">
                    <summary>Details</summary>
                    <pre className="audit-table__payload">{formatPayload(row.payload)}</pre>
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
