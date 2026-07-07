// Kanban / board view (Slice 24 — S24 advanced views). Groups the normalised items into columns by
// `groupValue`. Read-only in R1 Phase 2: cards open the record; there is no drag-to-change (a stage
// change runs through the gated transition on the record, not a board drop). Columns render in the
// supplied order so a workflow surface keeps its stage order; unknown / empty groups collect at the end.

import { Badges, MetaList, Tags } from './cardParts';
import type { RecordViewItem } from './types';
import './recordViews.css';

const UNASSIGNED = 'Unassigned';

export interface KanbanViewProps {
  items: RecordViewItem[];
  /** Column labels in render order. A value not in this list is appended after the ordered columns. */
  groupOrder: string[];
  /** Accessible caption naming what the board shows. */
  caption: string;
}

function groupItems(items: RecordViewItem[], groupOrder: string[]): Array<[string, RecordViewItem[]]> {
  const buckets = new Map<string, RecordViewItem[]>();
  for (const label of groupOrder) buckets.set(label, []);

  for (const item of items) {
    const key = item.groupValue && item.groupValue.trim() !== '' ? item.groupValue : UNASSIGNED;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return [...buckets.entries()];
}

export function KanbanView({ items, groupOrder, caption }: KanbanViewProps) {
  const columns = groupItems(items, groupOrder);

  return (
    <div className="rv-board" aria-label={caption}>
      {columns.map(([label, columnItems]) => (
        <section key={label} className="rv-board__column" aria-label={`${label} (${columnItems.length})`}>
          <header className="rv-board__column-head">
            <span className="rv-board__column-title">{label}</span>
            <span className="rv-board__column-count">{columnItems.length}</span>
          </header>
          <div className="rv-board__cards">
            {columnItems.map((item) => (
              <article key={item.id} className="rv-card rv-card--kanban">
                <button type="button" className="rv-card__open" onClick={item.onOpen}>
                  {item.title}
                </button>
                {item.subtitle && <p className="rv-card__subtitle">{item.subtitle}</p>}
                <Badges badges={item.badges} />
                <MetaList meta={item.meta} />
                <Tags tags={item.tags} />
              </article>
            ))}
            {columnItems.length === 0 && <p className="rv-board__column-empty">No records</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
