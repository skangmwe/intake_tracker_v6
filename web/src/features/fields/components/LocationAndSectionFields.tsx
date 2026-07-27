// The Location + Section row for the field editor sheet (S30) — the second paired row of the
// reconciled New-field layout. Extracted so the sheet stays under the component line budget
// (web-component-architecture.md). Location is disabled for custom objects (always workspace-local).
// When `fixedObject` is set (SP3b Slice 2a — the platform Global-object field flow) Location is
// dropped entirely, so Section renders full-width on its own.

import { FIELD_LOCATION_OPTIONS } from '../constants';
import type { FieldForm } from '../fieldForm';

interface LocationAndSectionFieldsProps {
  form: FieldForm;
  readOnly: boolean;
  customObjectOptions: readonly { value: string; label: string }[];
  fixedObject?: { objectType: string; label: string } | undefined;
  onPatch: (patch: Partial<FieldForm>) => void;
}

export function LocationAndSectionFields({
  form,
  readOnly,
  customObjectOptions,
  fixedObject,
  onPatch,
}: LocationAndSectionFieldsProps) {
  const isCustomObject = customObjectOptions.some((option) => option.value === form.object);

  const sectionField = (
    <label className="mws-field">
      <span className="caption">
        Section <span className="fields-optional">(optional)</span>
      </span>
      <input
        className="mws-input"
        placeholder="Groups the field on the record"
        value={form.section}
        disabled={readOnly}
        onChange={(event) => onPatch({ section: event.target.value })}
      />
    </label>
  );

  if (fixedObject) {
    return sectionField;
  }

  return (
    <div className="fields-inline-pair">
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
        {isCustomObject && (
          <span className="fields-optional">Custom-object fields are workspace-local.</span>
        )}
      </label>
      {sectionField}
    </div>
  );
}
