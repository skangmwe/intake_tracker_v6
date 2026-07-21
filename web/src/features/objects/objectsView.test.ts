// selectObjectsView — the pure client-side sort / filter / paginate for the Objects tab. Covers
// text + numeric sorting (both directions), name-contains and location-select filters, pagination
// slicing, and the filtered-to-zero result.

import type { ObjectDefinitionDto } from '@shared/types';

import { buildObjectDefinition } from '@/test-utils';

import { selectObjectsView } from './objectsView';

const request = buildObjectDefinition({
  id: 'o-request',
  name: 'Request',
  pluralLabel: 'Requests',
  location: 'Global',
  recordsCount: 128,
  fieldsCount: 7,
  isSystem: true,
});
const vendor = buildObjectDefinition({
  id: 'o-vendor',
  name: 'Vendor',
  location: 'LocalWorkspace',
  recordsCount: 3,
  fieldsCount: 1,
});
const apple = buildObjectDefinition({
  id: 'o-apple',
  name: 'Apple',
  location: 'LocalWorkspace',
  recordsCount: 42,
  fieldsCount: 4,
});
const ALL: ObjectDefinitionDto[] = [request, vendor, apple];

describe('selectObjectsView', () => {
  it('selectObjectsView — no sort, no filter — returns all rows in source order', () => {
    // Act
    const result = selectObjectsView(ALL, undefined, {}, 1, 25);

    // Assert
    expect(result.rows).toEqual(ALL);
    expect(result.total).toBe(3);
    expect(result.start).toBe(1);
    expect(result.end).toBe(3);
  });

  it('selectObjectsView — sort by name ascending — orders alphabetically', () => {
    // Act
    const result = selectObjectsView(ALL, { column: 'name', direction: 'asc' }, {}, 1, 25);

    // Assert
    expect(result.rows.map((object) => object.name)).toEqual(['Apple', 'Request', 'Vendor']);
  });

  it('selectObjectsView — sort by records descending — orders by numeric count', () => {
    // Act
    const result = selectObjectsView(ALL, { column: 'records', direction: 'desc' }, {}, 1, 25);

    // Assert
    expect(result.rows.map((object) => object.recordsCount)).toEqual([128, 42, 3]);
  });

  it('selectObjectsView — sort by fields ascending — orders by numeric count', () => {
    // Act
    const result = selectObjectsView(ALL, { column: 'fieldCount', direction: 'asc' }, {}, 1, 25);

    // Assert
    expect(result.rows.map((object) => object.fieldsCount)).toEqual([1, 4, 7]);
  });

  it('selectObjectsView — name-contains filter — keeps only matching rows', () => {
    // Act
    const result = selectObjectsView(
      ALL,
      undefined,
      { name: { kind: 'text', contains: 'ven' } },
      1,
      25,
    );

    // Assert
    expect(result.rows.map((object) => object.name)).toEqual(['Vendor']);
  });

  it('selectObjectsView — location select filter — keeps only the chosen locations', () => {
    // Act
    const result = selectObjectsView(
      ALL,
      undefined,
      { location: { kind: 'select', values: ['Global'] } },
      1,
      25,
    );

    // Assert
    expect(result.rows.map((object) => object.name)).toEqual(['Request']);
  });

  it('selectObjectsView — filter excludes everything — returns zero rows', () => {
    // Act
    const result = selectObjectsView(
      ALL,
      undefined,
      { name: { kind: 'text', contains: 'zzz' } },
      1,
      25,
    );

    // Assert
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
    expect(result.start).toBe(0);
  });

  it('selectObjectsView — page size smaller than total — slices the page', () => {
    // Act
    const page2 = selectObjectsView(ALL, { column: 'name', direction: 'asc' }, {}, 2, 2);

    // Assert — page 2 of a 2-per-page, 3-row set holds the last row.
    expect(page2.rows.map((object) => object.name)).toEqual(['Vendor']);
    expect(page2.totalPages).toBe(2);
    expect(page2.start).toBe(3);
    expect(page2.end).toBe(3);
  });
});
