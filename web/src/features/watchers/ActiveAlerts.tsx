// S4 Watchers & alerts tab — the "Active alerts" card (record-detail reconciliation). Renders the
// feed composed by computeActiveAlerts from the record's SLA + Status/hold plus its open/blocked
// gates. No new backend: gates come from the existing approval-requests read. Alert icons are
// decorative (aria-hidden); the bold title carries the meaning.

import { Hourglass, Pause, Prohibit, Timer, Warning, WarningCircle } from '@phosphor-icons/react';

import type { RequestDto } from '@shared/types';

import { useApprovalRequests } from '@/features/gates';

import { computeActiveAlerts, type AlertIconKey } from './activeAlertsModel';

const ALERT_ICONS: Record<AlertIconKey, typeof Timer> = {
  overdue: WarningCircle,
  dueSoon: Timer,
  hold: Pause,
  abandoned: Prohibit,
  gateOpen: Hourglass,
  gateBlocked: WarningCircle,
};

export function ActiveAlerts({ request }: { request: RequestDto }) {
  const { data: gates } = useApprovalRequests(request.id);
  const alerts = computeActiveAlerts(request, gates);

  return (
    <section className="record-card" aria-label="Active alerts">
      <span className="record-chip">
        <Warning size={15} aria-hidden />
        Active alerts
      </span>

      {alerts.length === 0 ? (
        <p className="caption">
          Nothing needs attention right now. Overdue dates, blocked gates, pending approvals, and
          holds will surface here.
        </p>
      ) : (
        <ul className="record-alerts">
          {alerts.map((alert) => {
            const AlertIcon = ALERT_ICONS[alert.iconKey];
            return (
              <li className="record-alert" key={alert.id}>
                <span className="record-alert__icon" data-tone={alert.tone} aria-hidden>
                  <AlertIcon size={20} />
                </span>
                <span className="record-alert__body">
                  <span className="record-alert__title">{alert.title}</span>
                  {alert.note && <span className="record-alert__note">{alert.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
