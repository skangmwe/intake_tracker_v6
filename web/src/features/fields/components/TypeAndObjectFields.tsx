// The Type + Object selects for the field editor sheet (S30) — the first paired row of the
// reconciled New-field layout. Extracted so the sheet stays under the component line budget
// (web-component-architecture.md). Object carries the custom-object interlock: switching to a
// custom object forces the workspace-local scope and re-defaults the field type if the current
// one isn't offered for the new object. When `fixedObject` is set (SP3b Slice 2a — the platform
// Global-object field flow), Object renders as a fixed label instead of a select.

import type { FieldType } from '@shared/types';

import { FIELD_TYPE_OPTIONS, OBJECT_OPTIONS, TASK_FIELD_TYPE_OPTIONS } from '../constants';
import type { FieldForm } from '../fieldForm';

interface TypeAndObjectFieldsProps {
  form: FieldForm;
  fieldTypeOptions: readonly { value: FieldType; label: string }[];
  isCreate: boolean;
  readOnly: boolean;
  customObjectOptions: readonly { value: string; label: string }[];
  fixedObject?: { objectType: string; label: string } | undefined;
  onPatch: (patch: Partial<FieldForm>) => void;
}

export function TypeAndObjectFields({
  form,
  fieldTypeOptions,
  isCreate,
  readOnly,
  customObjectOptions,
  fixedObject,
  onPatch,
}: TypeAndObjectFieldsProps) {
  return (
    <div className="fields-inline-pair">
      <label className="mws-field">
        <span className="caption">Type</span>
        <select
          className="mws-select"
          value={form.fieldType}
          disabled={readOnly}
          onChange={(event) => onPatch({ fieldType: event.target.value as FieldType })}
        >
          {fieldTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {fixedObject ? (
        <div className="mws-field">
          <span className="caption">Object</span>
          <p className="body">{fixedObject.label}</p>
        </div>
      ) : (
        <label className="mws-field">
          <span className="caption">Object</span>
          <select
            className="mws-select"
            aria-label="Object"
            value={form.object}
            disabled={readOnly || !isCreate}
            onChange={(event) => {
              const nextObject = event.target.value;
              const nextIsCustom = customObjectOptions.some((option) => option.value === nextObject);
              const nextOptions =
                nextObject === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
              const stillValid = nextOptions.some((option) => option.value === form.fieldType);
              onPatch({
                object: nextObject,
                fieldType: stillValid ? form.fieldType : (nextOptions[0]?.value ?? 'ShortText'),
                // Custom-object fields are workspace-local — force the scope when switching to one.
                ...(nextIsCustom ? { location: 'LocalWorkspace' as const } : {}),
              });
            }}
          >
            {OBJECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {customObjectOptions.length > 0 && (
              <optgroup label="Custom objects">
                {customObjectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
    </div>
  );
}
