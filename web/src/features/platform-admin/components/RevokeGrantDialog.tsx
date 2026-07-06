// S36 revoke-grant confirmation (disclosure-surfaces.md modal — a privileged change confirmed before
// it runs). Names the person losing the firm-wide Platform-admin grant. Revoking never touches the
// user's workspace memberships (the grant is additive, not a level).

import type { PrivilegedGrantDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

interface RevokeGrantDialogProps {
  grant: PrivilegedGrantDto;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function RevokeGrantDialog({ grant, onConfirm, onCancel, isPending, error }: RevokeGrantDialogProps) {
  return (
    <Modal
      title="Revoke platform admin?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Revoking…' : `Revoke ${grant.displayName}`}
          </Button>
        </>
      }
    >
      <p>
        <strong>{grant.displayName}</strong> will lose firm-wide Platform-admin access. Their workspace
        memberships are unchanged.
      </p>
      {error != null && (
        <p className="mws-alert mws-alert--error platform-admin__dialog-error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
