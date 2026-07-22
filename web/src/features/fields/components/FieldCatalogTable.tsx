// The reconciled S30 Fields tab table — a flat, all-object-types field catalog on the shared
// TableShell so it reads like the Objects tab: sortable headers, per-column funnels, resizable
// columns, 1px row rules. Eight columns: FIELD · KEY · TYPE · OBJECT · LOCATION · REQUIRED ·
// SOURCE · STATUS. A row click opens the editor (or a read-only view for locked rows); the
// accessible open trigger is the per-row control the parent wires via onOpen.

import type { ReactNode } from 'react';
import { Check, LockSimple } from '@phosphor-icons/react';

import type { FieldCatalogRowDto } from '@shared/types';

import {
  type FilterOption,
  FilterFunnel,
  type FilterType,
  type FilterValue,
  type SortState,
  type TableColumn,
  TableShell,
} from '@/shared/components/Table';

import { fieldLocationLabel, fieldTypeLabel, objectLabel } from '../constants';
import { type CatalogColumnKey, type CatalogFilters, facetOptions } from '../fieldCatalogView';

const EM_DASH = '—';

const COLUMNS: TableColumn[] = [
  { key: 'field', label: 'Field', width: 240, sortable: true, filterable: true },
  { key: 'key', label: 'Key', width: 150, sortable: true, filterable: true },
  { key: 'type', label: 'Type', width: 150, sortable: true, filterable: true },
  { key: 'object', label: 'Object', width: 140, sortable: true, filterable: true },
  { key: 'location', label: 'Location', width: 150, sortable: true, filterable: true },
  { key: 'required', label: 'Required', width: 120, sortable: true, filterable: true },
  { key: 'source', label: 'Source', width: 110, sortable: true, filterable: true },
  { key: 'status', label: 'Status', flex: true, sortable: true, filterable: true },
];

// Field / Key filter as free text; every other column as a checkbox select.
const FILTER_TYPES: Record<CatalogColumnKey, FilterType> = {
  field: 'text',
  key: 'text',
  type: 'select',
  object: 'select',
  location: 'select',
  required: 'select',
  source: 'select',
  status: 'select',
};

function statusClass(status: string): string {
  if (status === 'Archived') return 'fields-cat__status fields-cat__status--archived';
  if (status === 'Draft') return 'fields-cat__status fields-cat__status--draft';
  return 'fields-cat__status fields-cat__status--active';
}

interface FieldCatalogTableProps {
  rows: FieldCatalogRowDto[];
  allRows: FieldCatalogRowDto[];
  sort: SortState | undefined;
  onSortChange: (next: SortState | undefined) => void;
  filters: CatalogFilters;
  onFilterChange: (column: CatalogColumnKey, value: FilterValue) => void;
  onOpen: (row: FieldCatalogRowDto) => void;
  /** Accessible table caption. Defaults to the workspace Fields tab wording. */
  caption?: string;
}

function sourceCell(source: FieldCatalogRowDto['source']): ReactNode {
  if (source === 'System') {
    return (
      <span className="fields-cat__system">
        <LockSimple size={12} aria-hidden /> System
      </span>
    );
  }
  if (source === 'Platform') {
    return <span className="fields-cat__platform">Platform</span>;
  }
  return <span className="fields-cat__muted">User</span>;
}

export function FieldCatalogTable({
  rows,
  allRows,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onOpen,
  caption = 'Field definitions in this workspace',
}: FieldCatalogTableProps) {
  const renderFilter = (column: TableColumn): ReactNode => {
    const key = column.key as CatalogColumnKey;
    const type = FILTER_TYPES[key];
    const options: FilterOption[] | undefined =
      type === 'select' ? facetOptions(allRows, key) : undefined;
    return (
      <FilterFunnel
        type={type}
        columnLabel={column.label}
        options={options}
        value={filters[key] ?? { kind: type }}
        onChange={(next) => onFilterChange(key, next)}
      />
    );
  };

  const tableRows = rows.map((row) => ({
    id: row.id,
    onOpen: () => onOpen(row),
    cells: [
      <span key="field" className="fields-cat__name">
        {row.displayName}
      </span>,
      <code key="key" className="mws-ident">
        {row.fieldKey}
      </code>,
      <span key="type" className="fields-cat__type">
        {fieldTypeLabel(row.fieldType)}
      </span>,
      objectLabel(row.objectType),
      fieldLocationLabel(row.location),
      row.isRequired ? (
        <span key="required" className="fields-cat__required">
          <Check size={14} aria-hidden /> Required
        </span>
      ) : (
        <span key="required" className="fields-cat__muted">
          {EM_DASH}
        </span>
      ),
      <span key="source">{sourceCell(row.source)}</span>,
      <span key="status" className={statusClass(row.status)}>
        {row.status}
      </span>,
    ],
  }));

  return (
    <TableShell
      caption={caption}
      columns={COLUMNS}
      rows={tableRows}
      sort={sort}
      onSortChange={onSortChange}
      renderFilter={renderFilter}
    />
  );
}
