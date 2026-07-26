// Confirm-as-duplicate modal (Phase 4, §14). A consequential, irreversible action, so it follows the
// disclosure-surface modal + ai-tool-use rules: it names the specific surviving record and states the consequence
// plainly before the user confirms. Confirming closes the current record as Duplicate, writes the duplicate-of
// link carrying the AI rationale, and notifies the requestor — all server-side.

import type { RecordId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure/Modal';
import { problemMessage } from '@/shared/http/problemMessage';

import { useConfirmDuplicate } from '../useDuplicateCheck';
import type { DuplicateCandidate } from '../types';

interface ConfirmDuplicateModalProps {
  workspaceId: WorkspaceId;
  recordId: RecordId;
  recordName: string;
  candidate: DuplicateCandidate;
  onClose: () => void;
  /** The record was closed as a duplicate — the parent closes the panel and refetches the record. */
  onConfirmed: () => void;
}

export function ConfirmDuplicateModal({
  workspaceId,
  recordId,
  recordName,
  candidate,
  onClose,
  onConfirmed,
}: ConfirmDuplicateModalProps) {
  const confirm = useConfirmDuplicate(workspaceId, recordId);

  const onConfirm = () => {
    confirm.mutate(
      { duplicateOfRecordId: candidate.recordId, rationale: candidate.rationale },
      { onSuccess: () => onConfirmed() },
    );
  };

  return (
    <Modal
      title="Mark this record as a duplicate?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={confirm.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirm.isPending}>
            {confirm.isPending ? 'Marking…' : 'Mark as duplicate'}
          </Button>
        </>
      }
    >
      <p>
        This closes “{recordName}” as a duplicate of “{candidate.title}” ({candidate.recordId}),
        links the two records, and notifies the requestor. This can’t be undone.
      </p>
      <p className="ai-duplicates__modal-rationale">{candidate.rationale}</p>
      {confirm.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(
            confirm.error,
            'The record could not be marked as a duplicate. Try again.',
          )}
        </p>
      )}
    </Modal>
  );
}
