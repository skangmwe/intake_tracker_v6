// "Needs your decision" panel (S1) — the open gates where the caller is an eligible, unsigned approver.
// Each row opens the record. Waiting time is derived from when the gate opened.

import { CaretRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { HomeDecisionItem } from '@shared/types';

import { StatusHoldPill } from '@/shared/components/Feedback';

import { formatWaiting } from '../homeFormat';
import { HomePanel } from './HomePanel';

interface DecisionsPanelProps {
  items: readonly HomeDecisionItem[];
  count: number;
}

export function DecisionsPanel({ items, count }: DecisionsPanelProps) {
  return (
    <HomePanel
      title="Needs your decision"
      meta={`${count} open`}
      isEmpty={items.length === 0}
      emptyLabel="No gates are waiting on you right now."
    >
      <ul className="home-list">
        {items.map((item) => (
          <li key={`${item.recordId}-${item.gateLabel}`}>
            <Link className="home-row" to={`/requests/${item.recordId}`}>
              <span className="home-row__id">{item.recordId}</span>
              <span className="home-row__main">
                <span className="home-row__name">
                  {item.name}
                  {item.statusHold && item.statusHold !== 'InProgress' && (
                    <>
                      {' '}
                      <StatusHoldPill statusHold={item.statusHold} />
                    </>
                  )}
                </span>
                <span className="home-row__meta">
                  Gate · {item.gateLabel} — your slot · {item.roleLabel}
                </span>
              </span>
              <span className="home-row__trail">{formatWaiting(item.openedAt)}</span>
              <CaretRight className="home-row__caret" size={16} weight="regular" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </HomePanel>
  );
}
