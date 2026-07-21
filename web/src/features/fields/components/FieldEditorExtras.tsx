// The type-specific and per-stage sections of the field editor — numeric bounds, select options,
// derived config, and stage visibility. Split from FieldEditorSheet so each stays focused and under
// the component-length limit (web-component-architecture.md). Purely presentational.

import type { FieldForm } from '../fieldForm';
import { NUMERIC_TYPES, SELECT_TYPES, STAGE_KEYS } from '../constants';
import { OptionsEditor } from './OptionsEditor';

interface FieldEditorExtrasProps {
  form: FieldForm;
  onPatch: (next: Partial<FieldForm>) => void;
}

export function FieldEditorExtras({ form, onPatch }: FieldEditorExtrasProps) {
  const isSelect = SELECT_TYPES.includes(form.fieldType);
  const isNumeric = NUMERIC_TYPES.includes(form.fieldType);

  return (
    <>
      {isNumeric && (
        <div className="fields-inline-pair">
          <label className="mws-field">
            <span className="caption">Min value</span>
            <input
              className="mws-input"
              inputMode="numeric"
              value={form.minValue}
              onChange={(event) => onPatch({ minValue: event.target.value })}
            />
          </label>
          <label className="mws-field">
            <span className="caption">Max value</span>
            <input
              className="mws-input"
              inputMode="numeric"
              value={form.maxValue}
              onChange={(event) => onPatch({ maxValue: event.target.value })}
            />
          </label>
        </div>
      )}

      {isSelect && (
        <OptionsEditor rows={form.options} onChange={(options) => onPatch({ options })} />
      )}

      {form.fieldType === 'Calculation' && (
        <label className="mws-field">
          <span className="caption">Expression</span>
          <input
            className="mws-input"
            placeholder="businessValue + efficiencyGain - levelOfEffort"
            value={form.expression}
            onChange={(event) => onPatch({ expression: event.target.value })}
          />
        </label>
      )}

      {form.fieldType === 'DerivedCategory' && (
        <label className="mws-field">
          <span className="caption">Default value (optional)</span>
          <input
            className="mws-input"
            value={form.defaultValue}
            onChange={(event) => onPatch({ defaultValue: event.target.value })}
          />
        </label>
      )}

      <fieldset className="mws-field">
        <legend className="caption">Visible on stages</legend>
        <p className="caption">Leave all unchecked to show on every stage.</p>
        <div className="fields-stage-grid">
          {STAGE_KEYS.map((stage) => (
            <label key={stage} className="mws-check">
              <input
                type="checkbox"
                checked={form.visibleStages.includes(stage)}
                onChange={(event) =>
                  onPatch({
                    visibleStages: event.target.checked
                      ? [...form.visibleStages, stage]
                      : form.visibleStages.filter((entry) => entry !== stage),
                  })
                }
              />
              <span className="caption">{stage}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
