// Advanced-view vocabulary (Slice 24 — BS §10.5). The four alternate list layouts (Kanban / timeline /
// agenda / gallery) plus the classic table render over ONE normalised item shape so a surface (Requests
// list S2, Feature catalog S9/S11, …) maps its rows once and every layout reuses them. Presentation only:
// an advanced view NEVER widens access — it renders the same access-filtered rows the table would show.

import type { ReactNode } from 'react';

/** The layout a list surface renders in. `table` is the classic items-grid; the rest are the S24 advanced views. */
export type RecordViewKind = 'table' | 'kanban' | 'timeline' | 'agenda' | 'gallery';

/** A small labelled status chip on a card (e.g. a stage or maturity badge). Tone maps to a pale fill. */
export interface RecordViewBadge {
  label: string;
  /** Pale-fill tone; navy text applies in every tone (theme-stable rule). Defaults to neutral. */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
}

/**
 * One record, normalised for every advanced layout. A surface builds this array from its own row shape
 * (RequestListRow, FeatureListRow, …); the renderers stay generic and pure.
 */
// Optional fields are typed `?: T | undefined` deliberately: the project runs with
// `exactOptionalPropertyTypes`, so a surface that builds an item can pass `undefined` explicitly
// (e.g. `subtitle: row.desc ? … : undefined`) without a per-field conditional spread.
export interface RecordViewItem {
  /** Stable record id — the React key and the drill-through target. */
  id: string;
  /** Primary label shown on the card / row. */
  title: string;
  /** Optional secondary line (description / one-liner). */
  subtitle?: string | undefined;
  /** Kanban grouping value (e.g. Stage, Maturity). Items with no value fall into an "Unassigned" column. */
  groupValue?: string | undefined;
  /** Timeline / agenda anchor — an ISO date (YYYY-MM-DD…). Items with no date fall into a "No date" group. */
  dateValue?: string | undefined;
  /** Status chips rendered on the card. */
  badges?: RecordViewBadge[] | undefined;
  /** Free-text tags rendered as muted chips. */
  tags?: string[] | undefined;
  /** Gallery thumbnail — an authenticated attachment content path. Absent → placeholder card. */
  thumbnailUrl?: string | undefined;
  /** A couple of label/value meta pairs shown under the title (e.g. Owner, Origin). */
  meta?: Array<{ label: string; value: ReactNode }> | undefined;
  /** Open the record. */
  onOpen: () => void;
}
