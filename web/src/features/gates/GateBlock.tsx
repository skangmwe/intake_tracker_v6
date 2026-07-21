// A gate block on the Tasks & gates tab (S4/S5) — renders inline within its target phase group.
// Header: seal-check + gate name + "Gate · fires on Execution → Validation" transition pill, plus a
// "Changes requested" chip while a slot is rejected, the AND-join note while open, or a "Resolved"
// chip once every slot is approved. Below: one GateSlot per frozen approver slot. Design-system
// tokens only (web-styling.md); data-ds pairs it against the prototype's gate block.

import { Check, SealCheck, WarningCircle } from '@phosphor-icons/react';

import type { ApprovalRequestDto } from '@shared/types';

import { GateSlot } from './GateSlot';
import { buildSlotViews, gateStatus, joinNote } from './gateView';
import './gates.css';

interface GateBlockProps {
  gate: ApprovalRequestDto;
  disabled: boolean;
  onDecision: (
    approvalRequestId: string,
    slotIndex: number,
    decidedByUserId: string,
    decision: 'Approved' | 'Rejected',
    comment?: string,
  ) => void;
  onReRequest: (approvalRequestId: string, slotIndex: number) => void;
}

export function GateBlock({ gate, disabled, onDecision, onReRequest }: GateBlockProps) {
  const status = gateStatus(gate);
  const slots = buildSlotViews(gate);

  return (
    <section className="gate-block" data-ds="gate" aria-label={`Gate: ${gate.gateName}`}>
      <div className="gate-block__header">
        <SealCheck size={20} aria-hidden className="gate-block__seal" />
        <span className="gate-block__name">{gate.gateName}</span>
        <span className="gate-block__transition">
          Gate · fires on {gate.fromStage} → {gate.toStage}
        </span>
        <span className="gate-block__spacer" />
        {status === 'blocked' && (
          <span className="gate-block__chip gate-block__chip--changes">
            <WarningCircle size={12} aria-hidden />
            Changes requested
          </span>
        )}
        {status === 'open' && <span className="gate-block__join caption">{joinNote(gate)}</span>}
        {status === 'resolved' && (
          <span className="gate-block__chip gate-block__chip--resolved">
            <Check size={12} aria-hidden />
            Resolved
          </span>
        )}
      </div>

      <ul className="gate-block__slots">
        {slots.map((view) => (
          <GateSlot
            key={`${view.slot.slotIndex}-${view.current?.decidedAt ?? 'pending'}`}
            view={view}
            status={status}
            disabled={disabled}
            onDecision={(slotIndex, decidedByUserId, decision, comment) =>
              onDecision(gate.id, slotIndex, decidedByUserId, decision, comment)
            }
            onReRequest={(slotIndex) => onReRequest(gate.id, slotIndex)}
          />
        ))}
      </ul>
    </section>
  );
}
