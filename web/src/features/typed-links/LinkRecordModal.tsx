// Link-a-record modal (S4/S5 Relationships card — BS §2.2). Add a typed link from this record to
// another by its ID. Modal chrome + focus trap come from the shared Modal primitive.

import { useState } from 'react';

import type { RecordId, TypedLinkCreateRequest, TypedLinkKind } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select, TextArea, TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { ADD_LINK_KIND_OPTIONS } from './linkKinds';
import { useAddLink } from './useTypedLinks';
import './typedLinks.css';

interface LinkRecordModalProps {
  recordId: RecordId;
  onClose: () => void;
}

export function LinkRecordModal({ recordId, onClose }: LinkRecordModalProps) {
  const [toRecordId, setToRecordId] = useState('');
  const [kind, setKind] = useState<TypedLinkKind>('related');
  const [rationale, setRationale] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const addLink = useAddLink(recordId);

  const targetMissing = toRecordId.trim() === '';

  const onConfirm = () => {
    setSubmitted(true);
    if (targetMissing) return;
    const request: TypedLinkCreateRequest = {
      toRecordId: toRecordId.trim() as RecordId,
      kind,
      ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
    };
    addLink.mutate(request, { onSuccess: () => onClose() });
  };

  return (
    <Modal
      title="Link a record"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={addLink.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={addLink.isPending || targetMissing}>
            {addLink.isPending ? 'Linking…' : 'Add link'}
          </Button>
        </>
      }
    >
      <Select
        label="Relationship"
        value={kind}
        onChange={(next) => setKind(next as TypedLinkKind)}
        options={ADD_LINK_KIND_OPTIONS}
      />
      <TextField
        label="Record ID"
        value={toRecordId}
        onChange={setToRecordId}
        hint="The ID of the record to link — for example, AIS-00000012."
        error={submitted && targetMissing ? 'Enter the record ID to link.' : undefined}
      />
      <TextArea label="Why" value={rationale} onChange={setRationale} optional />

      {addLink.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(addLink.error, 'The link could not be added. Try again in a moment.')}
        </p>
      )}
    </Modal>
  );
}
