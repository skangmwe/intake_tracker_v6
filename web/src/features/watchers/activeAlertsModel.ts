// Pure composition of a record's "Active alerts" feed (S4 Watchers & alerts tab). Composed from
// signals already on the record — SLA status + Status/hold — plus its open/blocked gates. No new
// backend: every input is data the client already holds (record-detail reconciliation). No React,
// no I/O (web-file-structure.md); unit-tested in activeAlertsModel.test.ts.
// (Named `activeAlertsModel` to avoid a case-only filename clash with the ActiveAlerts component.)

import type { ApprovalRequestDto, RequestDto } from '@shared/types';

export type AlertTone = 'error' | 'warning';
export type AlertIconKey = 'overdue' | 'dueSoon' | 'hold' | 'gateOpen' | 'gateBlocked';

/** One row in the Active-alerts feed. */
export interface ActiveAlert {
  /** Stable key for the list. */
  id: string;
  tone: AlertTone;
  iconKey: AlertIconKey;
  title: string;
  /** Optional supporting line (e.g. the hold reason). */
  note?: string;
}

/**
 * Compose the active alerts for a record. Order: SLA breach, then Status/hold, then each open or
 * blocked gate. Resolved gates and an on-track / no-due-date SLA contribute nothing — an empty
 * array renders the "nothing needs attention" empty state.
 */
export function computeActiveAlerts(
  request: RequestDto,
  gates: ApprovalRequestDto[] | undefined,
): ActiveAlert[] {
  const alerts: ActiveAlert[] = [];

  if (request.slaStatus === 'Overdue') {
    alerts.push({ id: 'sla-overdue', tone: 'error', iconKey: 'overdue', title: 'Past the due date' });
  } else if (request.slaStatus === 'DueSoon') {
    alerts.push({ id: 'sla-due-soon', tone: 'warning', iconKey: 'dueSoon', title: 'Due soon' });
  }

  // Only attach a note when there's a non-empty reason — exactOptionalPropertyTypes forbids an
  // explicit `undefined` on the optional `note` field.
  const reason = request.statusHoldNote?.trim();
  if (request.statusHold === 'OnHold') {
    alerts.push({ id: 'hold', tone: 'warning', iconKey: 'hold', title: 'On hold', ...(reason ? { note: reason } : {}) });
  }

  for (const gate of gates ?? []) {
    // Gate state (gates.ts): Pending → awaiting sign-off, ChangesRequested → blocked, Resolved → done.
    if (gate.state === 'Pending') {
      alerts.push({
        id: `gate-open-${gate.id}`,
        tone: 'warning',
        iconKey: 'gateOpen',
        title: `${gate.gateName} awaiting sign-off`,
      });
    } else if (gate.state === 'ChangesRequested') {
      alerts.push({
        id: `gate-blocked-${gate.id}`,
        tone: 'error',
        iconKey: 'gateBlocked',
        title: `${gate.gateName} — changes requested`,
      });
    }
  }

  return alerts;
}
