// Unit tests for the field-editor form model (pure — no rendering). Covers create defaults, mapping
// from an existing field, and the form→request translation across field-type branches.

import { FIELD_TYPE_OPTIONS } from './constants';
import { buildFieldDefinition } from '@/test-utils';

import { buildInitialForm, formToRequest, type FieldForm } from './fieldForm';

const TYPES = FIELD_TYPE_OPTIONS;

function baseForm(overrides: Partial<FieldForm> = {}): FieldForm {
  return {
    fieldKey: 'severity',
    displayName: 'Severity',
    fieldType: 'SingleSelect',
    category: 'WorkspaceLocal',
    section: 'Triage',
    isRequired: false,
    minValue: '',
    maxValue: '',
    visibleStages: [],
    options: [],
    rules: [],
    expression: '',
    defaultValue: '',
    ...overrides,
  };
}

describe('fieldForm', () => {
  it('buildInitialForm — no field — returns create defaults', () => {
    // Act
    const form = buildInitialForm(null, 'Request', TYPES);

    // Assert
    expect(form.fieldKey).toBe('');
    expect(form.fieldType).toBe(TYPES[0]!.value);
    expect(form.category).toBe('WorkspaceLocal');
  });

  it('buildInitialForm — existing field — drops produce-value rules', () => {
    // Arrange — a Derived-category field with a ProduceValue rule and a Show rule.
    const field = buildFieldDefinition({
      fieldKey: 'displayStatus',
      fieldType: 'DerivedCategory',
      derived: { kind: 'DerivedCategory', expression: null, defaultValue: '@stage' },
      rules: [
        { id: 'r1', action: 'ProduceValue', whenFieldKey: 'outcome', comparator: 'isSet', compareValue: null, produceValue: '@outcome', sortOrder: 1 },
        { id: 'r2', action: 'Show', whenFieldKey: 'stage', comparator: 'eq', compareValue: 'build', produceValue: null, sortOrder: 2 },
      ],
    });

    // Act
    const form = buildInitialForm(field, 'Request', TYPES);

    // Assert — only the editable (non-produce) rule survives; the default is preserved.
    expect(form.rules).toHaveLength(1);
    expect(form.rules[0]!.action).toBe('Show');
    expect(form.defaultValue).toBe('@stage');
  });

  it('formToRequest — select field — includes trimmed options only', () => {
    // Arrange
    const form = baseForm({
      options: [
        { id: 'a', value: ' High ', label: '' },
        { id: 'b', value: '', label: 'ignored' },
      ],
    });

    // Act
    const request = formToRequest(form, 'Request');

    // Assert — the blank-value row is dropped; label falls back to value.
    expect(request.options).toEqual([{ value: 'High', label: 'High', sortOrder: 0 }]);
  });

  it('formToRequest — non-select field — omits options entirely', () => {
    const request = formToRequest(baseForm({ fieldType: 'ShortText' }), 'Request');
    expect('options' in request).toBe(false);
  });

  it('formToRequest — numeric field — parses bounds', () => {
    const request = formToRequest(baseForm({ fieldType: 'Number', minValue: '1', maxValue: '5' }), 'Request');
    expect(request.minValue).toBe(1);
    expect(request.maxValue).toBe(5);
  });

  it('formToRequest — calculation field — builds a Calculation derived config', () => {
    const request = formToRequest(baseForm({ fieldType: 'Calculation', expression: 'a + b' }), 'Request');
    expect(request.derived).toEqual({ kind: 'Calculation', expression: 'a + b', defaultValue: null });
  });

  it('formToRequest — isSet rule — nulls the compare value', () => {
    // Arrange
    const form = baseForm({
      fieldType: 'ShortText',
      rules: [{ id: 'r', action: 'Require', whenFieldKey: 'clientNumber', comparator: 'isSet', compareValue: 'ignored' }],
    });

    // Act
    const request = formToRequest(form, 'Request');

    // Assert
    expect(request.rules?.[0]?.compareValue).toBeNull();
  });

  it('formToRequest — empty visible stages — sends null (all stages)', () => {
    const request = formToRequest(baseForm({ fieldType: 'ShortText' }), 'Request');
    expect(request.visibleStages).toBeNull();
  });

  it('buildInitialForm — no field and no type options — falls back to ShortText', () => {
    const form = buildInitialForm(null, 'Request', []);
    expect(form.fieldType).toBe('ShortText');
  });

  it('buildInitialForm — existing field with null optionals — coerces to empty strings and lists', () => {
    // Arrange — every nullable source field is null, and the surviving rule has no compare value
    const field = buildFieldDefinition({
      section: null,
      minValue: null,
      maxValue: null,
      visibleStages: null,
      derived: null,
      rules: [
        { id: 'r', action: 'Show', whenFieldKey: 'stage', comparator: 'isSet', compareValue: null, produceValue: null, sortOrder: 1 },
      ],
    });

    // Act
    const form = buildInitialForm(field, 'Request', TYPES);

    // Assert
    expect(form.section).toBe('');
    expect(form.minValue).toBe('');
    expect(form.maxValue).toBe('');
    expect(form.visibleStages).toEqual([]);
    expect(form.rules[0]!.compareValue).toBe('');
    expect(form.expression).toBe('');
  });

  it('formToRequest — trims a blank section to null and forwards non-empty visible stages', () => {
    const request = formToRequest(
      baseForm({ fieldType: 'ShortText', section: '   ', visibleStages: ['build', 'qa'] }),
      'Request',
    );
    expect(request.section).toBeNull();
    expect(request.visibleStages).toEqual(['build', 'qa']);
  });

  it('formToRequest — a select option keeps a provided label', () => {
    const request = formToRequest(
      baseForm({ options: [{ id: 'a', value: 'high', label: 'High priority' }] }),
      'Request',
    );
    expect(request.options).toEqual([{ value: 'high', label: 'High priority', sortOrder: 0 }]);
  });

  it('formToRequest — a comparator that needs a value keeps the trimmed value', () => {
    const form = baseForm({
      fieldType: 'ShortText',
      rules: [{ id: 'r', action: 'Require', whenFieldKey: 'x', comparator: 'eq', compareValue: '  build  ' }],
    });
    const request = formToRequest(form, 'Request');
    expect(request.rules?.[0]?.compareValue).toBe('build');
  });

  it('formToRequest — DerivedCategory field builds a DerivedCategory config', () => {
    const request = formToRequest(baseForm({ fieldType: 'DerivedCategory', defaultValue: '@stage' }), 'Request');
    expect(request.derived).toEqual({ kind: 'DerivedCategory', expression: null, defaultValue: '@stage' });
  });

  it('formToRequest — a non-numeric bound on a numeric field parses to null', () => {
    const request = formToRequest(baseForm({ fieldType: 'Number', minValue: 'abc', maxValue: '' }), 'Request');
    expect(request.minValue).toBeNull();
    expect(request.maxValue).toBeNull();
  });
});
