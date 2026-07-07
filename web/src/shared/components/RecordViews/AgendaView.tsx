// Agenda view (Slice 24 — S24 advanced views). A day-grouped list — each day is a header with its records
// as compact rows beneath, calendar-agenda style. Shares the date grouping with the timeline; the
// difference is presentation (flat grouped list vs. a rail). Rows open the record; dateless records trail.

import { Badges } from './cardParts';
import { groupByDate } from './groupByDate';
import type { RecordViewItem } from './types';
import './recordViews.css';

export interface AgendaViewProps {
  items: RecordViewItem[];
  caption: string;
}

export function AgendaView({ items, caption }: AgendaViewProps) {
  const groups = groupByDate(items);

  return (
    <div className="rv-agenda" aria-label={caption}>
      {groups.map((group) => (
        <section key={group.key} className="rv-agenda__group" aria-label={group.label}>
          <h3 className="rv-agenda__date">
            {group.label}
            <span className="rv-agenda__count">{group.items.length}</span>
          </h3>
          <ul className="rv-agenda__rows">
            {group.items.map((item) => (
              <li key={item.id} className="rv-agenda__row">
                <div className="rv-agenda__row-main">
                  <button type="button" className="rv-card__open rv-agenda__title" onClick={item.onOpen}>
                    {item.title}
                  </button>
                  {item.subtitle && <span className="rv-agenda__subtitle">{item.subtitle}</span>}
                </div>
                <Badges badges={item.badges} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
