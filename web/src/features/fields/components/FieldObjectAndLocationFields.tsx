// The Object + Location selects for the field editor sheet (S30). Extracted so the sheet stays
// under the component line budget (web-component-architecture.md) — the same pattern used for
// Type/Category, Extras, and Rules. When `fixedObject` is set (SP3b Slice 2a — the platform
// Global-object field flow), Object renders as a fixed label instead of a select (every field on
// that screen belongs to one Global custom object) and Location is dropped entirely (always
// 'Global'), mirroring how PlatformObjectEditorSheet drops Location for a Global object.

import { FIELD_LOCATION_OPTIONS, FIELD_TYPE_OPTIONS, OBJECT_OPTIONS, TASK_FIELD_TYPE_OPTIONS } from '../constants';
import type { FieldForm } from '../fieldForm';

interface FieldObjectAndLocationFieldsProps {
  form: FieldForm;
  isCreate: boolean;
  readOnly: boolean;
  customObjectOptions: readonly { value: string; label: string }[];
  fixedObject?: { objectType: string; label: string } | undefined;
  onPatch: (patch: Partial<FieldForm>) => void;
}

export function FieldObjectAndLocationFields({
  form,
  isCreate,
  readOnly,
  customObjectOptions,
  fixedObject,
  onPatch,
}: FieldObjectAndLocationFieldsProps) {
  const isCustomObject = customObjectOptions.some((option) => option.value === form.object);

  if (fixedObject) {
    return (
      <div className="mws-field">
        <span className="caption">Object</span>
        <p className="body">{fixedObject.label}</p>
      </div>
    );
  }

  return (
    <>
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
            const nextOptions = nextObject === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
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

      <label className="mws-field">
        <span className="caption">Location</span>
        <select
          className="mws-select"
          aria-label="Location"
          value={form.location}
          disabled={readOnly || isCustomObject}
          onChange={(event) => onPatch({ location: event.target.value as FieldForm['location'] })}
        >
          {FIELD_LOCATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isCustomObject && <span className="caption">Custom-object fields are workspace-local.</span>}
      </label>
    </>
  );
}
