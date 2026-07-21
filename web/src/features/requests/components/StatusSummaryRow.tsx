// S4 Status-tab summary row (record-detail reconciliation) — a bare label/value strip carrying
// Submitted · Lifecycle · Status category, per the prototype's Details tab. Not a card; it leads
// the Status tab above the cards.

import type { RequestDto } from '@shared/types';

import { formatSubmitted, statusCategoryOf } from '../statusPresentation';

export function StatusSummaryRow({ request }: { request: RequestDto }) {
  const category = statusCategoryOf(request);
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
      <span className="record-summary__item">
        <span className="record-summary__label">Status category</span>
        {category ? (
          <span className="record-summary__category">{category}</span>
        ) : (
          <span className="record-summary__value">—</span>
        )}
      </span>
    </div>
  );
}
