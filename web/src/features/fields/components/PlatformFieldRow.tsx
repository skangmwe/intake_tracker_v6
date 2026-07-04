// One row of the platform field schema surface (S34). Editable fields expose an inline name (and,
// for Select fields, an options) editor; system fields render read-only (immutable to everyone, §4.3).

import { useState } from 'react';
import type { PlatformFieldDto } from '@shared/types';

import { Button } from '@/shared/components/Button';

interface PlatformFieldRowProps {
  field: PlatformFieldDto;
  isSaving: boolean;
  onSave: (fieldKey: string, displayName: string, selectOptions: string[] | null) => void;
}

export function PlatformFieldRow({ field, isSaving, onSave }: PlatformFieldRowProps) {
  const isSelect = field.fieldType === 'Select';
  const [displayName, setDisplayName] = useState(field.displayName);
  const [optionsText, setOptionsText] = useState((field.selectOptions ?? []).join(', '));

  if (field.isSystemImmutable) {
    return (
      <li className="fields-platform-item">
        <span className="body">{field.displayName}</span>
        <code className="mws-ident">{field.fieldKey}</code>
        <span className="mws-badge mws-badge--draft">System · read-only</span>
      </li>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const options = isSelect
      ? optionsText.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : null;
    onSave(field.fieldKey, displayName.trim(), options);
  };

  return (
    <li className="fields-platform-edit">
      <form className="fields-platform-edit__form" onSubmit={submit}>
        <label className="mws-field">
          <span className="caption">
            {field.fieldKey} {!field.hasManualWritePath && <em>(no manual write path)</em>}
          </span>
          <input className="mws-input" value={displayName} required onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        {isSelect && (
          <label className="mws-field">
            <span className="caption">Options (comma-separated)</span>
            <input className="mws-input" value={optionsText} onChange={(event) => setOptionsText(event.target.value)} />
          </label>
        )}
        <Button type="submit" variant="secondary" compact disabled={isSaving}>
          Save
        </Button>
      </form>
    </li>
  );
}
