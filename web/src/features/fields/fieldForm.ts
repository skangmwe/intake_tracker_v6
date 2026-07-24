// Pure form model + mapping helpers for the field editor (S30). Kept separate from the sheet so the
// create-defaults and the form→request translation are unit-testable without rendering.

import type {
  DerivedFieldDto,
  FieldCatalogRowDto,
  FieldCategory,
  FieldDefinitionDto,
  FieldDefinitionUpsertRequest,
  FieldLocation,
  FieldObjectType,
  FieldType,
} from '@shared/types';

import { NUMERIC_TYPES, SELECT_TYPES } from './constants';
import type { OptionRow } from './components/OptionsEditor';
import type { RuleRow } from './components/RulesEditor';

export interface FieldForm {
  object: FieldObjectType;
  location: FieldLocation;
  fieldKey: string;
  displayName: string;
  fieldType: FieldType;
  category: FieldCategory;
  section: string;
  isRequired: boolean;
  minValue: string;
  maxValue: string;
  visibleStages: string[];
  options: OptionRow[];
  rules: RuleRow[];
  expression: string;
  defaultValue: string;
}

export function buildInitialForm(
  field: FieldDefinitionDto | null,
  objectType: FieldObjectType,
  fieldTypeOptions: readonly { value: FieldType; label: string }[],
): FieldForm {
  if (field === null) {
    return {
      object: objectType,
      location: 'LocalWorkspace',
      fieldKey: '',
      displayName: '',
      fieldType: fieldTypeOptions[0]?.value ?? 'ShortText',
      category: 'WorkspaceLocal',
      section: '',
      isRequired: false,
      minValue: '',
      maxValue: '',
      visibleStages: [],
      options: [],
      rules: [],
      expression: '',
      defaultValue: '',
    };
  }

  return {
    object: field.objectType,
    location: field.location,
    fieldKey: field.fieldKey,
    displayName: field.displayName,
    fieldType: field.fieldType,
    category: field.category,
    section: field.section ?? '',
    isRequired: field.isRequired,
    minValue: field.minValue?.toString() ?? '',
    maxValue: field.maxValue?.toString() ?? '',
    visibleStages: field.visibleStages ?? [],
    options: field.options.map((option) => ({
      id: option.id,
      value: option.value,
      label: option.label,
    })),
    rules: field.rules
      .filter((rule) => rule.action !== 'ProduceValue')
      .map((rule) => ({
        id: rule.id,
        action: rule.action,
        whenFieldKey: rule.whenFieldKey,
        comparator: rule.comparator,
        compareValue: rule.compareValue ?? '',
      })),
    expression: field.derived?.expression ?? '',
    defaultValue: field.derived?.defaultValue ?? '',
  };
}

export function formToRequest(form: FieldForm): FieldDefinitionUpsertRequest {
  const isSelect = SELECT_TYPES.includes(form.fieldType);
  const isNumeric = NUMERIC_TYPES.includes(form.fieldType);

  return {
    objectType: form.object,
    location: form.location,
    fieldKey: form.fieldKey.trim(),
    displayName: form.displayName.trim(),
    fieldType: form.fieldType,
    category: form.category,
    section: form.section.trim() || null,
    isRequired: form.isRequired,
    visibleStages: form.visibleStages.length > 0 ? form.visibleStages : null,
    minValue: isNumeric ? parseNumber(form.minValue) : null,
    maxValue: isNumeric ? parseNumber(form.maxValue) : null,
    // `options` is only present for select fields — omit it entirely otherwise
    // (exactOptionalPropertyTypes forbids assigning `undefined` to an optional property).
    ...(isSelect
      ? {
          options: form.options
            .filter((option) => option.value.trim().length > 0)
            .map((option, index) => ({
              value: option.value.trim(),
              label: option.label.trim() || option.value.trim(),
              sortOrder: index,
            })),
        }
      : {}),
    rules: form.rules.map((rule, index) => ({
      action: rule.action,
      whenFieldKey: rule.whenFieldKey,
      comparator: rule.comparator,
      compareValue: needsValue(rule.comparator) ? rule.compareValue.trim() || null : null,
      produceValue: null,
      sortOrder: index,
    })),
    derived: buildDerived(form),
  };
}

function buildDerived(form: FieldForm): DerivedFieldDto | null {
  if (form.fieldType === 'Calculation') {
    return { kind: 'Calculation', expression: form.expression.trim() || null, defaultValue: null };
  }

  if (form.fieldType === 'DerivedCategory') {
    return {
      kind: 'DerivedCategory',
      expression: null,
      defaultValue: form.defaultValue.trim() || null,
    };
  }

  return null;
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function needsValue(comparator: string): boolean {
  return comparator !== 'isSet' && comparator !== 'isNotSet';
}

/**
 * Seed a read-only field form from a lightweight catalog row. Used for locked rows
 * (System / Platform / foreign-Global) that have no fetchable FieldDefinition — the sheet
 * renders disabled, so the fields the row omits show their empty state.
 */
export function buildFormFromCatalogRow(row: FieldCatalogRowDto): FieldForm {
  return {
    object: row.objectType,
    location: row.location,
    fieldKey: row.fieldKey,
    displayName: row.displayName,
    fieldType: row.fieldType,
    category: 'WorkspaceLocal',
    section: '',
    isRequired: row.isRequired,
    minValue: '',
    maxValue: '',
    visibleStages: [],
    options: [],
    rules: [],
    expression: '',
    defaultValue: '',
  };
}
