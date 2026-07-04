// The field configuration side sheet (S30) — create or edit one field: attributes, per-stage
// visibility, select options, derived config, and conditional rules. Non-blocking side sheet
// (disclosure-surfaces.md); Escape closes. The dependency graph is validated server-side at save.

import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { FieldDefinitionDto, FieldDefinitionUpsertRequest, FieldObjectType, FieldType } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

import { CATEGORY_OPTIONS, NUMERIC_TYPES, SELECT_TYPES, STAGE_KEYS } from '../constants';
import { buildInitialForm, formToRequest, type FieldForm } from '../fieldForm';
import { OptionsEditor } from './OptionsEditor';
import { RulesEditor } from './RulesEditor';
import { TypeAndCategoryFields } from './TypeAndCategoryFields';

interface FieldEditorSheetProps {
  objectType: FieldObjectType;
  field: FieldDefinitionDto | null;
  fieldTypeOptions: readonly { value: FieldType; label: string }[];
  availableFieldKeys: string[];
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  onClose: () => void;
}

export function FieldEditorSheet({
  objectType,
  field,
  fieldTypeOptions,
  availableFieldKeys,
  saveError,
  isSaving,
  onSave,
  onClose,
}: FieldEditorSheetProps) {
  const isCreate = field === null;
  const [form, setForm] = useState<FieldForm>(() => buildInitialForm(field, objectType, fieldTypeOptions));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const patch = (next: Partial<FieldForm>) => setForm((current) => ({ ...current, ...next }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const request = formToRequest(form, objectType);
    onSave(form.fieldKey.trim(), request, isCreate);
  };

  const isSelect = SELECT_TYPES.includes(form.fieldType);
  const isNumeric = NUMERIC_TYPES.includes(form.fieldType);

  return (
    <div className="fields-sheet" role="dialog" aria-modal="false" aria-labelledby="field-editor-heading" data-ds="sheet">
      <header className="fields-sheet__header">
        <h2 id="field-editor-heading" tabIndex={-1} ref={headingRef} className="h3">
          {isCreate ? 'Add field' : `Edit ${field.displayName}`}
        </h2>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </header>

      <form className="fields-sheet__body" onSubmit={submit}>
        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        <label className="mws-field">
          <span className="caption">Display name</span>
          <input
            className="mws-input"
            value={form.displayName}
            required
            onChange={(event) => patch({ displayName: event.target.value })}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Field key</span>
          <input
            className="mws-input"
            value={form.fieldKey}
            required
            disabled={!isCreate}
            pattern="[A-Za-z][A-Za-z0-9]*"
            onChange={(event) => patch({ fieldKey: event.target.value })}
          />
        </label>

        <TypeAndCategoryFields
          form={form}
          fieldTypeOptions={fieldTypeOptions}
          categoryOptions={CATEGORY_OPTIONS}
          onPatch={patch}
        />

        <label className="mws-field">
          <span className="caption">Section (optional)</span>
          <input className="mws-input" value={form.section} onChange={(event) => patch({ section: event.target.value })} />
        </label>

        <label className="mws-field mws-check">
          <input type="checkbox" checked={form.isRequired} onChange={(event) => patch({ isRequired: event.target.checked })} />
          <span className="caption">Required</span>
        </label>

        {isNumeric && (
          <div className="fields-inline-pair">
            <label className="mws-field">
              <span className="caption">Min value</span>
              <input
                className="mws-input"
                inputMode="numeric"
                value={form.minValue}
                onChange={(event) => patch({ minValue: event.target.value })}
              />
            </label>
            <label className="mws-field">
              <span className="caption">Max value</span>
              <input
                className="mws-input"
                inputMode="numeric"
                value={form.maxValue}
                onChange={(event) => patch({ maxValue: event.target.value })}
              />
            </label>
          </div>
        )}

        {isSelect && <OptionsEditor rows={form.options} onChange={(options) => patch({ options })} />}

        {form.fieldType === 'Calculation' && (
          <label className="mws-field">
            <span className="caption">Expression</span>
            <input
              className="mws-input"
              placeholder="businessValue + efficiencyGain - levelOfEffort"
              value={form.expression}
              onChange={(event) => patch({ expression: event.target.value })}
            />
          </label>
        )}

        {form.fieldType === 'DerivedCategory' && (
          <label className="mws-field">
            <span className="caption">Default value (optional)</span>
            <input className="mws-input" value={form.defaultValue} onChange={(event) => patch({ defaultValue: event.target.value })} />
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
                    patch({
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

        <RulesEditor rows={form.rules} fieldKeys={availableFieldKeys} onChange={(rules) => patch({ rules })} />

        <footer className="fields-sheet__footer">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save field'}
          </Button>
        </footer>
      </form>
    </div>
  );
}
