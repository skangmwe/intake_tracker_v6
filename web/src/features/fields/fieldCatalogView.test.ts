// Unit tests for the pure Fields-tab catalog view (sort / filter / facet options). No rendering.

import { buildFieldCatalogRow } from '@/test-utils';

import { facetOptions, facetValue, isFilterActive, selectCatalogView } from './fieldCatalogView';

const ROWS = [
  buildFieldCatalogRow({
    id: '1',
    objectType: 'Request',
    displayName: 'Severity',
    fieldKey: 'severity',
    source: 'User',
    status: 'Active',
  }),
  buildFieldCatalogRow({
    id: '2',
    objectType: 'Task',
    displayName: 'Assignee',
    fieldKey: 'assignee',
    source: 'User',
    status: 'Archived',
  }),
  buildFieldCatalogRow({
    id: '3',
    objectType: 'Request',
    displayName: 'Record ID',
    fieldKey: 'recordId',
    source: 'System',
    status: 'Active',
  }),
];

describe('fieldCatalogView', () => {
  it('isFilterActive — empty vs populated', () => {
    expect(isFilterActive(undefined)).toBe(false);
    expect(isFilterActive({ kind: 'select', values: [] })).toBe(false);
    expect(isFilterActive({ kind: 'select', values: ['Request'] })).toBe(true);
    expect(isFilterActive({ kind: 'text', contains: '  ' })).toBe(false);
    expect(isFilterActive({ kind: 'text', contains: 'rec' })).toBe(true);
  });

  it('facetValue — required / source / object map to display strings', () => {
    const required = buildFieldCatalogRow({ isRequired: true });
    expect(facetValue(required, 'required')).toBe('Required');
    expect(facetValue(buildFieldCatalogRow({ isRequired: false }), 'required')).toBe('Optional');
    expect(facetValue(buildFieldCatalogRow({ objectType: 'ToolkitItem' }), 'object')).toBe(
      'Toolkit item',
    );
    expect(facetValue(buildFieldCatalogRow({ location: 'Global' }), 'location')).toBe('Global');
  });

  it('selectCatalogView — select filter on object narrows to matching rows', () => {
    // Act
    const view = selectCatalogView(ROWS, undefined, {
      object: { kind: 'select', values: ['Request'] },
    });

    // Assert
    expect(view.total).toBe(2);
    expect(view.rows.every((row) => row.objectType === 'Request')).toBe(true);
  });

  it('selectCatalogView — text filter on field matches the display name', () => {
    const view = selectCatalogView(ROWS, undefined, {
      field: { kind: 'text', contains: 'record' },
    });
    expect(view.rows.map((row) => row.fieldKey)).toEqual(['recordId']);
  });

  it('selectCatalogView — sort by field descending', () => {
    const view = selectCatalogView(ROWS, { column: 'field', direction: 'desc' }, {});
    expect(view.rows.map((row) => row.displayName)).toEqual(['Severity', 'Record ID', 'Assignee']);
  });

  it('selectCatalogView — no filters returns every row', () => {
    const view = selectCatalogView(ROWS, undefined, {});
    expect(view.total).toBe(3);
  });

  it('facetOptions — counts distinct facet values', () => {
    const options = facetOptions(ROWS, 'source');
    expect(options).toEqual(
      expect.arrayContaining([
        { value: 'User', label: 'User', count: 2 },
        { value: 'System', label: 'System', count: 1 },
      ]),
    );
  });
});
