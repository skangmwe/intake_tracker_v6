// Autosave state indicator for the S31 surface. The lifecycle/stage/gate structure saves
// automatically after edits pause; this pill reflects that (app-shell-and-headers.md save-state
// rules). Announced via an aria-live region so screen-reader users hear the state change.

import { CircleDashed, CircleNotch, CloudCheck, WarningCircle } from '@phosphor-icons/react';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface AutosaveStatusProps {
  state: SaveState;
  error?: string | null;
}

const LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  error: 'Couldn’t save',
};

export function AutosaveStatus({ state, error }: AutosaveStatusProps) {
  const label = state === 'error' && error ? error : LABELS[state];
  return (
    <span className="lifecycle-autosave" data-state={state} role="status" aria-live="polite">
      {state === 'saved' && <CloudCheck size={16} aria-hidden />}
      {state === 'saving' && <CircleNotch size={16} aria-hidden className="lifecycle-spin" />}
      {state === 'unsaved' && <CircleDashed size={16} aria-hidden />}
      {state === 'error' && <WarningCircle size={16} aria-hidden />}
      {label}
    </span>
  );
}
