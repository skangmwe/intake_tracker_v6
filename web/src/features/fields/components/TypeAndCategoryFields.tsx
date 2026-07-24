// The type + category selects for the field editor sheet (S30). Extracted so the sheet stays under
// the component line budget (web-component-architecture.md).

import type { FieldCategory, FieldType } from '@shared/types';

import type { FieldForm } from '../fieldForm';

interface Option {
  readonly value: string;
  readonly label: string;
}

interface TypeAndCategoryFieldsProps {
  form: FieldForm;
  fieldTypeOptions: readonly { value: FieldType; label: string }[];
  categoryOptions: readonly Option[];
  onPatch: (patch: Partial<FieldForm>) => void;
  disabled?: boolean;
}

export function TypeAndCategoryFields({
  form,
  fieldTypeOptions,
  categoryOptions,
  onPatch,
  disabled,
}: TypeAndCategoryFieldsProps) {
  return (
    <div className="fields-inline-pair">
      <label className="mws-field">
        <span className="caption">Type</span>
        <select
          className="mws-select"
          value={form.fieldType}
          disabled={disabled}
          onChange={(event) => onPatch({ fieldType: event.target.value as FieldType })}
        >
          {fieldTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mws-field">
        <span className="caption">Category</span>
        <select
          className="mws-select"
          value={form.category}
          disabled={disabled}
          onChange={(event) => onPatch({ category: event.target.value as FieldCategory })}
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
