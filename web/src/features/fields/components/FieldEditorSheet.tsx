// The field configuration side sheet (S30) — create or edit one field: attributes, per-stage
// visibility, select options, derived config, and conditional rules. Non-blocking side sheet
// (disclosure-surfaces.md); Escape closes. The dependency graph is validated server-side at save.

import { useEffect, useMemo, useRef, useState } from 'react';
import { LockSimple, X } from '@phosphor-icons/react';
import type {
  FieldDefinitionDto,
  FieldDefinitionUpsertRequest,
  FieldObjectTypeOrSlug,
} from '@shared/types';

import { IconButton } from '@/shared/components/Button';

import {
  CATEGORY_OPTIONS,
  FIELD_LOCATION_OPTIONS,
  FIELD_TYPE_OPTIONS,
  OBJECT_OPTIONS,
  TASK_FIELD_TYPE_OPTIONS,
} from '../constants';
import { buildInitialForm, formToRequest, type FieldForm } from '../fieldForm';
import { FieldEditorExtras } from './FieldEditorExtras';
import { FieldEditorFooter } from './FieldEditorFooter';
import { RulesEditor } from './RulesEditor';
import { TypeAndCategoryFields } from './TypeAndCategoryFields';

interface FieldEditorSheetProps {
  /** Default object for a new field. Existing fields carry their own object. */
  initialObjectType: FieldObjectTypeOrSlug;
  field: FieldDefinitionDto | null;
  /** Field keys available to rule conditions, per object — the current object's set is used. */
  availableKeysByObject: Partial<Record<string, string[]>>;
  /** Custom (non-built-in) objects the workspace has defined — surfaced in the Object dropdown. */
  customObjectOptions: readonly { value: string; label: string }[];
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  /** Archive (configuration retirement) an existing field. Absent for the create flow. */
  onArchive?: (() => void) | undefined;
  isArchiving?: boolean | undefined;
  onClose: () => void;
  /** When true, every control is disabled, a lock banner shows, and the footer is CLOSE-only. */
  readOnly?: boolean;
  /** Lock-banner copy (source-keyed). Shown only when readOnly. */
  lockMessage?: string;
  /** Seed form for a locked row that has no fetchable definition (System / foreign-Global). */
  readOnlyForm?: FieldForm;
}

export function FieldEditorSheet({
  initialObjectType,
  field,
  availableKeysByObject,
  customObjectOptions,
  saveError,
  isSaving,
  onSave,
  onArchive,
  isArchiving = false,
  onClose,
  readOnly = false,
  lockMessage,
  readOnlyForm,
}: FieldEditorSheetProps) {
  const isCreate = !readOnly && field === null;
  const [form, setForm] = useState<FieldForm>(() =>
    readOnly && readOnlyForm
      ? readOnlyForm
      : buildInitialForm(field, initialObjectType, FIELD_TYPE_OPTIONS),
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
  const isCustomObject = customObjectOptions.some((option) => option.value === form.object);

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
          {readOnly
            ? `Edit ${form.displayName}`
            : field
              ? `Edit ${field.displayName}`
              : 'Add field'}
        </h2>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </header>

      <form className="fields-sheet__body" onSubmit={submit}>
        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        {readOnly && lockMessage && (
          <p className="mws-alert mws-alert--info fields-sheet__lock" role="note">
            <LockSimple size={16} aria-hidden /> {lockMessage}
          </p>
        )}

        <label className="mws-field">
          <span className="caption">Display name</span>
          <input
            className="mws-input"
            value={form.displayName}
            required
            disabled={readOnly}
            onChange={(event) => patch({ displayName: event.target.value })}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Field key</span>
          <input
            className="mws-input"
            value={form.fieldKey}
            required
            disabled={readOnly || !isCreate}
            pattern="[A-Za-z][A-Za-z0-9]*"
            onChange={(event) => patch({ fieldKey: event.target.value })}
          />
        </label>

        <TypeAndCategoryFields
          form={form}
          fieldTypeOptions={fieldTypeOptions}
          categoryOptions={CATEGORY_OPTIONS}
          onPatch={patch}
          disabled={readOnly}
        />

        <label className="mws-field">
          <span className="caption">Object</span>
          <select
            className="mws-select"
            aria-label="Object"
            value={form.object}
            disabled={readOnly || !isCreate}
            onChange={(event) => {
              const nextObject = event.target.value;
              const nextIsCustom = customObjectOptions.some(
                (option) => option.value === nextObject,
              );
              const nextOptions =
                nextObject === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;
              const stillValid = nextOptions.some((option) => option.value === form.fieldType);
              patch({
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
            onChange={(event) => patch({ location: event.target.value as FieldForm['location'] })}
          >
            {FIELD_LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isCustomObject && (
            <span className="caption">Custom-object fields are workspace-local.</span>
          )}
        </label>

        <label className="mws-field">
          <span className="caption">Section (optional)</span>
          <input
            className="mws-input"
            value={form.section}
            disabled={readOnly}
            onChange={(event) => patch({ section: event.target.value })}
          />
        </label>

        <label className="mws-field mws-check">
          <input
            type="checkbox"
            checked={form.isRequired}
            disabled={readOnly}
            onChange={(event) => patch({ isRequired: event.target.checked })}
          />
          <span className="caption">Required</span>
        </label>

        <FieldEditorExtras form={form} onPatch={patch} disabled={readOnly} />

        <RulesEditor
          rows={form.rules}
          fieldKeys={availableFieldKeys}
          onChange={(rules) => patch({ rules })}
          disabled={readOnly}
        />

        <FieldEditorFooter
          readOnly={readOnly}
          field={field}
          onArchive={onArchive}
          isArchiving={isArchiving}
          isSaving={isSaving}
          onClose={onClose}
        />
      </form>
    </div>
  );
}
