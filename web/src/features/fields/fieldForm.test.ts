// Unit tests for the field-editor form model (pure — no rendering). Covers create defaults, mapping
// from an existing field, the object/location fields (Fields tab reconciliation), and the
// form→request translation across field-type branches.

import { FIELD_TYPE_OPTIONS } from './constants';
import { buildFieldDefinition } from '@/test-utils';

import {
  buildInitialForm,
  buildFormFromCatalogRow,
  deriveFieldKey,
  formToRequest,
  type FieldForm,
} from './fieldForm';
import type { FieldCatalogRowDto } from '@shared/types';

const TYPES = FIELD_TYPE_OPTIONS;

describe('deriveFieldKey', () => {
  it('deriveFieldKey — multi-word name — camelCases the words', () => {
    // Arrange / Act / Assert
    expect(deriveFieldKey('Client contact')).toBe('clientContact');
  });

  it('deriveFieldKey — punctuation and extra spaces — split cleanly', () => {
    // Arrange / Act / Assert
    expect(deriveFieldKey('  Business value / effort  ')).toBe('businessValueEffort');
  });

  it('deriveFieldKey — leading digits — dropped so the key starts with a letter', () => {
    // Arrange / Act / Assert
    expect(deriveFieldKey('3rd party name')).toBe('rdPartyName');
  });

  it('deriveFieldKey — empty or symbol-only input — returns an empty string', () => {
    // Arrange / Act / Assert
    expect(deriveFieldKey('   ')).toBe('');
    expect(deriveFieldKey('!!!')).toBe('');
  });
});

function baseForm(overrides: Partial<FieldForm> = {}): FieldForm {
  return {
    object: 'Request',
    location: 'LocalWorkspace',
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
    const form = buildInitialForm(null, 'Task', TYPES);

    // Assert — object defaults to the passed object; location defaults to LocalWorkspace.
    expect(form.fieldKey).toBe('');
    expect(form.fieldType).toBe(TYPES[0]!.value);
    expect(form.category).toBe('WorkspaceLocal');
    expect(form.object).toBe('Task');
    expect(form.location).toBe('LocalWorkspace');
  });

  it('buildInitialForm — existing field — carries its object and location', () => {
    // Arrange
    const field = buildFieldDefinition({ objectType: 'Feature', location: 'Global' });

    // Act
    const form = buildInitialForm(field, 'Request', TYPES);

    // Assert
    expect(form.object).toBe('Feature');
    expect(form.location).toBe('Global');
  });

  it('buildInitialForm — existing field — drops produce-value rules', () => {
    // Arrange — a Derived-category field with a ProduceValue rule and a Show rule.
    const field = buildFieldDefinition({
      fieldKey: 'displayStatus',
      fieldType: 'DerivedCategory',
      derived: { kind: 'DerivedCategory', expression: null, defaultValue: '@stage' },
      rules: [
        {
          id: 'r1',
          action: 'ProduceValue',
          whenFieldKey: 'outcome',
          comparator: 'isSet',
          compareValue: null,
          produceValue: '@outcome',
          sortOrder: 1,
        },
        {
          id: 'r2',
          action: 'Show',
          whenFieldKey: 'stage',
          comparator: 'eq',
          compareValue: 'execution',
          produceValue: null,
          sortOrder: 2,
        },
      ],
    });

    // Act
    const form = buildInitialForm(field, 'Request', TYPES);

    // Assert — only the editable (non-produce) rule survives; the default is preserved.
    expect(form.rules).toHaveLength(1);
    expect(form.rules[0]!.action).toBe('Show');
    expect(form.defaultValue).toBe('@stage');
  });

  it('formToRequest — maps the form object and location onto the request', () => {
    // Act
    const request = formToRequest(baseForm({ object: 'Attachment', location: 'Global' }));

    // Assert
    expect(request.objectType).toBe('Attachment');
    expect(request.location).toBe('Global');
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
    const request = formToRequest(form);

    // Assert — the blank-value row is dropped; label falls back to value.
    expect(request.options).toEqual([{ value: 'High', label: 'High', sortOrder: 0 }]);
  });

  it('formToRequest — non-select field — omits options entirely', () => {
    const request = formToRequest(baseForm({ fieldType: 'ShortText' }));
    expect('options' in request).toBe(false);
  });

  it('formToRequest — numeric field — parses bounds', () => {
    const request = formToRequest(baseForm({ fieldType: 'Number', minValue: '1', maxValue: '5' }));
    expect(request.minValue).toBe(1);
    expect(request.maxValue).toBe(5);
  });

  it('formToRequest — calculation field — builds a Calculation derived config', () => {
    const request = formToRequest(baseForm({ fieldType: 'Calculation', expression: 'a + b' }));
    expect(request.derived).toEqual({
      kind: 'Calculation',
      expression: 'a + b',
      defaultValue: null,
    });
  });

  it('formToRequest — isSet rule — nulls the compare value', () => {
    // Arrange
    const form = baseForm({
      fieldType: 'ShortText',
      rules: [
        {
          id: 'r',
          action: 'Require',
          whenFieldKey: 'clientNumber',
          comparator: 'isSet',
          compareValue: 'ignored',
        },
      ],
    });

    // Act
    const request = formToRequest(form);

    // Assert
    expect(request.rules?.[0]?.compareValue).toBeNull();
  });

  it('formToRequest — empty visible stages — sends null (all stages)', () => {
    const request = formToRequest(baseForm({ fieldType: 'ShortText' }));
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
        {
          id: 'r',
          action: 'Show',
          whenFieldKey: 'stage',
          comparator: 'isSet',
          compareValue: null,
          produceValue: null,
          sortOrder: 1,
        },
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
      baseForm({
        fieldType: 'ShortText',
        section: '   ',
        visibleStages: ['execution', 'validation'],
      }),
    );
    expect(request.section).toBeNull();
    expect(request.visibleStages).toEqual(['execution', 'validation']);
  });

  it('formToRequest — a select option keeps a provided label', () => {
    const request = formToRequest(
      baseForm({ options: [{ id: 'a', value: 'high', label: 'High priority' }] }),
    );
    expect(request.options).toEqual([{ value: 'high', label: 'High priority', sortOrder: 0 }]);
  });

  it('formToRequest — a comparator that needs a value keeps the trimmed value', () => {
    const form = baseForm({
      fieldType: 'ShortText',
      rules: [
        {
          id: 'r',
          action: 'Require',
          whenFieldKey: 'x',
          comparator: 'eq',
          compareValue: '  execution  ',
        },
      ],
    });
    const request = formToRequest(form);
    expect(request.rules?.[0]?.compareValue).toBe('execution');
  });

  it('formToRequest — DerivedCategory field builds a DerivedCategory config', () => {
    const request = formToRequest(
      baseForm({ fieldType: 'DerivedCategory', defaultValue: '@stage' }),
    );
    expect(request.derived).toEqual({
      kind: 'DerivedCategory',
      expression: null,
      defaultValue: '@stage',
    });
  });

  it('formToRequest — a non-numeric bound on a numeric field parses to null', () => {
    const request = formToRequest(baseForm({ fieldType: 'Number', minValue: 'abc', maxValue: '' }));
    expect(request.minValue).toBeNull();
    expect(request.maxValue).toBeNull();
  });

  it('buildFormFromCatalogRow — system row — maps known fields and empties the rest', () => {
    // Arrange
    const systemRow: FieldCatalogRowDto = {
      id: 'system:Request:recordId',
      objectType: 'Request',
      objectLabel: 'Request',
      fieldKey: 'recordId',
      displayName: 'Record ID',
      fieldType: 'ShortText',
      location: 'Global',
      isRequired: true,
      source: 'System',
      status: 'Active',
      isReadOnly: true,
    };

    // Act
    const form = buildFormFromCatalogRow(systemRow);

    // Assert
    expect(form.object).toBe('Request');
    expect(form.fieldKey).toBe('recordId');
    expect(form.displayName).toBe('Record ID');
    expect(form.fieldType).toBe('ShortText');
    expect(form.location).toBe('Global');
    expect(form.isRequired).toBe(true);
    expect(form.section).toBe('');
    expect(form.visibleStages).toEqual([]);
    expect(form.options).toEqual([]);
    expect(form.rules).toEqual([]);
  });
});
