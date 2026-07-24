// Schema → list wiring for custom-object records (SP2). Pure helpers, unit-tested: build the grid
// columns from a custom object's field schema, map each field type to a filter-funnel type, and
// round-trip a funnel value ↔ a query FilterClause. Only filterable field types become columns;
// the mapping mirrors the Slice A query proc so the UI never offers a filter the backend ignores.

import type { FieldDefinitionDto, FieldType, FilterClause } from '@shared/types';

import type { FilterType, FilterValue, TableColumn } from '@/shared/components/Table';

/** Field types that map to each funnel; everything else is neither filterable nor sortable. */
const TEXT_TYPES: ReadonlySet<FieldType> = new Set(['ShortText', 'LongText', 'RichText', 'Url']);
const NUMBER_TYPES: ReadonlySet<FieldType> = new Set(['Number', 'Decimal', 'Currency', 'Percent']);
const DATE_TYPES: ReadonlySet<FieldType> = new Set(['Date', 'DateTime']);
const SELECT_TYPES: ReadonlySet<FieldType> = new Set(['SingleSelect', 'MultiSelect']);

/** The funnel type for a field, or null when the field type cannot be filtered/sorted. */
export function filterTypeFor(field: FieldDefinitionDto): FilterType | null {
  if (TEXT_TYPES.has(field.fieldType)) return 'text';
  if (NUMBER_TYPES.has(field.fieldType)) return 'number';
  if (DATE_TYPES.has(field.fieldType)) return 'date';
  if (SELECT_TYPES.has(field.fieldType)) return 'select';
  return null;
}

const NAME_COLUMN: TableColumn = {
  key: 'name',
  label: 'Name',
  width: 240,
  sortable: true,
  filterable: true,
};

/** Name column + one column per filterable, non-retired user field, ordered by sortOrder. */
export function buildColumns(fields: FieldDefinitionDto[]): TableColumn[] {
  const fieldColumns = [...fields]
    .filter((field) => !field.isRetired && filterTypeFor(field) !== null)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map<TableColumn>((field) => ({
      key: field.fieldKey,
      label: field.displayName,
      width: 180,
      sortable: true,
      filterable: true,
      align: filterTypeFor(field) === 'number' ? 'right' : undefined,
    }));
  return [NAME_COLUMN, ...fieldColumns];
}

export interface NumberFilter {
  op: '>' | '>=' | '=' | '<=' | '<';
  value: number;
}

/** Parse a comparator expression (`>5`, `<=6`, `=7`, bare `7` → `=`). Null when unparseable. */
export function parseNumberExpression(expression: string): NumberFilter | null {
  const match = expression.trim().match(/^(>=|<=|=|>|<)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const op = (match[1] ?? '=') as NumberFilter['op'];
  const value = Number(match[2]);
  return Number.isNaN(value) ? null : { op, value };
}

/** FilterFunnel value → query FilterClause (undefined = clear this column). */
export function filterValueToClause(value: FilterValue): FilterClause | undefined {
  switch (value.kind) {
    case 'select':
      return value.values && value.values.length > 0
        ? { kind: 'select', values: value.values }
        : undefined;
    case 'text':
      return value.contains && value.contains.trim()
        ? { kind: 'text', contains: value.contains.trim() }
        : undefined;
    case 'number': {
      const parsed = value.expression ? parseNumberExpression(value.expression) : null;
      return parsed ? { kind: 'number', op: parsed.op, value: parsed.value } : undefined;
    }
    case 'date': {
      if (!value.from && !value.to) return undefined;
      const clause: Extract<FilterClause, { kind: 'date' }> = { kind: 'date' };
      if (value.from) clause.from = value.from;
      if (value.to) clause.to = value.to;
      return clause;
    }
    default:
      return undefined;
  }
}

/** Query FilterClause → FilterFunnel value (controlled funnel). */
export function clauseToFilterValue(clause: FilterClause | undefined): FilterValue | undefined {
  if (!clause) return undefined;
  switch (clause.kind) {
    case 'select':
      return { kind: 'select', values: clause.values };
    case 'text':
      return { kind: 'text', contains: clause.contains };
    case 'number':
      return { kind: 'number', expression: `${clause.op}${clause.value}` };
    case 'date': {
      const value: FilterValue = { kind: 'date' };
      if (clause.from) value.from = clause.from;
      if (clause.to) value.to = clause.to;
      return value;
    }
    default:
      return undefined;
  }
}
