// The field configuration side sheet (S30) — create or edit one field: attributes, per-stage
// visibility, select options, derived config, and conditional rules. Non-blocking side sheet
// (disclosure-surfaces.md); Escape closes. The dependency graph is validated server-side at save.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type {
  FieldDefinitionDto,
  FieldDefinitionUpsertRequest,
  FieldObjectType,
} from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

import {
  CATEGORY_OPTIONS,
  FIELD_LOCATION_OPTIONS,
  FIELD_TYPE_OPTIONS,
  OBJECT_OPTIONS,
  TASK_FIELD_TYPE_OPTIONS,
} from '../constants';
import { buildInitialForm, formToRequest, type FieldForm } from '../fieldForm';
import { FieldEditorExtras } from './FieldEditorExtras';
import { RulesEditor } from './RulesEditor';
import { TypeAndCategoryFields } from './TypeAndCategoryFields';

interface FieldEditorSheetProps {
  /** Default object for a new field. Existing fields carry their own object. */
  initialObjectType: FieldObjectType;
  field: FieldDefinitionDto | null;
  /** Field keys available to rule conditions, per object — the current object's set is used. */
  availableKeysByObject: Partial<Record<FieldObjectType, string[]>>;
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  /** Archive (configuration retirement) an existing field. Absent for the create flow. */
  onArchive?: (() => void) | undefined;
  isArchiving?: boolean | undefined;
  onClose: () => void;
}

export function FieldEditorSheet({
  initialObjectType,
  field,
  availableKeysByObject,
  saveError,
  isSaving,
  onSave,
  onArchive,
  isArchiving = false,
  onClose,
}: FieldEditorSheetProps) {
  const isCreate = field === null;
  const [form, setForm] = useState<FieldForm>(() =>
    buildInitialForm(field, initialObjectType, FIELD_TYPE_OPTIONS),
  );
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
    const request = formToRequest(form);
    onSave(form.fieldKey.trim(), request, isCreate);
  };

  // The Task object exposes the narrower typed-field library; every other object the full catalog.
  const fieldTypeOptions = form.object === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
  const availableFieldKeys = useMemo(
    () => availableKeysByObject[form.object] ?? [],
    [availableKeysByObject, form.object],
  );

  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="field-editor-heading"
      data-ds="sheet"
    >
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
          <span className="caption">Object</span>
          <select
            className="mws-select"
            value={form.object}
            disabled={!isCreate}
            onChange={(event) => {
              const nextObject = event.target.value as FieldObjectType;
              const nextOptions =
                nextObject === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
              const stillValid = nextOptions.some((option) => option.value === form.fieldType);
              patch({
                object: nextObject,
                fieldType: stillValid ? form.fieldType : (nextOptions[0]?.value ?? 'ShortText'),
              });
            }}
          >
            {OBJECT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mws-field">
          <span className="caption">Location</span>
          <select
            className="mws-select"
            value={form.location}
            onChange={(event) => patch({ location: event.target.value as FieldForm['location'] })}
          >
            {FIELD_LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mws-field">
          <span className="caption">Section (optional)</span>
          <input
            className="mws-input"
            value={form.section}
            onChange={(event) => patch({ section: event.target.value })}
          />
        </label>

        <label className="mws-field mws-check">
          <input
            type="checkbox"
            checked={form.isRequired}
            onChange={(event) => patch({ isRequired: event.target.checked })}
          />
          <span className="caption">Required</span>
        </label>

        <FieldEditorExtras form={form} onPatch={patch} />

        <RulesEditor
          rows={form.rules}
          fieldKeys={availableFieldKeys}
          onChange={(rules) => patch({ rules })}
        />

        <footer className="fields-sheet__footer">
          {field && !field.isRetired && onArchive && (
            <Button variant="secondary" onClick={onArchive} disabled={isArchiving}>
              {isArchiving ? 'Archiving…' : 'Archive'}
            </Button>
          )}
          <span className="fields-sheet__footer-spacer" />
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
