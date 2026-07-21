// Close-with-Outcome modal (S4/S5 — BS §8). Reached from the record's Status tab. Pick an outcome,
// add optional notes, and (for Duplicate) name the record it duplicates. On success the record
// refetches into its closed state (Display Status shows the outcome). Modal pattern + focus trap come
// from the shared Modal primitive (disclosure-surfaces.md).

import { useState } from 'react';

import type { DeliveryOutcome, LocalOutcome, Outcome, RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select, TextArea, TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useCloseRecord } from './useClose';
import './closure.css';

/** A closable outcome value (BS §8). Also the "Closed" group of the S4 Status picker. */
export type CloseOutcomeValue = DeliveryOutcome | LocalOutcome;

interface OutcomeChoice {
  value: CloseOutcomeValue;
  label: string;
  kind: Outcome['kind'];
}

/** The closable outcomes (BS §8) — delivery outcomes drive AI-side closure, local outcomes PG-side. */
const OUTCOME_CHOICES: OutcomeChoice[] = [
  { value: 'Live', label: 'Live (delivered)', kind: 'delivery' },
  { value: 'Declined', label: 'Declined', kind: 'delivery' },
  { value: 'Withdrawn', label: 'Withdrawn', kind: 'local' },
  { value: 'NotPursued', label: 'Not pursued', kind: 'local' },
  { value: 'Duplicate', label: 'Duplicate', kind: 'local' },
];

/** {value,label} options for the closable outcomes — reused by the S4 Status picker's Closed group. */
export const CLOSE_OUTCOME_OPTIONS = OUTCOME_CHOICES.map((choice) => ({ value: choice.value, label: choice.label }));

interface CloseRecordModalProps {
  recordId: RecordId;
  recordName: string;
  /** Pre-select an outcome when opened from the Status picker's Closed group. Defaults to 'Live'. */
  initialOutcome?: CloseOutcomeValue | undefined;
  onClose: () => void;
}

export function CloseRecordModal({ recordId, recordName, initialOutcome, onClose }: CloseRecordModalProps) {
  const [value, setValue] = useState<CloseOutcomeValue>(initialOutcome ?? 'Live');
  const [notes, setNotes] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const close = useCloseRecord(recordId);

  const isDuplicate = value === 'Duplicate';
  const duplicateMissing = isDuplicate && duplicateOf.trim() === '';

  const onConfirm = () => {
    setSubmitted(true);
    if (duplicateMissing) return;
    // `value` is always one of OUTCOME_CHOICES (state seeded to 'Live', set from OUTCOME_OPTIONS).
    const choice = OUTCOME_CHOICES.find((entry) => entry.value === value) ?? OUTCOME_CHOICES[0]!;
    const outcome: Outcome = {
      kind: choice.kind,
      value: choice.value,
      notes: notes.trim(),
      ...(isDuplicate ? { duplicateOfRecordId: duplicateOf.trim() as RecordId } : {}),
    };
    close.mutate({ outcome }, { onSuccess: () => onClose() });
  };

  return (
    <Modal
      title="Close this record?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={close.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={close.isPending}>
            {close.isPending ? 'Closing…' : 'Close record'}
          </Button>
        </>
      }
    >
      <p className="closure-modal__lead">
        Record an outcome for “{recordName}”. This sets the record’s final status; you can still read it
        afterward.
      </p>

      <Select
        label="Outcome"
        value={value}
        onChange={(next) => setValue(next as CloseOutcomeValue)}
        options={CLOSE_OUTCOME_OPTIONS}
      />

      {isDuplicate && (
        <TextField
          label="Duplicate of"
          value={duplicateOf}
          onChange={setDuplicateOf}
          hint="The record ID this one duplicates."
          error={submitted && duplicateMissing ? 'Name the record this duplicates.' : undefined}
        />
      )}

      <TextArea label="Notes" value={notes} onChange={setNotes} optional />

      {close.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(close.error, 'The record could not be closed. Try again in a moment.')}
        </p>
      )}
    </Modal>
  );
}
