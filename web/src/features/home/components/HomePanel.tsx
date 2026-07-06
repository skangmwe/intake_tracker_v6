// The card shell shared by every Home panel (S1). A titled card with an optional right-aligned meta
// (count or date), then the panel body. Matches the prototype: navy-tinted header bar, Georgia title,
// monospace meta. When a panel has no items it renders a short in-card note (a section-level empty
// state — not the page-level S41/S42 surfaces).

import type { ReactNode } from 'react';

interface HomePanelProps {
  title: string;
  /** Right-aligned header meta — "2 open", "Since Tue 1 Jul", etc. */
  meta?: string;
  /** When true, the panel shows its empty note instead of children. */
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}

export function HomePanel({ title, meta, isEmpty, emptyLabel, children }: HomePanelProps) {
  return (
    <section className="home-panel mws-card" data-ds="card">
      <div className="home-panel__header">
        <h2 className="home-panel__title">{title}</h2>
        {meta && <span className="home-panel__meta">{meta}</span>}
      </div>
      {isEmpty ? <p className="home-panel__empty">{emptyLabel}</p> : children}
    </section>
  );
}
