// The "New dashboard" side sheet (S6, slice 28): a name + a Shared/Personal visibility choice. On
// create it hands a DashboardComposeRequest to the caller, which persists it and switches to the new
// (empty) dashboard in edit-layout mode.

import { useState } from 'react';

import type { DashboardComposeRequest } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';

import { ComposerSheet } from './ComposerSheet';
import { SegmentedToggle } from './SegmentedToggle';

type Visibility = 'Shared' | 'Personal';

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: Visibility; label: string }> = [
  { value: 'Shared', label: 'Shared' },
  { value: 'Personal', label: 'Personal' },
];

interface NewDashboardSheetProps {
  onCreate: (request: DashboardComposeRequest) => void;
  onClose: () => void;
  isPending: boolean;
  error?: string | null;
}

export function NewDashboardSheet({ onCreate, onClose, isPending, error }: NewDashboardSheetProps) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('Shared');
  const [showNameError, setShowNameError] = useState(false);

  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) {
      setShowNameError(true);
      return;
    }
    onCreate({ name: trimmed, visibility, objectType: 'Request' });
  };

  const footer = (
    <>
      <Button variant="primary" onClick={submit} disabled={isPending}>
        {isPending ? 'Creating…' : 'Create dashboard'}
      </Button>
      <Button variant="secondary" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
    </>
  );

  return (
    <ComposerSheet title="New dashboard" onClose={onClose} footer={footer}>
      <p className="dash-sheet__lead">
        Create a dashboard, then add and arrange widgets. Shared dashboards are visible to the whole
        workspace; personal ones are only yours.
      </p>

      <TextField
        label="Name"
        value={name}
        onChange={(value) => {
          setName(value);
          setShowNameError(false);
        }}
        placeholder="e.g. Tax delivery"
      />
      {showNameError && !trimmed && (
        <p className="dash-sheet__error" role="alert">
          Enter a name for this dashboard.
        </p>
      )}

      <SegmentedToggle
        label="Visibility"
        value={visibility}
        options={VISIBILITY_OPTIONS}
        onChange={setVisibility}
      />

      {error && (
        <p className="mws-alert mws-alert--error" role="alert">
          {error}
        </p>
      )}
    </ComposerSheet>
  );
}
