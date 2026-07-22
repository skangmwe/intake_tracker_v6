// Unit tests for the import column-mapping helpers (S28). Covers auto-mapping by key/label (first
// header wins), duplicate detection, validity (required-field + duplicate + at-least-one gates), and
// the API payload conversion.

import type { IoFieldSpec } from '@shared/types';

import {
  autoMapColumns,
  duplicateFieldKeys,
  toMappingPayload,
  validateMapping,
  type ColumnMapping,
} from './importMapping';

const FIELDS: IoFieldSpec[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'description', label: 'Description' },
  { key: 'businessValue', label: 'Business Value' },
];

describe('autoMapColumns', () => {
  it('autoMapColumns — headers matching key or label — maps them (spacing/case-insensitive)', () => {
    // Arrange — "Business Value" matches by label; "name" by key; unknown → not imported.
    const headers = ['name', 'Business Value', 'Mystery'];

    // Act
    const mapping = autoMapColumns(headers, FIELDS);

    // Assert
    expect(mapping).toEqual({ 0: 'name', 1: 'businessValue', 2: '' });
  });

  it('autoMapColumns — two headers claim the same field — first wins', () => {
    // Arrange
    const headers = ['Name', 'name'];

    // Act
    const mapping = autoMapColumns(headers, FIELDS);

    // Assert — only the first column maps to name; the second is left unmapped.
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('');
  });
});

describe('duplicateFieldKeys', () => {
  it('duplicateFieldKeys — a field mapped twice — is reported', () => {
    const mapping: ColumnMapping = { 0: 'name', 1: 'name', 2: 'description', 3: '' };
    expect(duplicateFieldKeys(mapping)).toEqual(new Set(['name']));
  });
});

describe('validateMapping', () => {
  it('validateMapping — required mapped, no dupes — is valid', () => {
    const mapping: ColumnMapping = { 0: 'name', 1: 'description' };
    const result = validateMapping(mapping, FIELDS);
    expect(result.valid).toBe(true);
    expect(result.missingRequired).toEqual([]);
  });

  it('validateMapping — required field unmapped — is invalid and lists it', () => {
    const mapping: ColumnMapping = { 0: 'description' };
    const result = validateMapping(mapping, FIELDS);
    expect(result.valid).toBe(false);
    expect(result.missingRequired.map((field) => field.key)).toEqual(['name']);
  });

  it('validateMapping — duplicate target — is invalid', () => {
    const mapping: ColumnMapping = { 0: 'name', 1: 'name' };
    const result = validateMapping(mapping, FIELDS);
    expect(result.valid).toBe(false);
    expect(result.duplicates.has('name')).toBe(true);
  });

  it('validateMapping — nothing mapped — is invalid', () => {
    const result = validateMapping({ 0: '', 1: '' }, FIELDS);
    expect(result.valid).toBe(false);
    expect(result.hasAnyMapping).toBe(false);
  });
});

describe('toMappingPayload', () => {
  it('toMappingPayload — drops unmapped columns — returns index/key pairs', () => {
    const mapping: ColumnMapping = { 0: 'name', 1: '', 2: 'businessValue' };
    expect(toMappingPayload(mapping)).toEqual([
      { columnIndex: 0, fieldKey: 'name' },
      { columnIndex: 2, fieldKey: 'businessValue' },
    ]);
  });
});
