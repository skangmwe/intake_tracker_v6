// Timeline view (Slice 24 — S24 advanced views). Records placed chronologically on a vertical rail by
// their `dateValue` (e.g. Due date). Each day is a node on the rail; its records sit beside it. Read-only —
// entries open the record. Dateless records collect in a trailing "No date" node so nothing is dropped.

import { Badges, MetaList } from './cardParts';
import { groupByDate } from './groupByDate';
import type { RecordViewItem } from './types';
import './recordViews.css';

export interface TimelineViewProps {
  items: RecordViewItem[];
  caption: string;
}

export function TimelineView({ items, caption }: TimelineViewProps) {
  const groups = groupByDate(items);

  return (
    <ol className="rv-timeline" aria-label={caption}>
      {groups.map((group) => (
        <li key={group.key} className="rv-timeline__node">
          <div className="rv-timeline__rail" aria-hidden>
            <span className="rv-timeline__dot" />
          </div>
          <div className="rv-timeline__content">
            <h3 className="rv-timeline__date">{group.label}</h3>
            <div className="rv-timeline__cards">
              {group.items.map((item) => (
                <article key={item.id} className="rv-card rv-card--timeline">
                  <button type="button" className="rv-card__open" onClick={item.onOpen}>
                    {item.title}
                  </button>
                  {item.subtitle && <p className="rv-card__subtitle">{item.subtitle}</p>}
                  <Badges badges={item.badges} />
                  <MetaList meta={item.meta} />
                </article>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
