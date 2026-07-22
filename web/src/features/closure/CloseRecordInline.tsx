// Close-with-Outcome inline panel (S4/S5 — BS §8). Reached from the record's Status tab: picking a
// "Closed" outcome from the Status picker reveals this panel in place (like the on-hold note), not a
// pop-up. The outcome itself comes from the picker; here the user adds optional notes, names the
// duplicated record (for Duplicate), and confirms. On success the record refetches into its closed
// state (Display Status shows the outcome).

import { useState } from 'react';

import type { DeliveryOutcome, LocalOutcome, Outcome, RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextArea, TextField } from '@/shared/components/Form';
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

interface CloseRecordInlineProps {
  recordId: RecordId;
  recordName: string;
  /** The outcome picked in the Status picker's Closed group — drives kind and the Duplicate branch. */
  outcome: CloseOutcomeValue;
  /** Abandon the close and restore the picker to its active state. */
  onCancel: () => void;
  /** The record was closed — the parent clears this panel; the record refetches into its closed state. */
  onClosed: () => void;
}

export function CloseRecordInline({ recordId, recordName, outcome, onCancel, onClosed }: CloseRecordInlineProps) {
  const [notes, setNotes] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const close = useCloseRecord(recordId);

  const isDuplicate = outcome === 'Duplicate';
  const duplicateMissing = isDuplicate && duplicateOf.trim() === '';

  const onConfirm = () => {
    setSubmitted(true);
    if (duplicateMissing) return;
    // `outcome` is always one of OUTCOME_CHOICES (the value the Status picker's Closed group offers).
    const choice = OUTCOME_CHOICES.find((entry) => entry.value === outcome) ?? OUTCOME_CHOICES[0]!;
    const built: Outcome = {
      kind: choice.kind,
      value: choice.value,
      notes: notes.trim(),
      ...(isDuplicate ? { duplicateOfRecordId: duplicateOf.trim() as RecordId } : {}),
    };
    close.mutate({ outcome: built }, { onSuccess: () => onClosed() });
  };

  return (
    <div className="closure-inline">
      <p className="closure-inline__lead">
        Record an outcome for “{recordName}”. This sets the record’s final status; you can still read it
        afterward.
      </p>

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

      <div className="closure-inline__actions">
        <Button variant="secondary" onClick={onCancel} disabled={close.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={close.isPending}>
          {close.isPending ? 'Closing…' : 'Close record'}
        </Button>
      </div>
    </div>
  );
}
