// View-mode segmented control (Slice 24 — S24 advanced views, forms-and-input.md segmented pattern).
// Switches a list surface between its available layouts. Mutually exclusive: exactly one kind is active.
// Presentation-only affordance offered to every viewer (S11 is "all roles"; a layout never widens access).

import type { ComponentType } from 'react';
import { Rows, Kanban, ClockCounterClockwise, CalendarBlank, GridFour } from '@phosphor-icons/react';
import type { IconProps } from '@phosphor-icons/react';

import type { RecordViewKind } from './types';
import './recordViews.css';

const KIND_META: Record<RecordViewKind, { label: string; icon: ComponentType<IconProps> }> = {
  table: { label: 'Table', icon: Rows },
  kanban: { label: 'Board', icon: Kanban },
  timeline: { label: 'Timeline', icon: ClockCounterClockwise },
  agenda: { label: 'Agenda', icon: CalendarBlank },
  gallery: { label: 'Gallery', icon: GridFour },
};

// Canonical render order for every surface. A surface's `available` list is filtered to this order,
// so the segments always appear list → board → timeline → agenda → gallery regardless of the order
// they were passed in. Only the kinds a surface offers are shown.
const KIND_ORDER: RecordViewKind[] = ['table', 'kanban', 'timeline', 'agenda', 'gallery'];

export interface ViewModeToggleProps {
  /** Layouts offered on this surface, in render order. */
  available: RecordViewKind[];
  active: RecordViewKind;
  onChange: (kind: RecordViewKind) => void;
  /** Accessible name for the group (e.g. "Requests layout"). */
  label: string;
  /** Compact icon-only segments: labels stay in the DOM (accessible name) but are visually hidden,
   *  and each segment gets a hover tooltip. Use where the toggle sits beside a primary action. */
  iconOnly?: boolean;
}

export function ViewModeToggle({ available, active, onChange, label, iconOnly = false }: ViewModeToggleProps) {
  if (available.length < 2) return null;

  return (
    <div
      className={`rv-toggle${iconOnly ? ' rv-toggle--icon-only' : ''}`}
      role="group"
      aria-label={label}
      data-ds="segmented"
    >
      {KIND_ORDER.filter((kind) => available.includes(kind)).map((kind) => {
        const meta = KIND_META[kind];
        const IconComponent = meta.icon;
        const isActive = kind === active;
        return (
          <button
            key={kind}
            type="button"
            className={`rv-toggle__seg${isActive ? ' rv-toggle__seg--active' : ''}`}
            aria-pressed={isActive}
            title={iconOnly ? meta.label : undefined}
            onClick={() => onChange(kind)}
          >
            <IconComponent size={16} weight="regular" aria-hidden />
            <span className="rv-toggle__label">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
