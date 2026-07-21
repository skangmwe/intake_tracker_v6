// The bar above the items-grid (S2): a saved-view picker slot, an export-view slot, active-filter
// pills (each removable) with a "Clear all" shown only while filters are active, a flex spacer,
// then a primary-action slot (e.g. Create request). Slots are ReactNode so S2 composes its own
// pieces. Filter pills use pale-blue fill with navy text (theme-stable foreground rule).

import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

import './ViewBar.css';

export interface ActiveFilterPill {
  id: string;
  label: string;
  onRemove: () => void;
}

interface ViewBarProps {
  viewPicker?: ReactNode;
  exportSlot?: ReactNode;
  /** Layout switcher slot (Slice 24 — the advanced-view ViewModeToggle). Renders on the left. */
  layoutSlot?: ReactNode;
  /** Right-aligned slot rendered just before the primary action (e.g. a compact layout toggle). */
  trailingSlot?: ReactNode;
  filters?: ActiveFilterPill[];
  onClearAll?: () => void;
  primaryAction?: ReactNode;
}

export function ViewBar({
  viewPicker,
  exportSlot,
  layoutSlot,
  trailingSlot,
  filters = [],
  onClearAll,
  primaryAction,
}: ViewBarProps) {
  const hasFilters = filters.length > 0;
  return (
    <div className="ast-viewbar" data-ds="view-bar">
      {viewPicker && <div className="ast-viewbar__slot">{viewPicker}</div>}
      {exportSlot && <div className="ast-viewbar__slot">{exportSlot}</div>}
      {layoutSlot && <div className="ast-viewbar__slot">{layoutSlot}</div>}

      {hasFilters && (
        <ul className="ast-viewbar__filters" aria-label="Active filters">
          {filters.map((filter) => (
            <li key={filter.id} className="ast-viewbar__pill">
              <span className="ast-viewbar__pill-label">{filter.label}</span>
              <button
                type="button"
                className="ast-viewbar__pill-remove"
                aria-label={`Remove filter ${filter.label}`}
                onClick={filter.onRemove}
              >
                <X size={14} weight="regular" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasFilters && onClearAll && (
        <button type="button" className="ast-viewbar__clear" onClick={onClearAll}>
          Clear all
        </button>
      )}

      <div className="ast-viewbar__spacer" />

      {trailingSlot && <div className="ast-viewbar__slot">{trailingSlot}</div>}
      {primaryAction && <div className="ast-viewbar__slot">{primaryAction}</div>}
    </div>
  );
}
