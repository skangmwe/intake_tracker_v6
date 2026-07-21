// S5 slim mirror note — the escalated-record provenance banner at the top of the Intake tab
// (blueprint §S5). No standalone three-part bridge panel: shared ID · crossing fields locked on PG ·
// PG follows delivery via the AI Solutions Status mirror · Delivery/Stabilization/Closure → "Delivered" on PG
// until closure. Pale-blue info surface, navy text (theme-stable).

import { ArrowsLeftRight } from '@phosphor-icons/react';

import type { BridgeBlock } from '@shared/types';

import './escalate.css';

export function EscalatedIntakeNote({ bridge }: { bridge: BridgeBlock }) {
  return (
    <aside className="escalated-note" aria-label="Escalation bridge">
      <ArrowsLeftRight size={16} weight="regular" aria-hidden className="escalated-note__icon" />
      <p className="escalated-note__text">
        Escalated from <strong>{bridge.originWorkspaceName}</strong> — shared ID, crossing fields locked on the
        PG side. The PG side follows delivery through the <strong>AI Solutions Status</strong> mirror
        (currently <strong>{bridge.aiSolutionsStatus || '—'}</strong>); Delivery, Stabilization and Closure show as “Delivered”
        on the PG side until closure.
      </p>
    </aside>
  );
}
