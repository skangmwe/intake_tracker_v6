// Tests for the S4 Active-alerts card (record-detail reconciliation). The gates hook is mocked so
// the card's composition + empty state are exercised network-free.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { ApprovalRequestDto } from '@shared/types';

import { buildApprovalRequest, buildRequestDto } from '@/test-utils';
import { useApprovalRequests } from '@/features/gates';

import { ActiveAlerts } from './ActiveAlerts';

expect.extend(toHaveNoViolations);

jest.mock('@/features/gates', () => ({ useApprovalRequests: jest.fn() }));

function gates(data: ApprovalRequestDto[]) {
  return { data } as unknown as ReturnType<typeof useApprovalRequests>;
}

beforeEach(() => {
  jest.mocked(useApprovalRequests).mockReturnValue(gates([]));
});

describe('ActiveAlerts', () => {
  it('ActiveAlerts — nothing pressing — empty state', async () => {
    // Arrange — on-track, in progress, no gates.
    const { container } = render(
      <ActiveAlerts request={buildRequestDto({ slaStatus: 'OnTrack', statusHold: 'InProgress' })} />,
    );

    // Assert
    expect(screen.getByText(/Nothing needs attention right now/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ActiveAlerts — overdue and on hold — surfaces both alerts with the hold reason', async () => {
    // Arrange
    const request = buildRequestDto({ slaStatus: 'Overdue', statusHold: 'OnHold', statusHoldNote: 'Waiting on client' });

    // Act
    const { container } = render(<ActiveAlerts request={request} />);

    // Assert
    expect(screen.getByText('Past the due date')).toBeInTheDocument();
    expect(screen.getByText('On hold')).toBeInTheDocument();
    expect(screen.getByText('Waiting on client')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ActiveAlerts — a pending gate — surfaces an awaiting-sign-off alert', async () => {
    // Arrange
    jest.mocked(useApprovalRequests).mockReturnValue(
      gates([buildApprovalRequest({ state: 'Pending', gateName: 'Validation readiness gate' })]),
    );

    // Act
    const { container } = render(<ActiveAlerts request={buildRequestDto()} />);

    // Assert
    expect(screen.getByText('Validation readiness gate awaiting sign-off')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
