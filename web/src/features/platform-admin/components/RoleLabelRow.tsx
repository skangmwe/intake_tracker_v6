// S37 role-label row — displays a label with Edit (inline rename) and Retire actions. Rename is
// self-contained here (its own draft + mutation); retire is lifted to the page, which owns the confirm
// dialog. A rename error (blank / duplicate) renders inline. Forward-only per BS §7.2.

import { useState, type FormEvent } from 'react';

import type { RoleLabelDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useRenameRoleLabel } from '../useRoleLabels';

interface RoleLabelRowProps {
  label: RoleLabelDto;
  onRetire: (label: RoleLabelDto) => void;
}

export function RoleLabelRow({ label, onRetire }: RoleLabelRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label.label);
  const rename = useRenameRoleLabel();

  const startEdit = () => {
    rename.reset();
    setDraft(label.label);
    setEditing(true);
  };

  const cancelEdit = () => {
    rename.reset();
    setEditing(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === label.label) {
      setEditing(false);
      return;
    }
    rename.mutate({ roleLabelId: label.roleLabelId, label: trimmed }, { onSuccess: () => setEditing(false) });
  };

  if (editing) {
    return (
      <li className="platform-admin__label-row">
        <form className="platform-admin__label-edit" onSubmit={onSubmit} aria-label={`Rename ${label.label}`}>
          <TextField label="Role label" value={draft} onChange={setDraft} />
          <div className="platform-admin__label-actions">
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={cancelEdit} disabled={rename.isPending}>
              Cancel
            </Button>
          </div>
          {rename.isError && (
            <p className="mws-alert mws-alert--error platform-admin__label-error" role="alert">
              {problemMessage(rename.error)}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="platform-admin__label-row">
      <span className="platform-admin__label-name">{label.label}</span>
      <div className="platform-admin__label-actions">
        <Button variant="secondary" compact onClick={startEdit}>
          Rename
        </Button>
        <Button variant="secondary" compact onClick={() => onRetire(label)}>
          Retire
        </Button>
      </div>
    </li>
  );
}
