// S29 add-member form — add a colleague by email and assign a level (api-contracts §2). A known
// platform user joins immediately (outcome `Member`) and the form closes; an unknown email creates
// a pending invitation (outcome `Invited`) that auto-accepts on first sign-in, and the form stays
// open to confirm it. Ambiguous names / duplicate invites surface the API's plain-language message.
// The list refreshes via the mutation's cache invalidation.

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
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const upsert = useUpsertMember(workspaceId);

  const onEmailChange = (next: string) => {
    setEmail(next);
    if (invitedEmail !== null) setInvitedEmail(null);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    upsert.mutate(
      { email: trimmed, level },
      {
        onSuccess: (result) => {
          setEmail('');
          if (result.outcome === 'Invited') {
            // Unknown email — a pending invitation was created. Keep the form open to confirm it.
            setInvitedEmail(trimmed);
          } else {
            setInvitedEmail(null);
            onClose?.();
          }
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
          onChange={onEmailChange}
          placeholder="colleague@mwe.com"
          autoComplete="email"
          hint="Anyone with a firm email — they join now if they already use the platform, or when they first sign in."
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
      {invitedEmail !== null && !upsert.isError && (
        <p className="mws-alert mws-alert--success users-access__add-notice" role="status">
          Invited {invitedEmail}. They join this workspace the first time they sign in.
        </p>
      )}
      {upsert.isError && (
        <p className="mws-alert mws-alert--error users-access__add-error" role="alert">
          {problemMessage(upsert.error)}
        </p>
      )}
    </form>
  );
}
