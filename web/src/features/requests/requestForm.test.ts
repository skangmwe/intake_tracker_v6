// Tests for the Request-specific form logic that remains in requestForm.ts (the Priority Score
// formula and the fixed create-form sections) plus a smoke check that the generic helpers moved to
// @/shared/fields/fieldForm are re-exported unchanged. The generic helpers' own cases live in
// shared/fields/fieldForm.test.ts.

import type { FieldDefinitionDto } from '@shared/types';

import { computePriorityScore, INTAKE_CREATE_SECTIONS, validateRequestForm } from './requestForm';

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

describe('computePriorityScore', () => {
  it('computePriorityScore — is businessValue + efficiencyGain − levelOfEffort', () => {
    // Arrange / Act / Assert
    expect(computePriorityScore({ businessValue: 4, efficiencyGain: 3, levelOfEffort: 2 })).toBe(5);
    expect(computePriorityScore({})).toBe(0);
  });
});

describe('INTAKE_CREATE_SECTIONS', () => {
  it('INTAKE_CREATE_SECTIONS — lists the four numbered create-form sections in order', () => {
    // Arrange / Act / Assert
    expect(INTAKE_CREATE_SECTIONS).toEqual(['Intake', 'Value mapping', 'Solution details', 'Triage']);
  });
});

describe('validateRequestForm re-export', () => {
  it('validateRequestForm — re-exports the shared validator and flags a required empty field', () => {
    // Arrange
    const fields = [buildField({ fieldKey: 'name', displayName: 'Request name', isRequired: true })];

    // Act
    const errors = validateRequestForm(fields, {});

    // Assert
    expect(errors.name).toContain('required');
  });
});
