// StatusHoldPill (Slice 26) — the visual for a record's tri-state Status/hold. Reuses the shared
// pill chrome so it sits comfortably next to other `data-ds="status-pill"` badges. Copy and colour
// pair together — colour is never the sole signal (notifications-and-feedback.md). InProgress is
// deliberately absent by default (a record in its normal state has no chrome to add); pass
// `alwaysRender` when the caller needs a placeholder to preserve layout.

import type { RequestStatusHold } from '@shared/types';

interface StatusHoldPillProps {
  statusHold: RequestStatusHold | null | undefined;
  /** Render the "In progress" state too. Default false — the InProgress state is usually implicit. */
  alwaysRender?: boolean;
}

const VARIANT: Record<RequestStatusHold, { className: string; label: string }> = {
  InProgress: { className: 'mws-badge mws-badge--live',    label: 'In progress' },
  OnHold:     { className: 'mws-badge mws-badge--pending', label: 'On hold' },
};

export function StatusHoldPill({ statusHold, alwaysRender = false }: StatusHoldPillProps) {
  if (!statusHold) return null;
  if (statusHold === 'InProgress' && !alwaysRender) return null;

  const variant = VARIANT[statusHold];
  return (
    <span className={variant.className} data-ds="status-pill" data-status-hold={statusHold}>
      {variant.label}
    </span>
  );
}
