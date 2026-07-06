// S42 Filtered-to-zero — records exist but the current filters exclude all of them. Bordered card on
// --bg-surface (NEVER a pale fill — that ceremony is reserved for zero-data, S41), theme-aware text,
// and a secondary "Clear filters" CTA. Rendered inline within the list, in place of the grid.

import { useId } from 'react';

import { Button } from '@/shared/components/Button';

interface EmptyListFilteredToZeroProps {
  onClearFilters: () => void;
  /** Defaults to "No matches for these filters". */
  title?: string;
  /** Optional one-line hint below the title. */
  message?: string;
  /** Defaults to "Clear filters". */
  clearLabel?: string;
}

export function EmptyListFilteredToZero({
  onClearFilters,
  title = 'No matches for these filters',
  message,
  clearLabel = 'Clear filters',
}: EmptyListFilteredToZeroProps) {
  const titleId = useId();
  return (
    <section
      className="mws-empty mws-empty--filtered"
      data-ds="empty-filtered"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="mws-empty__title">
        {title}
      </h2>
      {message && <p className="mws-empty__body">{message}</p>}
      <div className="mws-empty__actions">
        <Button variant="secondary" onClick={onClearFilters}>
          {clearLabel}
        </Button>
      </div>
    </section>
  );
}
