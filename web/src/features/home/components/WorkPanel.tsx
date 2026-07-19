// "Your work today" panel (S1) — the records the caller owns, urgency-ordered. The due badge tints by
// SLA state (overdue / due soon), else it renders as plain text. Each row opens the record.

import { CaretRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { HomeWorkItem } from '@shared/types';

import { StatusHoldPill } from '@/shared/components/Feedback';

import { dueBadgeClass, formatDue } from '../homeFormat';
import { HomePanel } from './HomePanel';

interface WorkPanelProps {
  items: readonly HomeWorkItem[];
  count: number;
}

export function WorkPanel({ items, count }: WorkPanelProps) {
  return (
    <HomePanel
      title="Your work today"
      meta={`${count} assigned`}
      isEmpty={items.length === 0}
      emptyLabel="Nothing assigned to you today."
    >
      <ul className="home-list">
        {items.map((item) => {
          const dueLabel = formatDue(item.dueDate, item.slaStatus);
          const badgeClass = dueBadgeClass(item.slaStatus);
          return (
            <li key={item.recordId}>
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
                    {item.stageLabel} · {item.origin}
                  </span>
                </span>
                {badgeClass ? (
                  <span className={badgeClass}>{dueLabel}</span>
                ) : (
                  <span className="home-row__trail">{dueLabel}</span>
                )}
                <CaretRight className="home-row__caret" size={16} weight="regular" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </HomePanel>
  );
}
