// S4 Status-tab summary row (record-detail reconciliation) — a bare label/value strip carrying
// Submitted · Lifecycle. Not a card; it leads the Status tab above the cards. (The "Status category"
// value was dropped — it echoed the Display-status pill and the stepper's current stage.)

import type { RequestDto } from '@shared/types';

import { formatSubmitted } from '../statusPresentation';

export function StatusSummaryRow({ request }: { request: RequestDto }) {
  return (
    <div className="record-summary">
      <span className="record-summary__item">
        <span className="record-summary__label">Submitted</span>
        <span className="record-summary__value">{formatSubmitted(request.createdAt)}</span>
      </span>
      <span className="record-summary__item">
        <span className="record-summary__label">Lifecycle</span>
        <span className="record-summary__value">{request.lifecycleName || '—'}</span>
      </span>
    </div>
  );
}
