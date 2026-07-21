// Tests for the S4 Status-history & reactivation trail (record-detail reconciliation). The activity
// thread hook is mocked so the component's filtering + states are exercised network-free.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { ActivityThreadItem, RecordId } from '@shared/types';

import { useThread } from '@/features/comments';

import { StatusHistoryTrail } from './StatusHistoryTrail';

expect.extend(toHaveNoViolations);

jest.mock('@/features/comments', () => ({ useThread: jest.fn() }));

const RECORD = 'AIS-00000001' as RecordId;

function thread(data: ActivityThreadItem[] | undefined, extra: { isLoading?: boolean; isError?: boolean } = {}) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
  } as unknown as ReturnType<typeof useThread>;
}

describe('StatusHistoryTrail', () => {
  it('StatusHistoryTrail — loading — announces via role=status', async () => {
    // Arrange
    jest.mocked(useThread).mockReturnValue(thread(undefined, { isLoading: true }));

    // Act
    const { container } = render(<StatusHistoryTrail recordId={RECORD} />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading status history…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('StatusHistoryTrail — error — shows a recovery message', async () => {
    // Arrange
    jest.mocked(useThread).mockReturnValue(thread(undefined, { isError: true }));

    // Act
    const { container } = render(<StatusHistoryTrail recordId={RECORD} />);

    // Assert
    expect(screen.getByText(/Status history couldn’t be loaded/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('StatusHistoryTrail — no status-hold events — empty state', async () => {
    // Arrange — an empty thread (and one unrelated event to prove filtering).
    jest.mocked(useThread).mockReturnValue(
      thread([
        { kind: 'event', event: { eventType: 'request.stage-changed', eventAt: '2026-07-05T10:00:00Z', summary: 'Advanced to Execution' } },
      ]),
    );

    // Act
    const { container } = render(<StatusHistoryTrail recordId={RECORD} />);

    // Assert
    expect(screen.getByText(/No status changes yet/)).toBeInTheDocument();
    expect(screen.queryByText('Advanced to Execution')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('StatusHistoryTrail — status-hold events — renders the trail, filtering out comments and other events', async () => {
    // Arrange
    jest.mocked(useThread).mockReturnValue(
      thread([
        { kind: 'event', event: { eventType: 'request.status-hold-changed', eventAt: '2026-07-11T09:00:00Z', summary: 'Placed on hold' } },
        { kind: 'event', event: { eventType: 'request.status-hold-changed', eventAt: '2026-07-18T14:00:00Z', summary: 'Reactivated' } },
        { kind: 'event', event: { eventType: 'request.stage-changed', eventAt: '2026-07-12T09:00:00Z', summary: 'Advanced' } },
        { kind: 'comment', comment: { id: 'c1', recordId: RECORD, objectType: 'Request', authorUserId: 'u1', body: 'note', mentionedUserIds: [], createdAt: '2026-07-11T10:00:00Z' } },
      ] as ActivityThreadItem[]),
    );

    // Act
    const { container } = render(<StatusHistoryTrail recordId={RECORD} />);

    // Assert — both hold events show; the stage event and the comment do not.
    expect(screen.getByText('Placed on hold')).toBeInTheDocument();
    expect(screen.getByText('Reactivated')).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });
});
