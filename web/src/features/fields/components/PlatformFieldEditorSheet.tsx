// Platform-field editor sheet (S34). Opened when a platform admin clicks an editable platform-defined
// row (Legacy ID, AI Solutions Status) in the platform Fields catalog. Edits the central definition's
// name and — for Select fields — its options, then PATCHes it firm-wide. Non-blocking side sheet
// (disclosure-surfaces.md); Escape closes. System-immutable platform fields never open this — they use
// the read-only sheet.

import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';

import type { PlatformFieldDto } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

interface PlatformFieldEditorSheetProps {
  field: PlatformFieldDto;
  isSaving: boolean;
  saveError: string | null;
  onSave: (fieldKey: string, displayName: string, selectOptions: string[] | null) => void;
  onClose: () => void;
}

export function PlatformFieldEditorSheet({
  field,
  isSaving,
  saveError,
  onSave,
  onClose,
}: PlatformFieldEditorSheetProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isSelect = field.fieldType === 'Select';
  const [displayName, setDisplayName] = useState(field.displayName);
  const [optionsText, setOptionsText] = useState((field.selectOptions ?? []).join(', '));

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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const options = isSelect
      ? optionsText
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : null;
    onSave(field.fieldKey, displayName.trim(), options);
  };

  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="platform-field-editor-heading"
      data-ds="sheet"
    >
      <header className="fields-sheet__header">
        <h2 id="platform-field-editor-heading" tabIndex={-1} ref={headingRef} className="h3">
          {field.displayName}
        </h2>
        <IconButton icon={X} label="Close" onClick={onClose} />
      </header>

      <form className="fields-sheet__body" onSubmit={submit}>
        <p className="body">
          This is a platform-defined field. Changes apply to every workspace.
        </p>

        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        <label className="mws-field">
          <span className="caption">Field name</span>
          <input
            className="mws-input"
            value={displayName}
            required
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <div className="mws-field">
          <span className="caption">Key</span>
          <code className="mws-ident">{field.fieldKey}</code>
        </div>

        {isSelect && (
          <label className="mws-field">
            <span className="caption">Options (comma-separated)</span>
            <input
              className="mws-input"
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
            />
          </label>
        )}

        <div className="fields-sheet__footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || displayName.trim().length === 0}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
