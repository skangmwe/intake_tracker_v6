// S4 Status-tab SLA block (record-detail reconciliation) — a navy-pill card showing the record's
// SLA state (On track / Due soon / Overdue / No due date). The state icon is decorative
// (aria-hidden); the bold label carries the meaning, so colour is never the sole indicator.

import { CheckCircle, MinusCircle, Timer, WarningCircle } from '@phosphor-icons/react';

import type { SlaStatus } from '@shared/types';

import { slaPresentation, type SlaIconKey } from '../statusPresentation';

const STATE_ICONS: Record<SlaIconKey, typeof Timer> = {
  overdue: WarningCircle,
  dueSoon: Timer,
  onTrack: CheckCircle,
  none: MinusCircle,
};

export function SlaBlock({ slaStatus }: { slaStatus: SlaStatus | undefined }) {
  const sla = slaPresentation(slaStatus);
  const StateIcon = STATE_ICONS[sla.iconKey];
  return (
    <section className="record-card" aria-label="SLA">
      <span className="record-chip">SLA</span>
      <div className="record-sla">
        <span className="record-sla__icon" data-tone={sla.tone} aria-hidden>
          <StateIcon size={20} />
        </span>
        <span className="record-sla__label">{sla.label}</span>
        <span className="record-sla__detail">{sla.detail}</span>
      </div>
    </section>
  );
}
