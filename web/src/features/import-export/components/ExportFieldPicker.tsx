// Export field checklist (S28 export wizard, step 2). One checkbox per exportable field. Identity
// fields (alwaysIncluded) are checked and locked — every exported record stays identifiable (BS §13).
// Semantic fieldset + legend with a real <label> per control (forms-and-input.md / accessibility.md).

import type { IoFieldSpec } from '@shared/types';

interface ExportFieldPickerProps {
  fields: IoFieldSpec[];
  /** Field keys the user has chosen (excludes the always-included identity keys, which are implicit). */
  selected: ReadonlySet<string>;
  onToggle: (fieldKey: string) => void;
}

export function ExportFieldPicker({ fields, selected, onToggle }: ExportFieldPickerProps) {
  return (
    <fieldset className="ie-fieldpicker" data-ds="field-picker">
      <legend className="ie-fieldpicker__legend">Columns to export</legend>
      <ul className="ie-fieldpicker__list">
        {fields.map((field) => {
          const locked = field.alwaysIncluded === true;
          const checked = locked || selected.has(field.key);
          return (
            <li key={field.key} className="ie-fieldpicker__item">
              <label className="ie-fieldpicker__label">
                <input
                  type="checkbox"
                  className="ie-fieldpicker__checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => onToggle(field.key)}
                />
                <span className="ie-fieldpicker__name">{field.label}</span>
                {locked && <span className="ie-fieldpicker__note"> (always included)</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
