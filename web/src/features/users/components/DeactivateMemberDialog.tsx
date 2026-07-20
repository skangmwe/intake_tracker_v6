// S29 remove-from-workspace confirmation (disclosure-surfaces.md modal — destructive action confirmed
// before it runs). Names the specific consequence (ux-copy-and-microcopy.md); the destructive action
// button names the member. Removing disables the account AND drops the membership; it is distinct from
// Suspend (which only disables and keeps the row). A pending named-individual sign-off comes back as a
// 409 and renders inline so the admin sees why it was blocked (BS §6.8).

import type { WorkspaceMemberDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

interface DeactivateMemberDialogProps {
  member: WorkspaceMemberDto;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function DeactivateMemberDialog({ member, onConfirm, onCancel, isPending, error }: DeactivateMemberDialogProps) {
  return (
    <Modal
      title="Remove this member?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Removing…' : `Remove ${member.displayName}`}
          </Button>
        </>
      }
    >
      <p>
        This removes <strong>{member.displayName}</strong> from this workspace and disables their
        account. Records they were named on stay visible as orphaned references for an admin to
        reassign. This can&rsquo;t be undone. To keep them in the workspace but block access, suspend
        them instead.
      </p>
      {error != null && (
        <p className="mws-alert mws-alert--error users-access__dialog-error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
