// S19 Copy modal (BS §5). Copy a record into a fresh draft: choose the target workspace, whether to
// carry attachments (a no-op until the Attachments object exists — slice 11), and an optional link
// back to the source. On Continue the new draft opens in the intake form. Modal chrome + focus trap
// come from the shared Modal primitive.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { CopyRequest, LinkBackKind, RecordId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';

import { useCopyRecord } from './useTypedLinks';
import './typedLinks.css';

const LINK_BACK_OPTIONS = [
  { value: '', label: 'No link back' },
  { value: 'related', label: 'Related' },
  { value: 're-pursuit-of', label: 'Re-pursuit of' },
];

interface CopyModalProps {
  recordId: RecordId;
  currentWorkspaceId: WorkspaceId;
  onClose: () => void;
}

export function CopyModal({ recordId, currentWorkspaceId, onClose }: CopyModalProps) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const copy = useCopyRecord(recordId);

  // Only workspaces the caller can create records in are valid copy targets (Member+).
  const workspaceOptions = useMemo(
    () =>
      (me?.memberships ?? [])
        .filter((membership) => membership.level === 'Member' || membership.level === 'WorkspaceAdmin')
        .map((membership) => ({ value: membership.workspaceId, label: membership.workspaceName })),
    [me],
  );

  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>(currentWorkspaceId);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [linkBack, setLinkBack] = useState('');

  const noTargets = workspaceOptions.length === 0;

  const onConfirm = () => {
    const request: CopyRequest = {
      targetWorkspaceId: targetWorkspaceId as WorkspaceId,
      includeAttachments,
      ...(linkBack ? { linkBackKind: linkBack as LinkBackKind } : {}),
    };
    copy.mutate(request, {
      onSuccess: (result) => {
        onClose();
        navigate(`/requests/new?draftId=${result.draftId}`);
      },
    });
  };

  return (
    <Modal
      title="Copy this record?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={copy.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={copy.isPending || noTargets}>
            {copy.isPending ? 'Copying…' : 'Continue'}
          </Button>
        </>
      }
    >
      <p className="typed-links__lead">
        A new draft is created with this record’s details — a fresh ID, no outcome, and no history.
        You’ll review it before it becomes a record.
      </p>

      {noTargets ? (
        <p className="mws-alert mws-alert--warning" role="status">
          You don’t have permission to create a record in any workspace.
        </p>
      ) : (
        <Select
          label="Copy into"
          value={targetWorkspaceId}
          onChange={setTargetWorkspaceId}
          options={workspaceOptions}
        />
      )}

      <label className="typed-links__check">
        <input
          type="checkbox"
          checked={includeAttachments}
          onChange={(event) => setIncludeAttachments(event.target.checked)}
        />
        Include attachments
      </label>

      <Select
        label="Link back to source"
        value={linkBack}
        onChange={setLinkBack}
        options={LINK_BACK_OPTIONS}
      />

      {copy.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(copy.error, 'The record could not be copied. Try again in a moment.')}
        </p>
      )}
    </Modal>
  );
}
