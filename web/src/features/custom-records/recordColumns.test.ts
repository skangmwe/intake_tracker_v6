// recordColumns — pure schema→columns/filter-type mapping and funnel-value ↔ FilterClause round-trip.

import type { FilterClause } from '@shared/types';

import { buildFieldDefinition } from '@/test-utils';

import {
  buildColumns,
  clauseToFilterValue,
  filterTypeFor,
  filterValueToClause,
  parseNumberExpression,
} from './recordColumns';

describe('filterTypeFor', () => {
  it.each([
    ['ShortText', 'text'],
    ['LongText', 'text'],
    ['RichText', 'text'],
    ['Url', 'text'],
    ['Number', 'number'],
    ['Decimal', 'number'],
    ['Currency', 'number'],
    ['Percent', 'number'],
    ['Date', 'date'],
    ['DateTime', 'date'],
    ['SingleSelect', 'select'],
    ['MultiSelect', 'select'],
  ] as const)('filterTypeFor — %s — maps to the %s funnel', (fieldType, expected) => {
    // Arrange
    const field = buildFieldDefinition({ fieldType });

    // Act / Assert
    expect(filterTypeFor(field)).toBe(expected);
  });

  it.each(['Boolean', 'UserReference', 'RecordReference', 'Calculation', 'DerivedCategory'] as const)(
    'filterTypeFor — %s — is not filterable',
    (fieldType) => {
      // Arrange / Act / Assert
      expect(filterTypeFor(buildFieldDefinition({ fieldType }))).toBeNull();
    },
  );
});

describe('buildColumns', () => {
  it('buildColumns — mixed schema — yields Name + filterable fields ordered by sortOrder', () => {
    // Arrange — one number and one text field out of order, a boolean (excluded), a retired field.
    const fields = [
      buildFieldDefinition({ fieldKey: 'spend', displayName: 'Spend', fieldType: 'Number', sortOrder: 2 }),
      buildFieldDefinition({ fieldKey: 'notes', displayName: 'Notes', fieldType: 'ShortText', sortOrder: 1 }),
      buildFieldDefinition({ fieldKey: 'active', displayName: 'Active', fieldType: 'Boolean', sortOrder: 3 }),
      buildFieldDefinition({ fieldKey: 'old', displayName: 'Old', fieldType: 'ShortText', sortOrder: 0, isRetired: true }),
    ];

    // Act
    const columns = buildColumns(fields);

    // Assert — Name first, then notes (sortOrder 1) then spend (sortOrder 2); boolean + retired dropped.
    expect(columns.map((column) => column.key)).toEqual(['name', 'notes', 'spend']);
    expect(columns.every((column) => column.sortable && column.filterable)).toBe(true);
    expect(columns.find((column) => column.key === 'spend')?.align).toBe('right');
  });

  it('buildColumns — no user fields — returns just the Name column', () => {
    // Arrange / Act
    const columns = buildColumns([]);

    // Assert
    expect(columns).toHaveLength(1);
    expect(columns[0]?.key).toBe('name');
  });
});

describe('parseNumberExpression', () => {
  it('parseNumberExpression — comparator forms — parse; bad input is null', () => {
    // Arrange / Act / Assert
    expect(parseNumberExpression('>=10')).toEqual({ op: '>=', value: 10 });
    expect(parseNumberExpression('7')).toEqual({ op: '=', value: 7 });
    expect(parseNumberExpression('abc')).toBeNull();
  });
});

describe('filter value ↔ clause round-trip', () => {
  it('filterValueToClause / clauseToFilterValue — number expression — round-trips', () => {
    // Arrange
    const clause = filterValueToClause({ kind: 'number', expression: '>=10' });

    // Act / Assert
    expect(clause).toEqual({ kind: 'number', op: '>=', value: 10 });
    expect(clauseToFilterValue(clause as FilterClause)).toEqual({ kind: 'number', expression: '>=10' });
  });

  it('filterValueToClause / clauseToFilterValue — select — round-trips', () => {
    // Arrange
    const clause = filterValueToClause({ kind: 'select', values: ['A', 'B'] });

    // Act / Assert
    expect(clause).toEqual({ kind: 'select', values: ['A', 'B'] });
    expect(clauseToFilterValue(clause as FilterClause)).toEqual({ kind: 'select', values: ['A', 'B'] });
  });

  it('filterValueToClause — empty inputs — clear the column (undefined)', () => {
    // Arrange / Act / Assert
    expect(filterValueToClause({ kind: 'text', contains: '  ' })).toBeUndefined();
    expect(filterValueToClause({ kind: 'select', values: [] })).toBeUndefined();
    expect(filterValueToClause({ kind: 'date' })).toBeUndefined();
    expect(clauseToFilterValue(undefined)).toBeUndefined();
  });
});
