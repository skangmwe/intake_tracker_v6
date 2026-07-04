// Per-column filter funnel (S2). A funnel button (accent when a filter is active) opens a
// viewport-aware popover whose body is type-aware: select (checkbox list with per-value counts),
// number (comparator expression), date (From/To), text (contains). Live-applies on every change
// and offers "Clear filter". Reuses the global .mws-popover surface.

import { useEffect, useRef, useState } from 'react';
import { FunnelSimple } from '@phosphor-icons/react';

import './FilterFunnel.css';

export type FilterType = 'select' | 'number' | 'date' | 'text';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterValue {
  kind: FilterType;
  values?: string[];
  expression?: string;
  from?: string;
  to?: string;
  contains?: string;
}

interface FilterFunnelProps {
  type: FilterType;
  columnLabel: string;
  value?: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  options?: FilterOption[] | undefined;
}

function isActive(value: FilterValue | undefined): boolean {
  if (!value) return false;
  return Boolean(
    value.values?.length ||
      value.expression?.trim() ||
      value.from ||
      value.to ||
      value.contains?.trim(),
  );
}

export function FilterFunnel({ type, columnLabel, value, onChange, options = [] }: FilterFunnelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current: FilterValue = value ?? { kind: type };
  const active = isActive(value);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleSelect = (optionValue: string) => {
    const values = current.values ?? [];
    const next = values.includes(optionValue)
      ? values.filter((entry) => entry !== optionValue)
      : [...values, optionValue];
    onChange({ kind: 'select', values: next });
  };

  return (
    <div className="ast-funnel" ref={containerRef} data-ds="filter-funnel">
      <button
        ref={buttonRef}
        type="button"
        className={`ast-funnel__btn${active ? ' ast-funnel__btn--active' : ''}`}
        aria-label={`Filter ${columnLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <FunnelSimple size={16} weight="regular" aria-hidden />
      </button>

      {open && (
        <div className="mws-popover ast-funnel__pop" role="dialog" aria-label={`Filter ${columnLabel}`}>
          {type === 'select' && (
            <ul className="ast-funnel__list">
              {options.map((option) => (
                <li key={option.value}>
                  <label className="ast-funnel__opt">
                    <input
                      type="checkbox"
                      checked={current.values?.includes(option.value) ?? false}
                      onChange={() => toggleSelect(option.value)}
                    />
                    <span className="ast-funnel__opt-label">{option.label}</span>
                    {option.count !== undefined && <span className="ast-funnel__count">{option.count}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {type === 'number' && (
            <label className="ast-funnel__field">
              <span className="ast-funnel__label">Value</span>
              <input
                className="mws-input"
                inputMode="text"
                placeholder="e.g. >5 or =7"
                value={current.expression ?? ''}
                onChange={(event) => onChange({ kind: 'number', expression: event.target.value })}
              />
            </label>
          )}

          {type === 'date' && (
            <div className="ast-funnel__dates">
              <label className="ast-funnel__field">
                <span className="ast-funnel__label">From</span>
                <input
                  className="mws-input"
                  type="date"
                  value={current.from ?? ''}
                  onChange={(event) => onChange({ ...current, kind: 'date', from: event.target.value })}
                />
              </label>
              <label className="ast-funnel__field">
                <span className="ast-funnel__label">To</span>
                <input
                  className="mws-input"
                  type="date"
                  value={current.to ?? ''}
                  onChange={(event) => onChange({ ...current, kind: 'date', to: event.target.value })}
                />
              </label>
            </div>
          )}

          {type === 'text' && (
            <label className="ast-funnel__field">
              <span className="ast-funnel__label">Contains</span>
              <input
                className="mws-input"
                type="text"
                placeholder="contains…"
                value={current.contains ?? ''}
                onChange={(event) => onChange({ kind: 'text', contains: event.target.value })}
              />
            </label>
          )}

          <div className="ast-funnel__footer">
            <button
              type="button"
              className="mws-link mws-link--cta ast-funnel__clear"
              disabled={!active}
              onClick={() => onChange({ kind: type })}
            >
              Clear filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
