// useHoldGuard (Slice 26) — reduces a record's tri-state Status/hold into a small object that a
// caller wraps around a mutating button (Task Mark Complete, Approve / Reject, Stage advance):
//
//   const { blocked, reason, disable } = useHoldGuard(request.statusHold);
//   <Button disabled={other || disable} title={reason ?? undefined} …>Approve</Button>
//
// The hook is intentionally passive — it never mutates and never fetches. Server-side, the same
// three transitions are hard-blocked at the proc layer (409 record-on-hold, api-contracts.md), so
// the hook is defence-in-depth for a friendlier UX; a stale UI still cannot bypass the guard.

import type { RequestStatusHold } from '@shared/types';

export interface HoldGuardResult {
  /** True when the record is OnHold or Abandoned. Callers should treat the guarded action as forbidden. */
  blocked: boolean;
  /** Same as {@link blocked} — supplied for the common `disabled={disable}` prop-passing pattern. */
  disable: boolean;
  /**
   * Human-readable reason for the block, suitable for a tooltip or aria-description. Null when the
   * record is InProgress (or the status is unknown yet).
   */
  reason: string | null;
  /**
   * The raw statusHold echoed back — convenient for conditional rendering
   * (e.g. showing the StatusHoldPill on the disabled control).
   */
  statusHold: RequestStatusHold | null;
}

const REASON_ON_HOLD  = 'This record is on hold. Reactivate it from the Status tab before continuing.';
const REASON_ABANDONED = 'This record is abandoned. Reactivate it from the Status tab before continuing.';

export function useHoldGuard(statusHold: RequestStatusHold | null | undefined): HoldGuardResult {
  const normalized = statusHold ?? null;
  if (normalized === 'OnHold') {
    return { blocked: true, disable: true, reason: REASON_ON_HOLD, statusHold: normalized };
  }
  if (normalized === 'Abandoned') {
    return { blocked: true, disable: true, reason: REASON_ABANDONED, statusHold: normalized };
  }
  return { blocked: false, disable: false, reason: null, statusHold: normalized };
}
