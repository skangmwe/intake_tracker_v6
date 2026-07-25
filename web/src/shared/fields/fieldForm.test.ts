// Unit tests for the shared data-driven form logic (no React, no DB). Extracted from
// features/requests/requestForm.test.ts — the Request-specific computePriorityScore case stays
// in that file.

import type { FieldDefinitionDto, FieldRuleDto } from '@shared/types';

import {
  evaluateComparator,
  evaluateFieldConditions,
  filterSections,
  groupFieldsBySection,
  validateFieldForm,
} from './fieldForm';

function buildField(overrides: Partial<FieldDefinitionDto>): FieldDefinitionDto {
  return {
    id: 'fd-1' as FieldDefinitionDto['id'],
    workspaceId: 'ws-1' as FieldDefinitionDto['workspaceId'],
    objectType: 'Request',
    fieldKey: 'name',
    displayName: 'Name',
    fieldType: 'ShortText',
    category: 'Crossing',
    section: 'Intake',
    helpText: null,
    isRequired: false,
    isReadOnly: false,
    location: 'LocalWorkspace',
    isLocal: true,
    isPlatformDefined: false,
    platformFieldKey: null,
    visibleStages: null,
    crossingToFieldKey: null,
    minValue: null,
    maxValue: null,
    allowNewValues: false,
    sortOrder: 0,
    isRetired: false,
    options: [],
    rules: [],
    derived: null,
    createdAt: '2026-07-04T00:00:00Z',
    updatedAt: '2026-07-04T00:00:00Z',
    ...overrides,
  };
}

function rule(overrides: Partial<FieldRuleDto>): FieldRuleDto {
  return {
    id: 'r-1',
    action: 'Show',
    whenFieldKey: 'x',
    comparator: 'eq',
    compareValue: 'true',
    produceValue: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('groupFieldsBySection', () => {
  it('groupFieldsBySection — orders sections by first appearance and fields by sortOrder', () => {
    // Arrange
    const fields = [
      buildField({ fieldKey: 'b', section: 'Intake', sortOrder: 2 }),
      buildField({ fieldKey: 'a', section: 'Intake', sortOrder: 1 }),
      buildField({ fieldKey: 'c', section: 'Value mapping', sortOrder: 3 }),
      buildField({ fieldKey: 'retired', section: 'Intake', sortOrder: 0, isRetired: true }),
    ];

    // Act
    const groups = groupFieldsBySection(fields);

    // Assert
    expect(groups.map((group) => group.section)).toEqual(['Intake', 'Value mapping']);
    expect(groups[0]?.fields.map((field) => field.fieldKey)).toEqual(['a', 'b']);
  });
});

describe('filterSections', () => {
  it('filterSections — keeps only named sections in the requested order', () => {
    // Arrange
    const groups = groupFieldsBySection([
      buildField({ fieldKey: 'a', section: 'Triage', sortOrder: 1 }),
      buildField({ fieldKey: 'b', section: 'Intake', sortOrder: 2 }),
    ]);

    // Act
    const filtered = filterSections(groups, ['Intake', 'Triage']);

    // Assert
    expect(filtered.map((group) => group.section)).toEqual(['Intake', 'Triage']);
  });
});

describe('evaluateComparator', () => {
  it('evaluateComparator — eq matches the string form of a boolean', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator(true, 'eq', 'true')).toBe(true);
    expect(evaluateComparator(false, 'eq', 'true')).toBe(false);
  });

  it('evaluateComparator — isSet is false for empty and true for a value', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator('', 'isSet', null)).toBe(false);
    expect(evaluateComparator('x', 'isSet', null)).toBe(true);
  });

  it('evaluateComparator — numeric comparison works with gt', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator(6, 'gt', '5')).toBe(true);
    expect(evaluateComparator(4, 'gt', '5')).toBe(false);
  });

  it('evaluateComparator — isNotSet is true only for an empty value', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator(null, 'isNotSet', null)).toBe(true);
    expect(evaluateComparator('x', 'isNotSet', null)).toBe(false);
  });

  it('evaluateComparator — neq is the inverse of eq', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator('PG', 'neq', 'Client')).toBe(true);
    expect(evaluateComparator('Client', 'neq', 'Client')).toBe(false);
  });

  it('evaluateComparator — contains is case-insensitive and false when either side is empty', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator('Meeting Notes', 'contains', 'notes')).toBe(true);
    expect(evaluateComparator('Meeting', 'contains', 'notes')).toBe(false);
    expect(evaluateComparator(null, 'contains', 'notes')).toBe(false);
  });

  it('evaluateComparator — gte, lt and lte compare numerically', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator(5, 'gte', '5')).toBe(true);
    expect(evaluateComparator(4, 'gte', '5')).toBe(false);
    expect(evaluateComparator(4, 'lt', '5')).toBe(true);
    expect(evaluateComparator(5, 'lt', '5')).toBe(false);
    expect(evaluateComparator(5, 'lte', '5')).toBe(true);
    expect(evaluateComparator(6, 'lte', '5')).toBe(false);
  });

  it('evaluateComparator — non-numeric operands make an ordered comparison false', () => {
    // Arrange / Act / Assert
    expect(evaluateComparator('abc', 'gt', '5')).toBe(false);
    expect(evaluateComparator(6, 'gt', 'xyz')).toBe(false);
  });
});

describe('evaluateFieldConditions', () => {
  it('evaluateFieldConditions — a Show-ruled field is hidden until its condition matches', () => {
    // Arrange — holdReason shows only when holdBlocked = true.
    const fields = [
      buildField({ fieldKey: 'holdBlocked', fieldType: 'Boolean' }),
      buildField({
        fieldKey: 'holdReason',
        rules: [
          rule({
            action: 'Show',
            whenFieldKey: 'holdBlocked',
            comparator: 'eq',
            compareValue: 'true',
          }),
        ],
      }),
    ];

    // Act
    const whenHidden = evaluateFieldConditions(fields, { holdBlocked: false });
    const whenShown = evaluateFieldConditions(fields, { holdBlocked: true });

    // Assert
    expect(whenHidden.hidden.has('holdReason')).toBe(true);
    expect(whenShown.hidden.has('holdReason')).toBe(false);
  });

  it('evaluateFieldConditions — a Hide rule hides the field when it matches', () => {
    // Arrange — legacyNotes is hidden once the record is archived.
    const fields = [
      buildField({ fieldKey: 'archived', fieldType: 'Boolean' }),
      buildField({
        fieldKey: 'legacyNotes',
        rules: [
          rule({
            action: 'Hide',
            whenFieldKey: 'archived',
            comparator: 'eq',
            compareValue: 'true',
          }),
        ],
      }),
    ];

    // Act
    const shown = evaluateFieldConditions(fields, { archived: false });
    const hidden = evaluateFieldConditions(fields, { archived: true });

    // Assert
    expect(shown.hidden.has('legacyNotes')).toBe(false);
    expect(hidden.hidden.has('legacyNotes')).toBe(true);
  });

  it('evaluateFieldConditions — a Require rule marks the field required when it matches', () => {
    // Arrange — clientNumber required when deptPgClient = Client.
    const fields = [
      buildField({ fieldKey: 'deptPgClient', fieldType: 'SingleSelect' }),
      buildField({
        fieldKey: 'clientNumber',
        rules: [
          rule({
            action: 'Require',
            whenFieldKey: 'deptPgClient',
            comparator: 'eq',
            compareValue: 'Client',
          }),
        ],
      }),
    ];

    // Act
    const notClient = evaluateFieldConditions(fields, { deptPgClient: 'PG' });
    const isClient = evaluateFieldConditions(fields, { deptPgClient: 'Client' });

    // Assert
    expect(notClient.required.has('clientNumber')).toBe(false);
    expect(isClient.required.has('clientNumber')).toBe(true);
  });
});

describe('validateFieldForm', () => {
  it('validateFieldForm — flags a required empty field but ignores hidden ones', () => {
    // Arrange
    const fields = [
      buildField({ fieldKey: 'name', displayName: 'Request name', isRequired: true }),
      buildField({
        fieldKey: 'clientNumber',
        displayName: 'Client number',
        rules: [
          rule({
            action: 'Require',
            whenFieldKey: 'deptPgClient',
            comparator: 'eq',
            compareValue: 'Client',
          }),
        ],
      }),
    ];

    // Act — name missing, dept not Client (so clientNumber not required).
    const errors = validateFieldForm(fields, { deptPgClient: 'PG' });

    // Assert
    expect(errors.name).toContain('required');
    expect(errors.clientNumber).toBeUndefined();
  });

  it('validateFieldForm — enforces numeric upper bounds', () => {
    // Arrange
    const fields = [
      buildField({
        fieldKey: 'businessValue',
        displayName: 'Business Value',
        fieldType: 'Number',
        minValue: 1,
        maxValue: 5,
      }),
    ];

    // Act
    const errors = validateFieldForm(fields, { businessValue: 9 });

    // Assert
    expect(errors.businessValue).toContain('at most 5');
  });

  it('validateFieldForm — flags a value below the minimum', () => {
    // Arrange
    const fields = [
      buildField({
        fieldKey: 'businessValue',
        displayName: 'Business Value',
        fieldType: 'Number',
        minValue: 1,
        maxValue: 5,
      }),
    ];

    // Act
    const errors = validateFieldForm(fields, { businessValue: 0 });

    // Assert
    expect(errors.businessValue).toContain('at least 1');
  });

  it('validateFieldForm — flags a non-numeric value in a Number field', () => {
    // Arrange
    const fields = [
      buildField({ fieldKey: 'businessValue', displayName: 'Business Value', fieldType: 'Number' }),
    ];

    // Act
    const errors = validateFieldForm(fields, { businessValue: 'abc' });

    // Assert
    expect(errors.businessValue).toContain('must be a number');
  });

  it('validateFieldForm — a valid in-range Decimal produces no error', () => {
    // Arrange
    const fields = [
      buildField({
        fieldKey: 'ratio',
        displayName: 'Ratio',
        fieldType: 'Decimal',
        minValue: 0,
        maxValue: 10,
      }),
    ];

    // Act
    const errors = validateFieldForm(fields, { ratio: 3.5 });

    // Assert
    expect(errors.ratio).toBeUndefined();
  });
});
