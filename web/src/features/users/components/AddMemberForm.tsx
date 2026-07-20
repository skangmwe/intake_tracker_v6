// S29 add-member form — resolve a colleague by email and assign a level (api-contracts §2).
// The email path resolves server-side against active platform users (unresolved / ambiguous → 400),
// so the form surfaces the API's plain-language message. On success the field clears; the list
// refreshes via the mutation's cache invalidation.

import { useState, type FormEvent } from 'react';

import type { AccessLevel, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select, TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useUpsertMember } from '../useMembers';
import { LEVEL_OPTIONS } from '../constants';

interface AddMemberFormProps {
  workspaceId: WorkspaceId;
  /** When provided, a Cancel button is shown and the form closes after a successful add. */
  onClose?: () => void;
}

export function AddMemberForm({ workspaceId, onClose }: AddMemberFormProps) {
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<AccessLevel>('Member');
  const upsert = useUpsertMember(workspaceId);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    upsert.mutate(
      { email: trimmed, level },
      {
        onSuccess: () => {
          setEmail('');
          onClose?.();
        },
      },
    );
  };

  return (
    <form className="users-access__add" onSubmit={onSubmit} aria-label="Add a member">
      <div className="users-access__add-fields">
        <TextField
          label="Member email"
          value={email}
          onChange={setEmail}
          placeholder="colleague@mwe.com"
          autoComplete="email"
          hint="They must have signed in to the platform at least once."
        />
        <Select
          label="Level"
          value={level}
          onChange={(next) => setLevel(next as AccessLevel)}
          options={LEVEL_OPTIONS}
        />
      </div>
      <div className="users-access__add-actions">
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose} disabled={upsert.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={upsert.isPending || email.trim().length === 0}>
          {upsert.isPending ? 'Adding…' : 'Add member'}
        </Button>
      </div>
      {upsert.isError && (
        <p className="mws-alert mws-alert--error users-access__add-error" role="alert">
          {problemMessage(upsert.error)}
        </p>
      )}
    </form>
  );
}
