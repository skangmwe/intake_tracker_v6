// Unit tests for the pure gate view helpers (web-testing.md). Logic-only — no DOM, so no axe assertion.

import { buildApprovalRequest } from '@/test-utils';

import type { UserId } from '@shared/types';

import { buildSlotViews, formatSignedAt, gateStatus, joinNote, memberOptions } from './gateView';

describe('gateView helpers', () => {
  it('buildSlotViews — no decisions — slot is pending', () => {
    // Arrange
    const gate = buildApprovalRequest();

    // Act
    const views = buildSlotViews(gate);

    // Assert
    expect(views).toHaveLength(1);
    expect(views[0]!.status).toBe('pending');
    expect(views[0]!.current).toBeUndefined();
    expect(views[0]!.rejections).toHaveLength(0);
  });

  it('buildSlotViews — live approval — slot is approved', () => {
    // Arrange
    const gate = buildApprovalRequest({
      decisions: [
        { slotIndex: 0, decision: 'Approved', decidedByName: 'Casey', decidedAt: '2026-07-04T18:05:00', isProxy: false, superseded: false },
      ],
    });

    // Act
    const view = buildSlotViews(gate)[0]!;

    // Assert
    expect(view.status).toBe('approved');
    expect(view.current?.decidedByName).toBe('Casey');
  });

  it('buildSlotViews — live rejection with a superseded rejection — status rejected, history retained', () => {
    // Arrange
    const gate = buildApprovalRequest({
      state: 'ChangesRequested',
      decisions: [
        { slotIndex: 0, decision: 'Rejected', decidedByName: 'Casey', decidedAt: '2026-07-04T18:01:00', comment: 'First pass', isProxy: false, superseded: true },
        { slotIndex: 0, decision: 'Rejected', decidedByName: 'Dana', decidedAt: '2026-07-04T18:06:00', comment: 'Add a load test', isProxy: false, superseded: false },
      ],
    });

    // Act
    const view = buildSlotViews(gate)[0]!;

    // Assert
    expect(view.status).toBe('rejected');
    expect(view.current?.comment).toBe('Add a load test');
    expect(view.rejections).toHaveLength(1);
    expect(view.rejections[0]!.decidedByName).toBe('Casey');
  });

  it('joinNote — single slot vs AND-join', () => {
    // Arrange
    const single = buildApprovalRequest();
    const both = buildApprovalRequest({
      slots: [
        { slotIndex: 0, roleLabel: 'GCO', displayLabel: 'GCO', eligibleMembers: [] },
        { slotIndex: 1, roleLabel: 'InfoSec', displayLabel: 'InfoSec', eligibleMembers: [] },
      ],
    });

    // Act + Assert
    expect(joinNote(single)).toBe('Single approving team');
    expect(joinNote(both)).toBe('AND-join — all 2 teams must approve');
  });

  it('gateStatus — maps gate state to open / blocked / resolved', () => {
    // Act + Assert
    expect(gateStatus(buildApprovalRequest({ state: 'Pending' }))).toBe('open');
    expect(gateStatus(buildApprovalRequest({ state: 'ChangesRequested' }))).toBe('blocked');
    expect(gateStatus(buildApprovalRequest({ state: 'Resolved' }))).toBe('resolved');
  });

  it('memberOptions — maps frozen members to name/value options', () => {
    // Arrange
    const slot = buildApprovalRequest().slots[0]!;

    // Act
    const options = memberOptions(slot);

    // Assert
    expect(options).toEqual([{ value: 'user-casey', label: 'Casey Okafor' }]);
  });

  it('formatSignedAt — appends Z to an offset-less UTC timestamp; empty on garbage', () => {
    // Act + Assert
    expect(formatSignedAt('2026-07-04T18:00:00')).not.toBe('');
    expect(formatSignedAt('not a date')).toBe('');
    expect(formatSignedAt(undefined)).toBe('');
  });

  it('memberOptions — empty roster yields no options', () => {
    // Arrange
    const slot = { slotIndex: 0, roleLabel: 'GCO', displayLabel: 'GCO', eligibleMembers: [] as { userId: UserId; displayName: string }[] };

    // Act + Assert
    expect(memberOptions(slot)).toHaveLength(0);
  });
});
