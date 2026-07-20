// S29 Edit member details — a modal (disclosure-surfaces.md) reached from the row kebab. The only
// editable detail is the member's access level; name and email are shown read-only for context. Save
// is enabled only once the level actually changes. A failed change (e.g. a transient API error)
// renders inline so the admin sees why.

import { useState } from 'react';

import type { AccessLevel, WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { LEVEL_OPTIONS } from '../constants';

interface EditMemberDialogProps {
  member: WorkspaceMemberDto;
  onSave: (level: AccessLevel) => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function EditMemberDialog({ member, onSave, onCancel, isPending, error }: EditMemberDialogProps) {
  const [level, setLevel] = useState<AccessLevel>(member.level);
  const hasChange = level !== member.level;

  return (
    <Modal
      title="Edit member details"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => onSave(level)} disabled={isPending || !hasChange}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <p className="users-access__edit-identity">
        <strong>{member.displayName ?? member.email}</strong>
        <span className="users-access__edit-email">{member.email}</span>
      </p>
      <Select
        label="Access level"
        value={level}
        onChange={(value) => setLevel(value as AccessLevel)}
        options={LEVEL_OPTIONS}
        disabled={isPending}
      />
      {error != null && (
        <p className="mws-alert mws-alert--error users-access__dialog-error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
