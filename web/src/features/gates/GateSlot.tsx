// One approver slot within a gate block (S4/S5). Renders the slot's team/role label plus, by state:
// an approved line ("Approved · signer · date"), a rejection line with the change-request comment and
// a "Re-request approval" action, and — while pending — a "Select your name" dropdown with Approve /
// Reject (Reject unlocks only once a name is chosen AND a comment entered) and the comment field.
// Superseded rejections are retained under a disclosure toggle. Design-system tokens only (web-styling).

import { useState } from 'react';
import { ArrowClockwise, Check, CaretDown, CaretRight, UsersThree, XCircle } from '@phosphor-icons/react';

import { Button } from '@/shared/components/Button';

import type { GateStatus, SlotView } from './gateView';
import { formatSignedAt, memberOptions } from './gateView';

interface GateSlotProps {
  view: SlotView;
  status: GateStatus;
  disabled: boolean;
  onDecision: (slotIndex: number, decidedByUserId: string, decision: 'Approved' | 'Rejected', comment?: string) => void;
  onReRequest: (slotIndex: number) => void;
}

export function GateSlot({ view, status, disabled, onDecision, onReRequest }: GateSlotProps) {
  const [selectedMember, setSelectedMember] = useState('');
  const [comment, setComment] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const { slot } = view;
  const options = memberOptions(slot);
  const commentEntered = comment.trim().length > 0;
  const canApprove = !disabled && selectedMember !== '';
  const canReject = canApprove && commentEntered;

  const decide = (decision: 'Approved' | 'Rejected') =>
    onDecision(slot.slotIndex, selectedMember, decision, comment.trim() === '' ? undefined : comment.trim());

  const showInputs = view.status === 'pending' && status !== 'resolved';

  return (
    <li className="gate-slot">
      <div className="gate-slot__head">
        <UsersThree size={18} aria-hidden className="gate-slot__team-icon" />
        <span className="gate-slot__role">{slot.roleLabel}</span>
        <span className="gate-slot__spacer" />
        {view.status === 'approved' && view.current && (
          <span className="gate-slot__decision gate-slot__decision--approved">
            <Check size={14} aria-hidden />
            Approved · {view.current.decidedByName ?? 'A teammate'} · {formatSignedAt(view.current.decidedAt)}
            {view.current.isProxy && <span className="gate-slot__proxy"> (recorded by admin)</span>}
          </span>
        )}
      </div>

      {view.status === 'rejected' && view.current && (
        <div className="gate-slot__rejection">
          <span className="gate-slot__decision gate-slot__decision--rejected">
            <XCircle size={14} aria-hidden />
            Changes requested · {view.current.decidedByName ?? 'A teammate'} · {formatSignedAt(view.current.decidedAt)}
          </span>
          {view.current.comment && <span className="gate-slot__comment">“{view.current.comment}”</span>}
          {status !== 'resolved' && (
            <Button variant="secondary" compact disabled={disabled} onClick={() => onReRequest(slot.slotIndex)}>
              <ArrowClockwise size={14} aria-hidden /> Re-request approval
            </Button>
          )}
        </div>
      )}

      {view.rejections.length > 0 && (
        <div className="gate-slot__history">
          <button
            type="button"
            className="gate-slot__history-toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyOpen ? <CaretDown size={12} aria-hidden /> : <CaretRight size={12} aria-hidden />}
            {view.rejections.length} earlier change {view.rejections.length === 1 ? 'request' : 'requests'}
          </button>
          {historyOpen && (
            <ul className="gate-slot__history-list">
              {view.rejections.map((rejection) => (
                <li key={`${rejection.decidedByUserId}-${rejection.decidedAt}`} className="gate-slot__history-item">
                  <span className="gate-slot__decision gate-slot__decision--rejected">
                    <XCircle size={14} aria-hidden />
                    Rejected · {rejection.decidedByName ?? 'A teammate'} · {formatSignedAt(rejection.decidedAt)}
                  </span>
                  {rejection.comment && <span className="gate-slot__comment">“{rejection.comment}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showInputs && (
        <div className="gate-slot__inputs">
          {options.length === 0 ? (
            <p className="gate-slot__no-members caption">
              No eligible approvers yet — add members to this team in Lifecycle &amp; gates.
            </p>
          ) : (
            <>
              <div className="gate-slot__controls">
                <select
                  className="gate-slot__select"
                  data-ds="select"
                  aria-label="Select your name"
                  value={selectedMember}
                  disabled={disabled}
                  onChange={(event) => setSelectedMember(event.target.value)}
                >
                  <option value="" disabled>
                    Select your name…
                  </option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button variant="primary" compact disabled={!canApprove} onClick={() => decide('Approved')}>
                  Approve
                </Button>
                <Button variant="destructive" compact disabled={!canReject} onClick={() => decide('Rejected')}>
                  Reject
                </Button>
              </div>
              <input
                type="text"
                className="gate-slot__comment-input"
                aria-label="Comment"
                placeholder="Comment (required to reject)"
                value={comment}
                disabled={disabled}
                onChange={(event) => setComment(event.target.value)}
              />
            </>
          )}
        </div>
      )}
    </li>
  );
}
