// Shared items-count footer for list surfaces (Requests, Feature Catalog, Toolkit, …). Bordered
// footer attached to the bottom of the grid/shell: left = "start–end of total {noun}" summary,
// right = prev/next page nav. One implementation so the scroll region and the items count read
// identically on every list screen.

import { CaretLeft, CaretRight } from '@phosphor-icons/react';

import { IconButton } from '@/shared/components/Button';

import './TableFooter.css';

interface TableFooterProps {
  page: number;
  totalPages: number;
  total: number;
  start: number;
  end: number;
  /** Plural noun for the count, e.g. "records" (default) or "features". */
  noun?: string;
  onPrev: () => void;
  onNext: () => void;
}

export function TableFooter({
  page,
  totalPages,
  total,
  start,
  end,
  noun = 'records',
  onPrev,
  onNext,
}: TableFooterProps) {
  return (
    <div className="table-footer" data-ds="table-footer">
      <span className="table-footer__summary">
        {total === 0 ? `0 ${noun}` : `${start}–${end} of ${total} ${noun}`}
      </span>
      <div className="table-footer__nav">
        <IconButton icon={CaretLeft} label="Previous page" bordered onClick={onPrev} />
        <span className="table-footer__page">
          Page {page} of {totalPages}
        </span>
        <IconButton icon={CaretRight} label="Next page" bordered onClick={onNext} />
      </div>
    </div>
  );
}
