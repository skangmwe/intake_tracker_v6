// S29 add-member flow — a centered modal (disclosure-surfaces.md) reached from ADD MEMBER, matching
// the prototype's Add member dialog. Add a colleague by email and assign a level (api-contracts §2).
// A known platform user joins immediately (outcome `Member`) and the modal closes; an unknown email
// creates a pending invitation (outcome `Invited`) that auto-accepts on first sign-in, and the modal
// stays open to confirm it. (Name is intentionally not collected — a member's name resolves from the
// directory on sign-in, so there is nowhere to store a typed name.) Ambiguous names / duplicate
// invites surface the API's plain-language message. The list refreshes via the mutation's cache
// invalidation.

import { useState, type FormEvent } from 'react';

import type { AccessLevel, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select, TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useUpsertMember } from '../useMembers';
import { LEVEL_OPTIONS } from '../constants';

interface AddMemberFormProps {
  workspaceId: WorkspaceId;
  /** Dismiss the modal. Called on Cancel, on scrim / Escape, and after a member joins immediately. */
  onClose?: () => void;
}

export function AddMemberForm({ workspaceId, onClose }: AddMemberFormProps) {
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<AccessLevel>('Member');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const upsert = useUpsertMember(workspaceId);

  const close = () => onClose?.();

  const onEmailChange = (next: string) => {
    setEmail(next);
    if (invitedEmail !== null) setInvitedEmail(null);
  };

  const submit = () => {
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    upsert.mutate(
      { email: trimmed, level },
      {
        onSuccess: (result) => {
          setEmail('');
          if (result.outcome === 'Invited') {
            // Unknown email — a pending invitation was created. Keep the modal open to confirm it.
            setInvitedEmail(trimmed);
          } else {
            setInvitedEmail(null);
            close();
          }
        },
      },
    );
  };

  // The form's onSubmit handles Enter-key implicit submission; the footer button calls submit()
  // directly (it sits outside the <form> in the modal's action row).
  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <Modal
      title="Add member"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={close} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={upsert.isPending || email.trim().length === 0}
          >
            {upsert.isPending ? 'Adding…' : 'Add member'}
          </Button>
        </>
      }
    >
      <form className="users-access__add-form" onSubmit={onFormSubmit} aria-label="Add a member">
        <TextField
          label="Member email"
          value={email}
          onChange={onEmailChange}
          placeholder="colleague@mwe.com"
          autoComplete="email"
          hint="Anyone with a firm email — they join now if they already use the platform, or when they first sign in."
        />
        <Select
          label="Access level"
          value={level}
          onChange={(next) => setLevel(next as AccessLevel)}
          options={LEVEL_OPTIONS}
        />
      </form>
      {invitedEmail !== null && !upsert.isError && (
        <p className="mws-alert mws-alert--success" role="status">
          Invited {invitedEmail}. They join this workspace the first time they sign in.
        </p>
      )}
      {upsert.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(upsert.error)}
        </p>
      )}
    </Modal>
  );
}
