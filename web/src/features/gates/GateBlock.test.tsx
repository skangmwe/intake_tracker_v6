// Component tests for GateBlock + its real GateSlot child (S4/S5). Covers each meaningfully different
// rendered state — pending with an eligible roster, pending with an empty roster, approved/resolved,
// rejected (changes requested) with the re-review + history toggle — plus the approve / reject-needs-
// comment / re-request interactions, each with a jest-axe assertion (web-testing.md).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildApprovalRequest } from '@/test-utils';

import { GateBlock } from './GateBlock';

function renderGate(gate = buildApprovalRequest(), disabled = false) {
  const onDecision = jest.fn();
  const onReRequest = jest.fn();
  const utils = render(
    <GateBlock gate={gate} disabled={disabled} onDecision={onDecision} onReRequest={onReRequest} />,
  );
  return { ...utils, onDecision, onReRequest };
}

describe('GateBlock', () => {
  it('GateBlock — pending gate — renders the transition pill, join note, and name picker', async () => {
    // Act
    const { container } = renderGate();

    // Assert
    expect(screen.getByText('QA readiness gate')).toBeInTheDocument();
    expect(screen.getByText('Gate · fires on Execution → Validation')).toBeInTheDocument();
    expect(screen.getByText('Single approving team')).toBeInTheDocument();
    expect(screen.getByLabelText('Select your name')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GateBlock — pending gate, empty roster — shows the no-approvers note instead of inputs', async () => {
    // Arrange
    const gate = buildApprovalRequest({
      slots: [{ slotIndex: 0, roleLabel: 'GCO', displayLabel: 'GCO', eligibleMembers: [] }],
    });

    // Act
    const { container } = renderGate(gate);

    // Assert
    expect(screen.getByText(/No eligible approvers yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Select your name')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GateBlock — approve requires a name; then calls onDecision with Approved', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onDecision } = renderGate();
    const approve = screen.getByRole('button', { name: 'Approve' });

    // Assert — disabled until a name is chosen.
    expect(approve).toBeDisabled();

    // Act
    await user.selectOptions(screen.getByLabelText('Select your name'), 'user-casey');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    // Assert
    expect(onDecision).toHaveBeenCalledWith('gate-1', 0, 'user-casey', 'Approved', undefined);
  });

  it('GateBlock — reject unlocks only with a name AND a comment', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onDecision } = renderGate();
    const reject = screen.getByRole('button', { name: 'Reject' });

    // Act 1 — a name alone leaves Reject disabled.
    await user.selectOptions(screen.getByLabelText('Select your name'), 'user-casey');
    expect(reject).toBeDisabled();

    // Act 2 — add a comment.
    await user.type(screen.getByLabelText('Comment'), 'Add a load test first');
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    // Assert
    expect(onDecision).toHaveBeenCalledWith('gate-1', 0, 'user-casey', 'Rejected', 'Add a load test first');
  });

  it('GateBlock — resolved gate — shows the approved line and the Resolved chip, no inputs', async () => {
    // Arrange
    const gate = buildApprovalRequest({
      state: 'Resolved',
      resolvedAt: '2026-07-04T18:10:00Z',
      decisions: [
        { slotIndex: 0, decision: 'Approved', decidedByName: 'Casey Okafor', decidedAt: '2026-07-04T18:10:00', isProxy: false, superseded: false },
      ],
    });

    // Act
    const { container } = renderGate(gate);

    // Assert
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText(/Approved · Casey Okafor/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Select your name')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GateBlock — rejected gate — Changes requested chip, comment, and a working Re-request action', async () => {
    // Arrange
    const user = userEvent.setup();
    const gate = buildApprovalRequest({
      state: 'ChangesRequested',
      decisions: [
        { slotIndex: 0, decision: 'Rejected', decidedByName: 'Casey Okafor', decidedAt: '2026-07-04T18:06:00', comment: 'Needs a load test', isProxy: false, superseded: false },
      ],
    });
    const { container, onReRequest } = renderGate(gate);

    // Assert — the blocker is visible with its comment.
    expect(screen.getByText('Changes requested')).toBeInTheDocument();
    expect(screen.getByText('“Needs a load test”')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — re-request the slot.
    await user.click(screen.getByRole('button', { name: /Re-request approval/i }));

    // Assert
    expect(onReRequest).toHaveBeenCalledWith('gate-1', 0);
  });

  it('GateBlock — rejection history toggle reveals earlier change requests', async () => {
    // Arrange
    const user = userEvent.setup();
    const gate = buildApprovalRequest({
      state: 'ChangesRequested',
      decisions: [
        { slotIndex: 0, decision: 'Rejected', decidedByName: 'Priya', decidedAt: '2026-07-04T17:00:00', comment: 'First concern', isProxy: false, superseded: true },
        { slotIndex: 0, decision: 'Rejected', decidedByName: 'Casey', decidedAt: '2026-07-04T18:06:00', comment: 'Second concern', isProxy: false, superseded: false },
      ],
    });
    const { container } = renderGate(gate);
    const toggle = screen.getByRole('button', { name: /earlier change request/i });

    // Assert — history is collapsed by default.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('“First concern”')).not.toBeInTheDocument();

    // Act
    await user.click(toggle);

    // Assert
    expect(screen.getByText('“First concern”')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GateBlock — disabled — the approve/reject controls do not fire', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onDecision } = renderGate(buildApprovalRequest(), true);

    // Act — the select is disabled, so no name can be chosen and Approve stays disabled.
    const select = screen.getByLabelText('Select your name');
    expect(select).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    // Assert
    expect(onDecision).not.toHaveBeenCalled();
  });
});
