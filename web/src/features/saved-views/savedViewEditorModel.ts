// Pure model for the saved-view editor (S24). Converts between a SavedViewDto (wire shape), the
// editor's row-based draft state, and a SavedViewUpsertRequest. Kept free of React so the mapping
// is unit-tested in isolation (web-testing.md). The Filters tab surfaces the condition engine as a
// row-based `field + comparator + value` builder that ANDs together (BS §22.3).

import type {
  FilterClause,
  SavedViewDto,
  SavedViewObjectType,
  SavedViewScope,
  SavedViewUpsertRequest,
} from '@shared/types';

export type FilterComparator = 'contains' | 'is' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterRow {
  id: string;
  column: string;
  comparator: FilterComparator;
  value: string;
}

export interface SortRow {
  id: string;
  column: string;
  direction: 'asc' | 'desc';
}

export interface EditorDraft {
  name: string;
  scope: SavedViewScope;
  isDefault: boolean;
  columns: string[];
  filters: FilterRow[];
  sort: SortRow[];
}

type NumberOp = '>' | '>=' | '=' | '<=' | '<';

const NUMERIC_OP: Record<'gt' | 'gte' | 'lt' | 'lte', NumberOp> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const OP_TO_COMPARATOR: Record<string, FilterComparator> = {
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

function newId(index: number): string {
  // crypto.randomUUID where available (web-component-architecture.md); index keeps ids stable in SSR-free tests.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${index}`;
}

/** An empty draft for the create flow — starts on the given column set (the surface's default columns). */
export function emptyDraft(defaultColumns: string[]): EditorDraft {
  return {
    name: '',
    scope: 'personal',
    isDefault: false,
    columns: [...defaultColumns],
    filters: [],
    sort: [],
  };
}

/** SavedViewDto → editor draft (edit flow). */
export function draftFromView(view: SavedViewDto): EditorDraft {
  return {
    name: view.name,
    scope: view.scope,
    isDefault: view.isDefault,
    columns: [...view.columns],
    filters: Object.entries(view.filters).map(([column, clause], index) =>
      clauseToFilterRow(column, clause, index),
    ),
    sort: view.sort.map((entry, index) => ({
      id: newId(index),
      column: entry.column,
      direction: entry.direction,
    })),
  };
}

function clauseToFilterRow(column: string, clause: FilterClause, index: number): FilterRow {
  const id = newId(index);
  switch (clause.kind) {
    case 'text':
      return { id, column, comparator: 'contains', value: clause.contains };
    case 'select':
      return { id, column, comparator: 'is', value: clause.values.join(', ') };
    case 'number':
      return {
        id,
        column,
        comparator: OP_TO_COMPARATOR[clause.op] ?? 'gt',
        value: String(clause.value),
      };
    case 'boolean':
      return { id, column, comparator: 'is', value: clause.value ? 'true' : 'false' };
    default:
      return { id, column, comparator: 'contains', value: '' };
  }
}

/** One filter row → a query FilterClause (null when the row is incomplete / unparseable). */
export function filterRowToClause(row: FilterRow): FilterClause | null {
  const value = row.value.trim();
  if (!row.column || value === '') return null;
  switch (row.comparator) {
    case 'contains':
      return { kind: 'text', contains: value };
    case 'is':
      return {
        kind: 'select',
        values: value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const parsed = Number(value);
      return Number.isNaN(parsed)
        ? null
        : { kind: 'number', op: NUMERIC_OP[row.comparator], value: parsed };
    }
    default:
      return null;
  }
}

/** Editor draft → the upsert request body. Incomplete filter rows are dropped; last row per column wins. */
export function draftToUpsertRequest(
  draft: EditorDraft,
  objectType: SavedViewObjectType,
): SavedViewUpsertRequest {
  const filters: Record<string, FilterClause> = {};
  for (const row of draft.filters) {
    const clause = filterRowToClause(row);
    if (clause) filters[row.column] = clause;
  }

  return {
    objectType,
    name: draft.name.trim(),
    scope: draft.scope,
    isDefault: draft.isDefault,
    columns: draft.columns,
    filters,
    sort: draft.sort
      .filter((row) => row.column)
      .map((row) => ({ column: row.column, direction: row.direction })),
  };
}

/** True when the draft is submittable — a name is required. */
export function isDraftValid(draft: EditorDraft): boolean {
  return draft.name.trim().length > 0;
}
