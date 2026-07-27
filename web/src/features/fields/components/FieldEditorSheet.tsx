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

import { FIELD_TYPE_OPTIONS, TASK_FIELD_TYPE_OPTIONS } from '../constants';
import {
  buildInitialForm,
  deriveFieldKey,
  formToRequest,
  type FieldForm,
  type FieldKeyOption,
} from '../fieldForm';
import { FieldDeleteConfirm } from './FieldDeleteConfirm';
import { FieldEditorExtras } from './FieldEditorExtras';
import { FieldEditorFooter } from './FieldEditorFooter';
import { LocationAndSectionFields } from './LocationAndSectionFields';
import { RulesEditor } from './RulesEditor';
import { TypeAndObjectFields } from './TypeAndObjectFields';

interface FieldEditorSheetProps {
  /** Default object for a new field. Existing fields carry their own object. */
  initialObjectType: FieldObjectTypeOrSlug;
  field: FieldDefinitionDto | null;
  /** Fields available to rule conditions, per object — the current object's set is used. Each
   * carries the immutable key plus the analyst-facing label the rule dropdown shows. */
  availableKeysByObject: Partial<Record<string, FieldKeyOption[]>>;
  /** Custom (non-built-in) objects the workspace has defined — surfaced in the Object dropdown.
   * Only meaningful in the workspace create/edit flow; defaults to none (platform/read-only). */
  customObjectOptions?: readonly { value: string; label: string }[];
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
  /**
   * SP3b Slice 2a — the platform Global-object field flow. When set, Object renders as a fixed
   * label (no select — every field on this screen belongs to this one Global custom object) and
   * the Location control is dropped entirely (always 'Global'), mirroring how
   * PlatformObjectEditorSheet drops Location for a Global object.
   */
  fixedObject?: { objectType: FieldObjectTypeOrSlug; label: string } | undefined;
  /** Confirmed destructive delete (Global-object field flow) — shows FieldDeleteConfirm
   * (role="alertdialog") before calling. Distinct from onArchive, which fires immediately. */
  onDelete?: (() => void) | undefined;
  isDeleting?: boolean | undefined;
}

export function FieldEditorSheet({
  initialObjectType,
  field,
  availableKeysByObject,
  customObjectOptions = [],
  saveError,
  isSaving,
  onSave,
  onArchive,
  isArchiving = false,
  onClose,
  readOnly = false,
  lockMessage,
  readOnlyForm,
  fixedObject,
  onDelete,
  isDeleting = false,
}: FieldEditorSheetProps) {
  const isCreate = !readOnly && field === null;
  const [form, setForm] = useState<FieldForm>(() => {
    const initial =
      readOnly && readOnlyForm
        ? readOnlyForm
        : buildInitialForm(field, initialObjectType, FIELD_TYPE_OPTIONS);
    return fixedObject
      ? { ...initial, object: fixedObject.objectType, location: 'Global' }
      : initial;
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
          {readOnly
            ? `Edit ${form.displayName}`
            : field
              ? `Edit ${field.displayName}`
              : 'New field'}
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
            placeholder="What analysts see"
            value={form.displayName}
            required
            disabled={readOnly}
            onChange={(event) => {
              const displayName = event.target.value;
              // The key is derived from the display name on create and frozen thereafter.
              patch(isCreate ? { displayName, fieldKey: deriveFieldKey(displayName) } : { displayName });
            }}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Field key</span>
          <input
            className="mws-input fields-key-input"
            placeholder="Generated from the display name"
            value={form.fieldKey}
            disabled
          />
          <span className="fields-optional">
            The key is set when the field is created and can&rsquo;t be changed — it&rsquo;s
            referenced by data and integrations.
          </span>
        </label>

        <TypeAndObjectFields
          form={form}
          fieldTypeOptions={fieldTypeOptions}
          isCreate={isCreate}
          readOnly={readOnly}
          customObjectOptions={customObjectOptions}
          fixedObject={fixedObject}
          onPatch={patch}
        />

        <LocationAndSectionFields
          form={form}
          readOnly={readOnly}
          customObjectOptions={customObjectOptions}
          fixedObject={fixedObject}
          onPatch={patch}
        />

        <div className="fields-toggle-row" data-ds="toggle">
          <span className="fields-toggle-row__text">
            <span className="caption">Required</span>
            <span className="fields-optional">Analysts must fill this in before saving the record.</span>
          </span>
          <label className="mws-switch">
            <input
              type="checkbox"
              aria-label="Required"
              checked={form.isRequired}
              disabled={readOnly}
              onChange={(event) => patch({ isRequired: event.target.checked })}
            />
            <span className="mws-switch__track">
              <span className="mws-switch__thumb" />
            </span>
          </label>
        </div>

        <FieldEditorExtras form={form} onPatch={patch} disabled={readOnly} />

        <RulesEditor
          rows={form.rules}
          fieldOptions={availableFieldKeys}
          onChange={(rules) => patch({ rules })}
          disabled={readOnly}
        />

        {onDelete && confirmingDelete && (
          <FieldDeleteConfirm
            fieldLabel={field?.displayName || form.displayName || 'this field'}
            isDeleting={isDeleting}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={onDelete}
          />
        )}

        <FieldEditorFooter
          readOnly={readOnly}
          field={field}
          onArchive={onArchive}
          isArchiving={isArchiving}
          onRequestDelete={onDelete ? () => setConfirmingDelete(true) : undefined}
          confirmingDelete={confirmingDelete}
          isSaving={isSaving}
          disableSubmit={form.displayName.trim().length === 0}
          onClose={onClose}
        />
      </form>
    </div>
  );
}
