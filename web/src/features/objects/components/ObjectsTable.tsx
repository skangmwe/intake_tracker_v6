// S30 Objects list — the shared list-surface (TableShell) so it reads like Members / Requests:
// sortable headers, per-column funnels on Object name / Plural label / Location, resizable columns,
// 1px row rules. Records / Fields are right-aligned monospace numerals; Description is a 2-line clamp.
// A row click opens the object editor sheet (the accessible open control is the row itself via
// TableShell's onOpen). Pagination is handled by the parent's footer.

import type { ReactNode } from 'react';
import { CaretRight, Table } from '@phosphor-icons/react';

import type { ObjectDefinitionDto } from '@shared/types';

import { IconButton } from '@/shared/components/Button';
import {
  type FilterOption,
  FilterFunnel,
  type FilterType,
  type FilterValue,
  type SortState,
  type TableColumn,
  TableShell,
} from '@/shared/components/Table';

import { locationLabel } from '../constants';
import type { ObjectColumnKey, ObjectsFilters } from '../objectsView';

const EM_DASH = '—';

// Object name / Plural / Location sort + filter (text, text, select); Records / Fields sort only
// (numeric); Description flexes and is neither sortable nor filterable (matches the prototype). The
// trailing View column is the keyboard-accessible open trigger (the row click is a convenience only
// — data-visualization.md Row-detail pattern).
const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Object name', width: 200, sortable: true, filterable: true },
  { key: 'plural', label: 'Plural label', width: 170, sortable: true, filterable: true },
  { key: 'records', label: 'Records', width: 110, sortable: true, align: 'right' },
  { key: 'fieldCount', label: 'Fields', width: 90, sortable: true, align: 'right' },
  { key: 'location', label: 'Location', width: 150, sortable: true, filterable: true },
  { key: 'description', label: 'Description', flex: true },
  { key: 'view', label: 'View', width: 96, align: 'center' },
];

const FILTER_TYPES: Record<'name' | 'plural' | 'location', FilterType> = {
  name: 'text',
  plural: 'text',
  location: 'select',
};

interface ObjectsTableProps {
  rows: ObjectDefinitionDto[];
  sort: SortState | undefined;
  onSortChange: (next: SortState | undefined) => void;
  filters: ObjectsFilters;
  onFilterChange: (column: ObjectColumnKey, value: FilterValue) => void;
  locationOptions: FilterOption[];
  onOpen: (object: ObjectDefinitionDto) => void;
  /** Open a custom object's records list. Rendered as a per-row "View records" control for custom
   *  objects only (built-ins have no in-app records surface). Omitted → the control is not shown. */
  onViewRecords?: (object: ObjectDefinitionDto) => void;
}

export function ObjectsTable({
  rows,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  locationOptions,
  onOpen,
  onViewRecords,
}: ObjectsTableProps) {
  const renderFilter = (column: TableColumn): ReactNode => {
    const key = column.key as 'name' | 'plural' | 'location';
    const type = FILTER_TYPES[key];
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        options={key === 'location' ? locationOptions : undefined}
        value={filters[key] ?? { kind: type }}
        onChange={(next) => onFilterChange(key, next)}
      />
    );
  };

  const tableRows = rows.map((object) => ({
    id: object.id,
    onOpen: () => onOpen(object),
    cells: [
      <span key="name" className="objects-cell-name">
        {object.name}
      </span>,
      <span key="plural">{object.pluralLabel ?? EM_DASH}</span>,
      <span key="records" className="objects-cell-num">
        {object.recordsCount}
      </span>,
      <span key="fields" className="objects-cell-num">
        {object.fieldsCount}
      </span>,
      locationLabel(object.location),
      <span key="description" className="objects-cell-desc">
        {object.description ?? EM_DASH}
      </span>,
      <span key="view" className="objects-cell-actions">
        {!object.isSystem && onViewRecords && (
          <IconButton
            icon={Table}
            label={`View ${object.name} records`}
            onClick={() => onViewRecords(object)}
          />
        )}
        <IconButton
          icon={CaretRight}
          label={`View ${object.name}`}
          ariaHasPopup="dialog"
          onClick={() => onOpen(object)}
        />
      </span>,
    ],
  }));

  return (
    <TableShell
      caption="Objects in this workspace"
      columns={COLUMNS}
      rows={tableRows}
      sort={sort}
      onSortChange={onSortChange}
      renderFilter={renderFilter}
    />
  );
}
