// "New to triage" panel (S1) — unassigned records awaiting an analyst. Each row opens the record and
// carries an "Unassigned" pill. Received time is relative.

import { CaretRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { HomeTriageItem } from '@shared/types';

import { formatRelative } from '../homeFormat';
import { HomePanel } from './HomePanel';

interface TriagePanelProps {
  items: readonly HomeTriageItem[];
  count: number;
}

export function TriagePanel({ items, count }: TriagePanelProps) {
  return (
    <HomePanel
      title="New to triage"
      meta={`${count} unassigned`}
      isEmpty={items.length === 0}
      emptyLabel="Nothing waiting to be triaged."
    >
      <ul className="home-list">
        {items.map((item) => (
          <li key={item.recordId}>
            <Link className="home-row" to={`/requests/${item.recordId}`}>
              <span className="home-row__id">{item.recordId}</span>
              <span className="home-row__main">
                <span className="home-row__name">{item.name}</span>
                <span className="home-row__meta">
                  {item.origin} · received {formatRelative(item.receivedAt)}
                </span>
              </span>
              <span className="home-badge home-badge--unassigned">Unassigned</span>
              <CaretRight className="home-row__caret" size={16} weight="regular" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </HomePanel>
  );
}
