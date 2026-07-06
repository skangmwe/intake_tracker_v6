// S37 retire-role-label confirmation (disclosure-surfaces.md modal — a forward-only change confirmed
// before it runs). Names the consequence: retiring removes the label from NEW gate configuration but
// leaves past sign-offs and live gate slots on their captured label (BS §7.2).

import type { RoleLabelDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { problemMessage } from '@/shared/http/problemMessage';

interface RetireRoleLabelDialogProps {
  label: RoleLabelDto;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function RetireRoleLabelDialog({ label, onConfirm, onCancel, isPending, error }: RetireRoleLabelDialogProps) {
  return (
    <Modal
      title="Retire this role label?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Retiring…' : `Retire ${label.label}`}
          </Button>
        </>
      }
    >
      <p>
        <strong>{label.label}</strong> will no longer appear when configuring new gate approver slots.
        Past sign-offs and gates already using it keep the label unchanged.
      </p>
      {error != null && (
        <p className="mws-alert mws-alert--error platform-admin__dialog-error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
