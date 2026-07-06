// The canonical items-grid (S2). A CSS-grid table — not a <table> — matching the prototype:
// header fill, sticky header inside the scroll container, drag-resizable columns, sort-cycle
// headers, 1px horizontal row rules (no vertical dividers), row click → onOpen. The list owns
// its own scroll; the outer shell is flex:1/min-height:0 so it fills the page region.
// data-visualization.md: the accessible open trigger is a per-row control the consumer supplies;
// the row click is a convenience, so the row is not a button.

import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { CaretDown, CaretUp, DotsThreeVertical } from '@phosphor-icons/react';

import './TableShell.css';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: number | undefined;
  sortable?: boolean | undefined;
  filterable?: boolean | undefined;
  align?: 'left' | 'right' | 'center' | undefined;
}

export interface TableRow {
  id: string;
  cells: ReactNode[];
  /** Extra row class — e.g. an aging tint from agingTintClass(). */
  tint?: string | undefined;
  onOpen?: (() => void) | undefined;
}

interface TableShellProps {
  columns: TableColumn[];
  rows: TableRow[];
  sort?: SortState | undefined;
  onSortChange?: ((next: SortState | undefined) => void) | undefined;
  /** Per-filterable-column funnel slot (e.g. a <FilterFunnel/>). */
  renderFilter?: ((column: TableColumn) => ReactNode) | undefined;
  /** Accessible name for the grid. */
  caption: string;
}

const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 70;
const LAST_COL_MIN = 160;
const RESIZE_STEP = 16;

function nextSort(current: SortState | undefined, key: string): SortState | undefined {
  if (!current || current.column !== key) return { column: key, direction: 'asc' };
  if (current.direction === 'asc') return { column: key, direction: 'desc' };
  return undefined;
}

function alignClass(align: TableColumn['align']): string {
  if (align === 'right') return ' ast-grid__cell--right';
  if (align === 'center') return ' ast-grid__cell--center';
  return '';
}

export function TableShell({ columns, rows, sort, onSortChange, renderFilter, caption }: TableShellProps) {
  const [widths, setWidths] = useState<number[]>(() =>
    columns.map((column) => column.width ?? DEFAULT_COL_WIDTH),
  );
  const [drag, setDrag] = useState<{ index: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (event: MouseEvent) => {
      const delta = event.clientX - drag.startX;
      const width = Math.max(MIN_COL_WIDTH, drag.startWidth + delta);
      setWidths((prev) => prev.map((value, index) => (index === drag.index ? width : value)));
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]);

  const lastIndex = columns.length - 1;

  const gridTemplate = useMemo(
    () =>
      columns
        .map((_, index) =>
          index === lastIndex
            ? `minmax(${LAST_COL_MIN}px, 1fr)`
            : `${widths[index] ?? DEFAULT_COL_WIDTH}px`,
        )
        .join(' '),
    [columns, widths, lastIndex],
  );

  const minWidth = useMemo(
    () =>
      columns.slice(0, -1).reduce((sum, _, index) => sum + (widths[index] ?? DEFAULT_COL_WIDTH), 0) +
      LAST_COL_MIN,
    [columns, widths],
  );

  const rowStyle = useMemo<CSSProperties>(() => ({ gridTemplateColumns: gridTemplate }), [gridTemplate]);
  const tableStyle = useMemo<CSSProperties>(() => ({ minWidth: `${minWidth}px` }), [minWidth]);

  const resizeBy = (index: number, delta: number) =>
    setWidths((prev) => prev.map((value, at) => (at === index ? Math.max(MIN_COL_WIDTH, value + delta) : value)));

  const onHandleKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      resizeBy(index, -RESIZE_STEP);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      resizeBy(index, RESIZE_STEP);
    }
  };

  return (
    <div className="ast-grid" data-ds="table">
      <div className="ast-grid__scroll">
        <div className="ast-grid__table" role="table" aria-label={caption} style={tableStyle}>
          <div className="ast-grid__rowgroup" role="rowgroup">
            <div className="ast-grid__head" role="row" style={rowStyle}>
              {columns.map((column, index) => {
                const isSorted = sort?.column === column.key;
                const ariaSort = isSorted ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <div
                    key={column.key}
                    role="columnheader"
                    aria-sort={column.sortable ? ariaSort : undefined}
                    className={`ast-grid__th${alignClass(column.align)}`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="ast-grid__sort"
                        onClick={() => onSortChange?.(nextSort(sort, column.key))}
                      >
                        <span>{column.label}</span>
                        {isSorted && sort?.direction === 'asc' && <CaretUp size={14} weight="regular" aria-hidden />}
                        {isSorted && sort?.direction === 'desc' && (
                          <CaretDown size={14} weight="regular" aria-hidden />
                        )}
                        {!isSorted && (
                          <DotsThreeVertical size={14} weight="regular" aria-hidden className="ast-grid__sort-idle" />
                        )}
                      </button>
                    ) : (
                      <span className="ast-grid__th-label">{column.label}</span>
                    )}
                    {column.filterable && renderFilter && (
                      <span className="ast-grid__filter">{renderFilter(column)}</span>
                    )}
                    {index !== lastIndex && (
                      <>
                        {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the resize handle is a focusable window-splitter (role=separator + aria-valuenow + arrow-key resize); jsx-a11y treats separator as non-interactive, which is a false positive here. */}
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${column.label} column`}
                          aria-valuenow={widths[index] ?? DEFAULT_COL_WIDTH}
                          aria-valuemin={MIN_COL_WIDTH}
                          tabIndex={0}
                          className="ast-grid__resize"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setDrag({ index, startX: event.clientX, startWidth: widths[index] ?? DEFAULT_COL_WIDTH });
                          }}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => onHandleKeyDown(event, index)}
                        />
                        {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ast-grid__rowgroup" role="rowgroup">
            {rows.map((row) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the row click is a convenience; the accessible open trigger is a per-row control the consumer supplies (data-visualization.md), so the row itself is not focusable or keyboard-activated.
              <div
                key={row.id}
                role="row"
                className={`ast-grid__row${row.onOpen ? ' ast-grid__row--clickable' : ''}${row.tint ? ` ${row.tint}` : ''}`}
                style={rowStyle}
                onClick={row.onOpen}
              >
                {row.cells.map((cell, index) => (
                  <div
                    key={columns[index]?.key ?? index}
                    role="cell"
                    className={`ast-grid__cell${alignClass(columns[index]?.align)}`}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
