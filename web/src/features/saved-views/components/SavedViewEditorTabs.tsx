// The three tab bodies of the saved-view editor (S24): Filters (row-based field+comparator+value
// builder that ANDs together), Fields (a two-pane column shuttle with ordering), and Sort
// (reorderable direction rows). Dense builder rows use native controls with aria-labels styled by
// the mws classes; the surface-level name field uses the Form TextField. Pure presentational —
// state lives in the parent editor.

import { ArrowDown, ArrowUp, Plus, X } from '@phosphor-icons/react';

import { IconButton } from '@/shared/components/Button';

import type { FilterComparator, FilterRow, SortRow } from '../savedViewEditorModel';

export interface ColumnOption {
  key: string;
  label: string;
}

const COMPARATORS: Array<{ value: FilterComparator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'is', label: 'is (any of)' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'at least' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'at most' },
];

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}`;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export function FiltersTab({
  rows,
  columns,
  onChange,
}: {
  rows: FilterRow[];
  columns: ColumnOption[];
  onChange: (rows: FilterRow[]) => void;
}) {
  const update = (id: string, patch: Partial<FilterRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));
  const add = () =>
    onChange([
      ...rows,
      { id: randomId(), column: columns[0]?.key ?? '', comparator: 'contains', value: '' },
    ]);

  return (
    <div className="sv-tab" role="tabpanel" aria-label="Filters">
      <p className="sv-tab__hint">All conditions must match (they combine with AND).</p>
      {rows.length === 0 && (
        <p className="sv-tab__empty">No filters — this view shows every row you can see.</p>
      )}
      <ul className="sv-rows">
        {rows.map((row) => (
          <li key={row.id} className="sv-row">
            <select
              className="mws-select sv-row__col"
              aria-label="Filter column"
              value={row.column}
              onChange={(event) => update(row.id, { column: event.target.value })}
            >
              {columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
            <select
              className="mws-select sv-row__op"
              aria-label="Comparator"
              value={row.comparator}
              onChange={(event) =>
                update(row.id, { comparator: event.target.value as FilterComparator })
              }
            >
              {COMPARATORS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="mws-input sv-row__val"
              aria-label="Filter value"
              value={row.value}
              placeholder={row.comparator === 'is' ? 'value, value…' : 'value'}
              onChange={(event) => update(row.id, { value: event.target.value })}
            />
            <IconButton icon={X} label="Remove filter" onClick={() => remove(row.id)} />
          </li>
        ))}
      </ul>
      <button type="button" className="sv-add" onClick={add}>
        <Plus size={16} weight="regular" aria-hidden /> Add filter
      </button>
    </div>
  );
}

// ── Fields (column shuttle) ────────────────────────────────────────────────────

export function FieldsTab({
  selected,
  columns,
  onChange,
}: {
  selected: string[];
  columns: ColumnOption[];
  onChange: (selected: string[]) => void;
}) {
  const labelFor = (key: string) => columns.find((column) => column.key === key)?.label ?? key;
  const available = columns.filter((column) => !selected.includes(column.key));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="sv-tab" role="tabpanel" aria-label="Fields">
      <p className="sv-tab__hint">Choose the columns to show and the order they appear in.</p>
      <ol className="sv-fields" aria-label="Selected columns">
        {selected.map((key, index) => (
          <li key={key} className="sv-field">
            <span className="sv-field__label">{labelFor(key)}</span>
            <span className="sv-field__actions">
              <IconButton
                icon={ArrowUp}
                label={`Move ${labelFor(key)} up`}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Move ${labelFor(key)} down`}
                onClick={() => move(index, 1)}
              />
              <IconButton
                icon={X}
                label={`Remove ${labelFor(key)}`}
                onClick={() => onChange(selected.filter((column) => column !== key))}
              />
            </span>
          </li>
        ))}
        {selected.length === 0 && <li className="sv-tab__empty">Add at least one column below.</li>}
      </ol>
      {available.length > 0 && (
        <label className="sv-add-field">
          <span className="visually-hidden">Add a column</span>
          <select
            className="mws-select"
            aria-label="Add a column"
            value=""
            onChange={(event) => {
              if (event.target.value) onChange([...selected, event.target.value]);
            }}
          >
            <option value="" disabled>
              + Add a column…
            </option>
            {available.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ── Sort ────────────────────────────────────────────────────────────────────

export function SortTab({
  rows,
  columns,
  onChange,
}: {
  rows: SortRow[];
  columns: ColumnOption[];
  onChange: (rows: SortRow[]) => void;
}) {
  const update = (id: string, patch: Partial<SortRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));
  const add = () =>
    onChange([...rows, { id: randomId(), column: columns[0]?.key ?? '', direction: 'asc' }]);

  return (
    <div className="sv-tab" role="tabpanel" aria-label="Sort">
      <p className="sv-tab__hint">Rows sort by each rule in order.</p>
      {rows.length === 0 && (
        <p className="sv-tab__empty">No sort — rows use the surface's default order.</p>
      )}
      <ul className="sv-rows">
        {rows.map((row) => (
          <li key={row.id} className="sv-row">
            <select
              className="mws-select sv-row__col"
              aria-label="Sort column"
              value={row.column}
              onChange={(event) => update(row.id, { column: event.target.value })}
            >
              {columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
            <select
              className="mws-select sv-row__op"
              aria-label="Sort direction"
              value={row.direction}
              onChange={(event) =>
                update(row.id, { direction: event.target.value as 'asc' | 'desc' })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <IconButton icon={X} label="Remove sort" onClick={() => remove(row.id)} />
          </li>
        ))}
      </ul>
      <button type="button" className="sv-add" onClick={add}>
        <Plus size={16} weight="regular" aria-hidden /> Add sort
      </button>
    </div>
  );
}
