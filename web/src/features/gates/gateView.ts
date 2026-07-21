// Pure view helpers for gates on the Tasks & gates tab — per-slot state derivation, join note,
// gate status, and timestamp formatting. No React, no I/O (web-file-structure.md). Unit-tested
// independently of the components.

import type { ApprovalDecisionDto, ApprovalRequestDto, FrozenApproverSlot } from '@shared/types';

export type SlotStatus = 'pending' | 'approved' | 'rejected';

export interface SlotView {
  slot: FrozenApproverSlot;
  /** The live (non-superseded) decision for the slot, if any. */
  current: ApprovalDecisionDto | undefined;
  /** Superseded rejections — the retained history shown under a rejected slot, oldest first. */
  rejections: ApprovalDecisionDto[];
  status: SlotStatus;
}

/** Derive each slot's current state + retained rejection history from the gate's decisions. */
export function buildSlotViews(gate: ApprovalRequestDto): SlotView[] {
  return gate.slots.map((slot) => {
    const forSlot = gate.decisions.filter((decision) => decision.slotIndex === slot.slotIndex);
    const current = forSlot.find((decision) => !decision.superseded);
    const rejections = forSlot.filter((decision) => decision.superseded && decision.decision === 'Rejected');
    const status: SlotStatus =
      current?.decision === 'Approved' ? 'approved' : current?.decision === 'Rejected' ? 'rejected' : 'pending';
    return { slot, current, rejections, status };
  });
}

/** AND-join across every slot; single-team when there is only one slot. */
export function joinNote(gate: ApprovalRequestDto): string {
  return gate.slots.length > 1
    ? `AND-join — all ${gate.slots.length} teams must approve`
    : 'Single approving team';
}

export type GateStatus = 'open' | 'blocked' | 'resolved';

/** The gate's headline state: resolved, blocked (changes requested), or open (awaiting sign-off). */
export function gateStatus(gate: ApprovalRequestDto): GateStatus {
  if (gate.state === 'Resolved') return 'resolved';
  if (gate.state === 'ChangesRequested') return 'blocked';
  return 'open';
}

/** The target-stage label a gate renders under — matches the TaskPhase group (e.g. "Validation"). */
export function gatePhaseLabel(gate: ApprovalRequestDto): string {
  return gate.toStage;
}

/** `24 Jun` short signer timestamp; empty when unparseable. FOR JSON returns UTC with no offset. */
export function formatSignedAt(iso: string | undefined): string {
  if (!iso) return '';
  const normalised = iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Name/value options for a slot's "Select your name" dropdown (frozen eligible members). */
export function memberOptions(slot: FrozenApproverSlot): { value: string; label: string }[] {
  return slot.eligibleMembers.map((member) => ({ value: member.userId, label: member.displayName }));
}
