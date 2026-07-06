// S37 add-role-label form. Adds a gate role label to the platform catalog (BS §7.2). A blank or
// duplicate label comes back as 400 / 409 and renders inline (the API's plain-language message). On
// success the field clears; the list refreshes via the mutation's cache invalidation.

import { useState, type FormEvent } from 'react';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useCreateRoleLabel } from '../useRoleLabels';

export function AddRoleLabelForm() {
  const [label, setLabel] = useState('');
  const create = useCreateRoleLabel();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    create.mutate(trimmed, { onSuccess: () => setLabel('') });
  };

  return (
    <form className="platform-admin__add" onSubmit={onSubmit} aria-label="Add a role label">
      <div className="platform-admin__add-fields">
        <TextField
          label="Role label"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Records Manager"
          hint="Used when configuring gate approver slots."
        />
      </div>
      <div className="platform-admin__add-actions">
        <Button type="submit" disabled={create.isPending || label.trim().length === 0}>
          {create.isPending ? 'Adding…' : 'Add role label'}
        </Button>
      </div>
      {create.isError && (
        <p className="mws-alert mws-alert--error platform-admin__add-error" role="alert">
          {problemMessage(create.error)}
        </p>
      )}
    </form>
  );
}
